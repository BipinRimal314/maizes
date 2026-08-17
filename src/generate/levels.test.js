import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fromJSON, generateLevel, TIERS } from './generate.js'
import { judge, checkStructure } from './oracle.js'
import { playPerfectly, playBlind } from './solvers.js'
import { findPath, safeReachable } from './analysis.js'
import { key } from '../engine/grid.js'
import { HUNTER_SPEED_CAP } from '../engine/hunter.js'

/**
 * Every shipped level, re-judged from the file that ships.
 *
 * The build script already ran the oracle, but a level file can be edited, a
 * generator can drift, and a rule can be relaxed by accident. This asserts the
 * guarantee against the artifact rather than against the process that made it.
 */

const levels = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels.json', import.meta.url)), 'utf8')
).map((data) => ({ ...data, grid: fromJSON(data) }))

describe('the shipped set', () => {
  it('is not empty', () => {
    expect(levels.length).toBeGreaterThanOrEqual(20)
  })

  it('has no duplicate mazes', () => {
    const seen = new Map()
    for (const level of levels) {
      const signature = level.w.join(',') + `|${level.s}|${level.e}`
      expect(seen.has(signature), `${level.name} duplicates ${seen.get(signature)}`).toBe(false)
      seen.set(signature, level.name)
    }
  })

  for (const level of levels) {
    describe(level.name, () => {
      it('passes every structural rule', () => {
        const problems = checkStructure(level.grid)
        expect(problems, problems.join('; ')).toEqual([])
      })

      it('can be finished without dying by someone who knows the maze', { timeout: 30000 }, () => {
        const result = playPerfectly(level.grid)
        expect(result.solved, result.reason || '').toBe(true)
        // any death here is the level's fault: this player never knowingly
        // steps on a trap and walks only routes it has verified
        expect(result.deaths, 'a perfect player died').toBe(0)
      })

      it('can be finished by someone who cannot see it', { timeout: 30000 }, () => {
        const result = playBlind(level.grid)
        expect(result.solved, `blind player gave up after ${result.deaths} deaths`).toBe(true)
        expect(result.deaths).toBeLessThanOrEqual(25)
      })

      it('puts nothing lethal between the player and anything they must touch', () => {
        const traps = new Set(level.grid.traps.map((t) => key(t.x, t.y)))
        const safe = safeReachable(level.grid, traps)
        expect(safe.has(key(level.grid.end.x, level.grid.end.y)), 'exit').toBe(true)
        for (const flag of level.grid.flags) {
          expect(safe.has(key(flag.x, flag.y)), `flag ${flag.x},${flag.y}`).toBe(true)
        }
      })

      it('has a route worth walking', () => {
        const route = findPath(level.grid, level.grid.start, level.grid.end)
        expect(route).not.toBeNull()
        expect(route.length).toBeGreaterThanOrEqual((level.grid.cols + level.grid.rows) * 0.5)
      })
    })
  }
})

