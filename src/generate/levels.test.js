import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fromJSON, generateLevel, TIERS } from './generate.js'
import { judge, checkStructure } from './oracle.js'
import { playPerfectly, playBlind } from './solvers.js'
import { findPath, safeReachable } from './analysis.js'
import { key } from '../engine/grid.js'
import { hunterSpeedCap } from '../engine/hunter.js'

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
  /*
   * Derived, not hardcoded.
   *
   * These used to assert "fog at 8, hunter at 16, memory at 25". Every time a
   * chapter was added in the middle, three tests failed for reasons that had
   * nothing to do with the rule they exist to protect — and the temptation each
   * time is to bump the number, which quietly turns a test of the design into a
   * test of the current level count.
   *
   * The rule is: a mechanic arrives once, on a level otherwise identical to the
   * one before it, and never leaves. That holds at any campaign length.
   */
  const firstWith = (has) => levels.findIndex(has)

  const MECHANICS = [
    { name: 'fog', has: (l) => l.fog !== null, of: (l) => l.fog, tightens: 'down' },
    { name: 'the hunter', has: (l) => Boolean(l.h), of: () => null },
    { name: 'sand', has: (l) => (l.sf ?? []).some(([, , k]) => k === 1), of: () => null },
    { name: 'snow', has: (l) => (l.sf ?? []).some(([, , k]) => k === 2), of: () => null },
    { name: 'fading memory', has: (l) => Boolean(l.m), of: (l) => l.m, tightens: 'down' },
  ]

  for (const mechanic of MECHANICS) {
    describe(mechanic.name, () => {
      const at = firstWith(mechanic.has)

      it('arrives exactly once', () => {
        expect(at, `${mechanic.name} never appears`).toBeGreaterThanOrEqual(0)
      })

      it('is absent from every level before it', () => {
        for (const level of levels.slice(0, at)) {
          expect(mechanic.has(level), level.name).toBe(false)
        }
      })

      it('never leaves once it has arrived', () => {
        for (const level of levels.slice(at)) {
          expect(mechanic.has(level), level.name).toBe(true)
        }
      })

      it('is the only thing that changes on the level it arrives', () => {
        if (at === 0) return
        const before = levels[at - 1]
        const after = levels[at]
        expect(after.c, 'board width').toBe(before.c)
        expect(after.r, 'board height').toBe(before.r)
        expect(after.f.length, 'maize').toBe(before.f.length)
        expect(after.t.length, 'traps').toBe(before.t.length)
        // whichever mechanics were already in play carry over untouched
        for (const other of MECHANICS) {
          if (other.name === mechanic.name) continue
          if (!other.has(before)) continue
          expect(other.has(after), `${other.name} vanished`).toBe(true)
          if (other.of(before) !== null) {
            expect(other.of(after), `${other.name} changed too`).toBe(other.of(before))
          }
        }
      })

      it('only ever tightens', () => {
        if (!mechanic.tightens) return
        const values = levels.filter(mechanic.has).map(mechanic.of)
        for (let i = 1; i < values.length; i++) {
          expect(values[i], `level ${i}`).toBeLessThanOrEqual(values[i - 1])
        }
      })
    })
  }

  it('gives every hunted level a timer a perfect player beats comfortably', () => {
    for (const level of levels.filter((l) => l.h)) {
      const [spawnMs] = level.h
      expect(spawnMs, `${level.name}`).toBeGreaterThan(level.difficulty.perfectLegMs)
    }
  })

  it('never ships a hunter that can out-run the ball on its own ground', () => {
    // sized against the slowest surface on that grid, not the ball at full
    // tilt: a hunter given two thirds of an unslowed ball would be faster than
    // a player wading through the snow on the same board
    for (const level of levels.filter((l) => l.h)) {
      expect(level.h[1], `${level.name}`).toBeLessThanOrEqual(hunterSpeedCap(fromJSON(level)))
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
