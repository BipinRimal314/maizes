import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid, visibleWalls } from './levelFormat'
import { RETIRED_MODIFIERS, MODIFIER_TYPES } from './obstacles'
import { LEVELS as HAND_CRAFTED } from './levels'

/**
 * Invariants on the shipped level set.
 *
 * Every one of these encodes something that was actually wrong: chapters named
 * for a mechanic they did not have, levels solvable in a single move, the same
 * maze shipped three times, and a deception layer that was never placed.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

const SIDES = [
  { name: 'top', dx: 0, dy: -1, bit: 1, opposite: 4 },
  { name: 'right', dx: 1, dy: 0, bit: 2, opposite: 8 },
  { name: 'bottom', dx: 0, dy: 1, bit: 4, opposite: 1 },
  { name: 'left', dx: -1, dy: 0, bit: 8, opposite: 2 },
]

const GATE_BLOCKS = { up: 'bottom', down: 'top', left: 'right', right: 'left' }

function wallBits(cell) {
  return (cell.walls.top ? 1 : 0) | (cell.walls.right ? 2 : 0)
    | (cell.walls.bottom ? 4 : 0) | (cell.walls.left ? 8 : 0)
}

function cellAt(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

/** BFS with gates treated as immediately one-way — stricter than the game. */
function solve(grid) {
  const key = (x, y) => `${x},${y}`
  const previous = new Map([[key(grid.start.x, grid.start.y), null]])
  const queue = [[grid.start.x, grid.start.y]]

  while (queue.length) {
    const [x, y] = queue.shift()
    if (x === grid.end.x && y === grid.end.y) {
      const path = []
      let at = key(x, y)
      while (at !== null) {
        path.push(at)
        at = previous.get(at)
      }
      return path
    }

    const cell = cellAt(grid, x, y)
    for (const side of SIDES) {
      if (wallBits(cell) & side.bit) continue
      if (cell.gate && GATE_BLOCKS[cell.gate.direction] === side.name) continue

      const next = cellAt(grid, x + side.dx, y + side.dy)
      if (!next) continue
      if (wallBits(next) & side.opposite) continue

      const nextKey = key(x + side.dx, y + side.dy)
      if (previous.has(nextKey)) continue
      previous.set(nextKey, key(x, y))
      queue.push([x + side.dx, y + side.dy])
    }
  }

  return null
}

