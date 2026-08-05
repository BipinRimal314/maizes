import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid } from './levelFormat'
import { createGame, stepGame } from './game'
import { explore } from './explorer'

/**
 * Play every level with a simulated player who cannot see the maze, and check
 * the result is survivable.
 *
 * This exists because three separate bugs were invisible to every other test:
 * the apparition was armed on all twenty-three non-fog-free levels purely by
 * era and killed a blind player dozens of times per level; traps could be
 * placed so that the only route to a flag ran through one, making levels
 * unwinnable outright; and a flagless death loop looked fine to any test that
 * only asked "is there a path".
 *
 * What this can and cannot tell you: the explorer is deliberately unclever, so
 * a level it fails to finish is a level worth looking at, not proof of a bug —
 * two currently stall because it oscillates rather than because they are
 * impossible, and both are covered by autoplay.test.js and the safe-reach
 * invariant in levelData.test.js. What it does prove is that no level punishes
 * an ordinary player dozens of times over, which is what a regression here
 * would look like.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

//: A blind, memoryless-of-strategy player should not die more than this on any
//: level. Before the fixes the same run produced 8571.
const DEATH_CEILING = 20

//: Two levels stall on the explorer's own timidity, not on the level.
const MIN_COMPLETION_RATE = 0.85

function play(level) {
  const game = createGame(decodeGrid(level.maze), {
    era: level.era,
    fogRadius: level.fog_radius,
    deathMode: level.death_mode,
    apparition: level.apparition,
  })
  return explore(game, stepGame)
}

describe('a player who cannot see the maze', () => {
  const results = curated.map((level) => ({ level, result: play(level) }))

  it('is never punished dozens of times on one level', () => {
    for (const { level, result } of results) {
      const causes = Object.entries(result.deathsByCause)
        .map(([cause, n]) => `${cause}:${n}`)
        .join(' ')
      expect(result.deaths, `${level.name} killed the player ${result.deaths} times (${causes})`)
        .toBeLessThanOrEqual(DEATH_CEILING)
    }
  })

  it('is never killed repeatedly by the apparition', () => {
    // the mechanic is meant to punish backtracking, not ordinary exploration
    for (const { level, result } of results) {
      const stalker = result.deathsByCause.stalker || 0
      expect(stalker, `${level.name}: ${stalker} apparition deaths`).toBeLessThanOrEqual(5)
    }
  })

  it('finishes the great majority of levels', () => {
    const won = results.filter((r) => r.result.won).length
    const rate = won / results.length
    const stuck = results.filter((r) => !r.result.won).map((r) => r.level.name)
    expect(rate, `only ${won}/${results.length} finished; stuck on ${stuck.join(', ')}`)
      .toBeGreaterThanOrEqual(MIN_COMPLETION_RATE)
  })
})

describe('the apparition is designed in, not inherited', () => {
  it('is on a deliberate handful of levels rather than every hard one', () => {
    const hunted = curated.filter((l) => l.apparition)
    expect(hunted.length).toBeGreaterThan(0)
    expect(hunted.length).toBeLessThanOrEqual(5)
  })

  it('never shares a level with fog', () => {
    // fog forces backtracking; the apparition punishes it. One level cannot ask
    // for both.
    for (const level of curated) {
      if (!level.apparition) continue
      expect(level.fog_radius, `${level.name} has fog and an apparition`).toBeNull()
    }
  })

  it('is off in the learning chapter entirely', () => {
    for (const level of curated) {
      if (level.era !== 'learning') continue
      expect(level.apparition, `${level.name}`).toBeFalsy()
    }
  })
})

describe('flags are reachable without dying', () => {
  const SIDES = [
    { n: 'top', dx: 0, dy: -1, o: 'bottom' },
    { n: 'right', dx: 1, dy: 0, o: 'left' },
    { n: 'bottom', dx: 0, dy: 1, o: 'top' },
    { n: 'left', dx: -1, dy: 0, o: 'right' },
  ]
  const GATE = { up: 'bottom', down: 'top', left: 'right', right: 'left' }
  const at = (g, x, y) => (x < 0 || x >= g.cols || y < 0 || y >= g.rows ? null : g.cells[y * g.cols + x])

  function safeReachable(grid) {
    const seen = new Set([`${grid.start.x},${grid.start.y}`])
    const queue = [[grid.start.x, grid.start.y]]
    while (queue.length) {
      const [x, y] = queue.shift()
      const cell = at(grid, x, y)
      for (const side of SIDES) {
        if (cell.walls[side.n]) continue
        if (cell.gate && GATE[cell.gate.direction] === side.n) continue
        const next = at(grid, x + side.dx, y + side.dy)
        if (!next || next.walls[side.o]) continue
        if (next.trap || next.mimic) continue
        const key = `${x + side.dx},${y + side.dy}`
        if (seen.has(key)) continue
        seen.add(key)
        queue.push([x + side.dx, y + side.dy])
      }
    }
    return seen
  }

  /**
   * On the harder death modes a death wipes the flags you have captured, so a
   * flag that can only be reached by dying is a flag you can never bank. Three
   * levels shipped with all three flags behind traps.
   */
  it('every flag can be captured without stepping on anything lethal', () => {
    for (const level of curated) {
      const grid = decodeGrid(level.maze)
      const safe = safeReachable(grid)
      for (const cell of grid.cells) {
        if (cell.modifier !== 'fakeExit') continue
        expect(
          safe.has(`${cell.x},${cell.y}`),
          `${level.name}: flag at (${cell.x},${cell.y}) is only reachable by dying`
        ).toBe(true)
      }
    }
  })

  it('the exit can be reached without stepping on anything lethal', () => {
    for (const level of curated) {
      const grid = decodeGrid(level.maze)
      const safe = safeReachable(grid)
      expect(safe.has(`${grid.end.x},${grid.end.y}`), level.name).toBe(true)
    }
  })
})
