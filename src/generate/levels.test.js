import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fromJSON, generateLevel, TIERS } from './generate.js'
import { judge, checkStructure } from './oracle.js'
import { playPerfectly, playBlind } from './solvers.js'
import { findPath, safeReachable } from './analysis.js'
import { key } from '../engine/grid.js'
import { levelMetrics, shapeDistance } from './metrics.js'
import { INTENTS } from './generate.js'
import { checkTeaching, LESSONS } from './teaching.js'
import { RULES } from './oracle.js'
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

describe('every level asks its own question', () => {
  /*
   * The rule this replaces: levels within a chapter used to be generated from
   * one tier and different seeds, so thirty-nine levels carried eleven distinct
   * configurations and twenty-eight of them re-ran something already taught.
   *
   * A level now declares an intent — the shape of problem it poses — and has to
   * satisfy it, and no two levels in a chapter may sit near each other in shape.
   */
  const shaped = levels.map((level) => ({ ...level, shape: levelMetrics(level.grid) }))

  it('gives every level an intent that exists', () => {
    for (const level of shaped) {
      expect(level.intent, `${level.name} has no intent`).toBeTruthy()
      expect(INTENTS[level.intent], `${level.name}: unknown intent`).toBeTruthy()
    }
  })

  it('actually satisfies the intent it claims', () => {
    // the level file could be hand-edited or the generator could drift; this
    // re-measures the shipped artifact rather than trusting the label
    for (const level of shaped) {
      const wanted = INTENTS[level.intent].want
      expect(wanted(level.shape), `${level.name} is not ${level.intent} enough`).toBe(true)
    }
  })

  it('uses every intent it defines', () => {
    // a defined-but-unused intent is a rule nobody checks
    const used = new Set(shaped.map((l) => l.intent))
    for (const name of Object.keys(INTENTS)) {
      expect(used.has(name), `${name} is never used`).toBe(true)
    }
  })

  it('never repeats an intent inside a chapter', () => {
    const byChapter = new Map()
    for (const level of shaped) {
      const seen = byChapter.get(level.chapter) ?? new Set()
      expect(seen.has(level.intent), `${level.chapter} asks ${level.intent} twice`).toBe(false)
      seen.add(level.intent)
      byChapter.set(level.chapter, seen)
    }
  })

  it('keeps every pair in a chapter apart in shape', () => {
    const byChapter = new Map()
    for (const level of shaped) {
      byChapter.set(level.chapter, [...(byChapter.get(level.chapter) ?? []), level])
    }
    for (const [chapter, group] of byChapter) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const apart = shapeDistance(group[i].shape, group[j].shape)
          expect(apart, `${chapter}: ${group[i].name} and ${group[j].name}`)
            .toBeGreaterThanOrEqual(0.5)
        }
      }
    }
  })

  it('opens each chapter on the shape the previous one closed with', () => {
    /*
     * The one-new-variable rule, extended. On the level where fog or the hunter
     * or the snow arrives, the shape of the problem is the shape just
     * finished — so the only thing that changed is the mechanic, and a player
     * who suddenly struggles knows exactly what to blame.
     */
    const chapters = []
    for (const level of shaped) {
      if (!chapters.length || chapters.at(-1).name !== level.chapter) {
        chapters.push({ name: level.chapter, levels: [] })
      }
      chapters.at(-1).levels.push(level)
    }
    for (let i = 1; i < chapters.length; i++) {
      const closed = chapters[i - 1].levels.at(-1).intent
      const opened = chapters[i].levels[0].intent
      expect(opened, `${chapters[i].name} opens on ${opened} after ${closed}`).toBe(closed)
    }
  })

  it('never ships a level that is a slog even played perfectly', () => {
    for (const level of levels) {
      expect(level.difficulty.perfectSeconds, level.name)
        .toBeLessThanOrEqual(RULES.MAX_PERFECT_SECONDS)
    }
  })
})

describe('the level a mechanic arrives on teaches it', () => {
  /*
   * Fairness is the oracle's job. This is legibility, and only on the one level
   * in the campaign where each mechanic first appears — a first encounter has
   * to be impossible to miss and survivable when you miss it. Everything after
   * may be as quiet and as cruel as it likes.
   */
  const teaching = levels.filter((level) => level.teaches)

  it('has a level for every lesson defined', () => {
    // a lesson nobody is assigned is a rule that never runs
    const taught = new Set(teaching.map((l) => l.teaches))
    for (const lesson of Object.keys(LESSONS)) {
      expect(taught.has(lesson), `${lesson} is never taught by any level`).toBe(true)
    }
  })

  it('teaches each one exactly once', () => {
    const counts = new Map()
    for (const level of teaching) {
      counts.set(level.teaches, (counts.get(level.teaches) ?? 0) + 1)
    }
    for (const [lesson, count] of counts) {
      expect(count, `${lesson} is taught on ${count} levels`).toBe(1)
    }
  })

  it('teaches on the first level of its chapter, never later', () => {
    // by the second level of a chapter the lesson is over
    for (const level of teaching) {
      expect(level.name, `${level.name} carries a lesson`).toMatch(/ 1$/)
    }
  })

  it('still passes its own lesson, measured from the shipped file', () => {
    for (const level of teaching) {
      const badly = checkTeaching(level.grid, level.teaches, level.difficulty)
      expect(badly, `${level.name}: ${badly}`).toBeNull()
    }
  })
})

describe('the chapter cards give nothing away', () => {
  /*
   * These used to announce their own mechanic — "Wider, darker, and something
   * in it still looking for me" hands the player the ghost before they have met
   * it. A blurb says where the farmer is and how he is holding up. The board
   * says what is new.
   */
  const TELLS = [
    'fog', 'dark', 'see', 'looking', 'remember', 'forget', 'faster', 'slow',
    'wade', 'trap', 'alone', 'follow', 'closes', 'light',
  ]

  it('says nothing about a mechanic', () => {
    for (const level of levels) {
      if (!level.blurb) continue
      const leak = TELLS.find((word) => level.blurb.toLowerCase().includes(word))
      expect(leak, `${level.chapter}: "${level.blurb}" mentions "${leak}"`).toBeUndefined()
    }
  })

  it('leaves the opening chapter silent', () => {
    // four levels of one ear on an open board explain themselves
    for (const level of levels.filter((l) => l.chapter === levels[0].chapter)) {
      expect(level.blurb, `${level.name} has a caption it does not need`).toBeNull()
    }
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