describe('the oracle rejects what it should', () => {
  it('rejects a level whose flag is walled behind a trap', () => {
    const level = generateLevel('brisk', 500)
    const grid = level.grid
    // wall the flag off behind a trap by trapping its only approach
    const flag = grid.flags[0]
    const route = findPath(grid, grid.start, flag)
    grid.traps = [route[route.length - 2]]
    const problems = checkStructure(grid)
    expect(problems.some((p) => p.includes('trap'))).toBe(true)
  })

  it('rejects a level whose exit sits next to the start', () => {
    const level = generateLevel('brisk', 600)
    const grid = level.grid
    grid.end = { x: grid.start.x, y: grid.start.y + 1 }
    const problems = checkStructure(grid)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('accepts a freshly generated level of every tier', { timeout: 60000 }, () => {
    for (const tier of Object.keys(TIERS)) {
      const level = generateLevel(tier, 99)
      expect(level.grid, `${tier} produced nothing`).not.toBeNull()
      expect(judge(level.grid).ok, tier).toBe(true)
    }
  })
})

describe('generation is deterministic', () => {
  it('the same seed produces the same level', () => {
    const a = generateLevel('blind', 777)
    const b = generateLevel('blind', 777)
    expect(a.seed).toBe(b.seed)
    expect(Array.from(a.grid.walls)).toEqual(Array.from(b.grid.walls))
    expect(a.grid.flags).toEqual(b.grid.flags)
    expect(a.grid.traps).toEqual(b.grid.traps)
  })
})

describe('the campaign ramp', () => {
  const FIRST_FOG_LEVEL = 8

  it('introduces fog at level 8', () => {
    const firstFoggy = levels.findIndex((l) => l.fog !== null)
    expect(firstFoggy + 1, 'first foggy level number').toBe(FIRST_FOG_LEVEL)
  })

  it('keeps every level before that clear', () => {
    for (const level of levels.slice(0, FIRST_FOG_LEVEL - 1)) {
      expect(level.fog, `${level.name}`).toBeNull()
    }
  })

  it('never goes back to clear once fog arrives', () => {
    for (const level of levels.slice(FIRST_FOG_LEVEL - 1)) {
      expect(level.fog, `${level.name}`).toBeGreaterThan(0)
    }
  })

  it('only tightens the fog, never loosens it', () => {
    // the ramp is the design; a chapter that eased off would read as a bug
    const radii = levels.filter((l) => l.fog !== null).map((l) => l.fog)
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i], `level ${i}`).toBeLessThanOrEqual(radii[i - 1])
    }
  })

  it('changes only the fog on the level that introduces it', () => {
    // one new variable at a time: the level fog arrives on is otherwise
    // identical in shape to the one before it
    const before = levels[FIRST_FOG_LEVEL - 2]
    const after = levels[FIRST_FOG_LEVEL - 1]
    expect(after.c).toBe(before.c)
    expect(after.r).toBe(before.r)
    expect(after.f.length).toBe(before.f.length)
    expect(after.t.length).toBe(before.t.length)
    expect(before.fog).toBeNull()
    expect(after.fog).toBeGreaterThan(0)
  })

  const FIRST_HUNTED_LEVEL = 16

  it('introduces the hunter at level 16', () => {
    const first = levels.findIndex((l) => l.h !== null && l.h !== undefined)
    expect(first + 1, 'first hunted level number').toBe(FIRST_HUNTED_LEVEL)
  })

  it('never goes back to unhunted once the hunter arrives', () => {
    for (const level of levels.slice(FIRST_HUNTED_LEVEL - 1)) {
      expect(level.h, `${level.name}`).toBeTruthy()
    }
  })

  it('changes only the hunter on the level that introduces it', () => {
    // the same one-new-variable rule that governs the level fog arrives on
    const before = levels[FIRST_HUNTED_LEVEL - 2]
    const after = levels[FIRST_HUNTED_LEVEL - 1]
    expect(after.c).toBe(before.c)
    expect(after.r).toBe(before.r)
    expect(after.f.length).toBe(before.f.length)
    expect(after.t.length).toBe(before.t.length)
    expect(after.fog).toBe(before.fog)
    expect(before.h ?? null).toBeNull()
    expect(after.h).toBeTruthy()
  })

  it('gives every hunted level a timer a perfect player beats comfortably', () => {
    for (const level of levels.filter((l) => l.h)) {
      const [spawnMs] = level.h
      // the timer is derived from the longest trip perfect play takes, so it
      // must always leave that trip room to finish
      expect(spawnMs, `${level.name}`).toBeGreaterThan(level.difficulty.perfectLegMs)
    }
  })

  it('never ships a hunter that can out-run the ball', () => {
    for (const level of levels.filter((l) => l.h)) {
      expect(level.h[1], `${level.name}`).toBeLessThanOrEqual(HUNTER_SPEED_CAP)
    }
  })

  const FIRST_FADING_LEVEL = 25

  it('takes memory away at level 25', () => {
    const first = levels.findIndex((l) => l.m)
    expect(first + 1, 'first fading level number').toBe(FIRST_FADING_LEVEL)
  })

  it('keeps memory permanent everywhere before that', () => {
    for (const level of levels.slice(0, FIRST_FADING_LEVEL - 1)) {
      expect(level.m ?? null, `${level.name}`).toBeNull()
    }
  })

  it('changes only the memory on the level that takes it away', () => {
    // the same one-new-variable rule that governs fog and the hunter
    const before = levels[FIRST_FADING_LEVEL - 2]
    const after = levels[FIRST_FADING_LEVEL - 1]
    expect(after.c).toBe(before.c)
    expect(after.r).toBe(before.r)
    expect(after.f.length).toBe(before.f.length)
    expect(after.t.length).toBe(before.t.length)
    expect(after.fog).toBe(before.fog)
    expect(before.m ?? null).toBeNull()
    expect(after.m).toBeGreaterThan(0)
  })

  it('only shortens memory once it starts fading, never lengthens it', () => {
    const spans = levels.filter((l) => l.m).map((l) => l.m)
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i], `level ${i}`).toBeLessThanOrEqual(spans[i - 1])
    }
  })

  it('never gets easier for a blind player as it goes on', () => {
    const byChapter = new Map()
    for (const level of levels) {
      const list = byChapter.get(level.chapter) || []
      list.push(level.difficulty.blindDeaths)
      byChapter.set(level.chapter, list)
    }
    const averages = [...byChapter.values()].map((d) => d.reduce((a, b) => a + b, 0) / d.length)
    expect(averages[0]).toBeLessThanOrEqual(averages[averages.length - 1])
    expect(averages[averages.length - 1]).toBeGreaterThan(averages[0])
  })
})