/** BFS over the maze *as drawn*, i.e. with liar walls applied. */
function solveVisible(grid) {
  const visible = (cell) => visibleWalls(cell)
  const bits = (cell) => {
    const w = visible(cell)
    return (w.top ? 1 : 0) | (w.right ? 2 : 0) | (w.bottom ? 4 : 0) | (w.left ? 8 : 0)
  }

  const seen = new Set([`${grid.start.x},${grid.start.y}`])
  const queue = [[grid.start.x, grid.start.y]]

  while (queue.length) {
    const [x, y] = queue.shift()
    if (x === grid.end.x && y === grid.end.y) return true
    const cell = cellAt(grid, x, y)
    for (const side of SIDES) {
      if (bits(cell) & side.bit) continue
      if (cell.gate && GATE_BLOCKS[cell.gate.direction] === side.name) continue
      const next = cellAt(grid, x + side.dx, y + side.dy)
      if (!next) continue
      if (bits(next) & side.opposite) continue
      const key = `${x + side.dx},${y + side.dy}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push([x + side.dx, y + side.dy])
    }
  }

  return false
}

function reachable(grid) {
  const seen = new Set([`${grid.start.x},${grid.start.y}`])
  const queue = [[grid.start.x, grid.start.y]]

  while (queue.length) {
    const [x, y] = queue.shift()
    const cell = cellAt(grid, x, y)
    for (const side of SIDES) {
      if (wallBits(cell) & side.bit) continue
      if (cell.gate && GATE_BLOCKS[cell.gate.direction] === side.name) continue
      const next = cellAt(grid, x + side.dx, y + side.dy)
      if (!next) continue
      if (wallBits(next) & side.opposite) continue
      const nextKey = `${x + side.dx},${y + side.dy}`
      if (seen.has(nextKey)) continue
      seen.add(nextKey)
      queue.push([x + side.dx, y + side.dy])
    }
  }

  return seen
}

const decoded = curated.map((level) => ({
  name: level.name,
  era: level.era,
  fogRadius: level.fog_radius,
  grid: decodeGrid(level.maze),
}))

describe('solvability', () => {
  it('every curated level can be finished', () => {
    for (const level of decoded) {
      expect(solve(level.grid), `${level.name} has no route to the exit`).not.toBeNull()
    }
  })

  it('every hand-crafted level can be finished', () => {
    for (const level of HAND_CRAFTED) {
      expect(solve(level.grid), `${level.name} has no route to the exit`).not.toBeNull()
    }
  })

  it('every false exit is reachable, or the real exit never unlocks', () => {
    for (const level of decoded) {
      const seen = reachable(level.grid)
      for (const cell of level.grid.cells) {
        if (cell.modifier !== 'fakeExit') continue
        expect(seen.has(`${cell.x},${cell.y}`), `${level.name} (${cell.x},${cell.y})`).toBe(true)
      }
    }
  })
})

describe('legibility', () => {
  /**
   * A liar wall that seals the drawn maze does not read as deception, it reads
   * as a broken game — and the player is right to stop. Eight of twenty-five
   * levels shipped with no visible route to the exit, including the second
   * level of the second chapter.
   */
  it('always shows the player some route to the exit', () => {
    for (const level of decoded) {
      expect(
        solveVisible(level.grid),
        `${level.name}: the maze as drawn has no route to the exit`
      ).toBe(true)
    }
  })

  it('still lies somewhere — the drawn maze is not just the real one', () => {
    const lying = decoded.filter((l) => l.grid.cells.some((c) => c.liarWalls))
    expect(lying.length).toBeGreaterThan(decoded.length / 2)
  })
})

describe('fairness', () => {
  it('puts no trap or mimic on the only route through', () => {
    for (const level of decoded) {
      const path = new Set(solve(level.grid))
      for (const cell of level.grid.cells) {
        const key = `${cell.x},${cell.y}`
        if (!path.has(key)) continue
        expect(cell.trap, `${level.name} trap on solution at ${key}`).toBe(false)
        expect(cell.mimic, `${level.name} mimic on solution at ${key}`).toBe(false)
      }
    }
  })

  it('never disguises the real exit as something else', () => {
    for (const level of decoded) {
      const exit = cellAt(level.grid, level.grid.end.x, level.grid.end.y)
      expect(exit.trap).toBe(false)
      expect(exit.mimic).toBe(false)
    }
  })
})

describe('level shape', () => {
  // "The Fog 2/3/4" and "No Mercy 1/4" shipped with the exit one or two cells
  // from the start, because solution_opacity divided by Manhattan distance and
  // a tiny denominator scored enormously.
  it('never places the exit next door to the start', () => {
    for (const level of decoded) {
      const { start, end, cols, rows } = level.grid
      const manhattan = Math.abs(start.x - end.x) + Math.abs(start.y - end.y)
      const floor = (cols + rows) * 0.25
      expect(manhattan, `${level.name} start and exit are ${manhattan} apart`)
        .toBeGreaterThanOrEqual(floor)
    }
  })

  it('gives every level a route worth walking', () => {
    for (const level of decoded) {
      const path = solve(level.grid)
      const minimum = (level.grid.cols + level.grid.rows) * 0.5
      expect(path.length, `${level.name} is solvable in ${path.length} moves`)
        .toBeGreaterThanOrEqual(minimum)
    }
  })

  it('ships no two levels that are the same maze', () => {
    const signatures = decoded.map((level) => ({
      name: level.name,
      walls: level.grid.cells.map(wallBits).join(','),
    }))

    for (let i = 0; i < signatures.length; i++) {
      for (let j = i + 1; j < signatures.length; j++) {
        if (signatures[i].walls.length !== signatures[j].walls.length) continue
        expect(
          signatures[i].walls === signatures[j].walls,
          `${signatures[i].name} and ${signatures[j].name} are the same maze`
        ).toBe(false)
      }
    }
  })
})

describe('chapters deliver what they are named for', () => {
  it('gives every punishing and sadistic level fog', () => {
    for (const level of decoded) {
      if (level.era === 'learning') continue
      expect(level.fogRadius, `${level.name} is "${level.era}" with no fog`).toBeGreaterThan(0)
    }
  })

  it('actually places the deception layer', () => {
    let mimics = 0
    let liars = 0
    let wipes = 0

    for (const level of decoded) {
      for (const cell of level.grid.cells) {
        if (cell.mimic) mimics++
        if (cell.liarWalls) liars++
        if (cell.memoryWipe) wipes++
      }
    }

    // it shipped with 4 inert mimics, 1 inert liar wall and zero memory wipes
    expect(mimics).toBeGreaterThan(20)
    expect(liars).toBeGreaterThan(20)
    expect(wipes).toBeGreaterThan(10)
  })

  it('keeps false exits from being the whole game', () => {
    // 102 across 27 levels made "touch every red square" the dominant mechanic
    for (const level of decoded) {
      const count = level.grid.cells.filter((c) => c.modifier === 'fakeExit').length
      expect(count, `${level.name} has ${count} false exits`).toBeLessThanOrEqual(3)
    }
  })
})

describe('retired modifiers', () => {
  it('are gone from every curated level', () => {
    for (const level of decoded) {
      for (const cell of level.grid.cells) {
        if (!cell.modifier) continue
        expect(RETIRED_MODIFIERS, `${level.name} still uses ${cell.modifier}`)
          .not.toContain(cell.modifier)
      }
    }
  })

  it('are gone from the hand-crafted intro', () => {
    for (const level of HAND_CRAFTED) {
      for (const cell of level.grid.cells) {
        if (!cell.modifier) continue
        expect(RETIRED_MODIFIERS, `${level.name} still uses ${cell.modifier}`)
          .not.toContain(cell.modifier)
      }
    }
  })

  it('leaves only modifiers the engine still implements', () => {
    for (const level of [...decoded, ...HAND_CRAFTED.map((l) => ({ name: l.name, grid: l.grid }))]) {
      for (const cell of level.grid.cells) {
        if (!cell.modifier) continue
        expect(MODIFIER_TYPES, `${level.name} uses unknown modifier ${cell.modifier}`)
          .toContain(cell.modifier)
      }
    }
  })
})

describe('the tutorial', () => {
  it('teaches deception rather than a motor gimmick', () => {
    // the third level a player ever saw used to be "Black Ice"
    const third = HAND_CRAFTED[2]
    const hasDeception = third.grid.cells.some(
      (c) => c.liarWalls || c.mimic || c.modifier === 'fakeExit'
    )
    expect(hasDeception, 'the third level should introduce deception').toBe(true)
  })

  it('kills nobody in the opening chapter', () => {
    for (const level of HAND_CRAFTED) {
      for (const cell of level.grid.cells) {
        expect(cell.trap, `${level.name} has a trap`).toBe(false)
        expect(cell.mimic, `${level.name} has a mimic`).toBe(false)
      }
    }
  })
})
