import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid } from './levelFormat'
import { createGame, stepGame, STEP_MS } from './game'

/**
 * No level may trap the player in a death loop.
 *
 * Two shipped bugs had this shape and neither was caught by testing a single
 * mechanic in isolation:
 *
 *   the apparition  the ten-second grace period was measured against the game
 *                   clock rather than the current attempt, so past ten seconds
 *                   every respawn placed the shadow on the ball. 300 deaths in
 *                   five seconds.
 *   the void        corruption spread outward from the spawn point and was
 *                   never reset, so once it reached the cells beside the start
 *                   every later attempt died on its first step. 810 deaths in
 *                   a row.
 *
 * The generic invariant that catches both: however badly a player plays, they
 * must keep regaining control. Dying on many consecutive simulation steps means
 * they never did.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

const SECOND = Math.round(1000 / STEP_MS)

const inputPlan = fc.array(
  fc.record({
    up: fc.boolean(),
    down: fc.boolean(),
    left: fc.boolean(),
    right: fc.boolean(),
    hold: fc.integer({ min: 1, max: 30 }),
  }),
  { minLength: 30, maxLength: 90 }
)

/**
 * Play a level badly for a while and report the worst run of consecutive steps
 * on which the player died.
 */
function worstDeathStreak(game, plan, maxSteps) {
  let streak = 0
  let worst = 0
  // baseline from wherever the game already is; some scenarios start the player
  // deep in the escalation, and those deaths are setup, not a streak
  let previousDeaths = game.deaths
  let steps = 0

  for (const segment of plan) {
    game.input.up = segment.up
    game.input.down = segment.down
    game.input.left = segment.left
    game.input.right = segment.right

    for (let i = 0; i < segment.hold && steps < maxSteps; i++) {
      stepGame(game)
      steps++

      if (game.deaths > previousDeaths) {
        streak += game.deaths - previousDeaths
        worst = Math.max(worst, streak)
        previousDeaths = game.deaths
      } else {
        streak = 0
      }

      if (game.won) return { worst, steps, won: true }
    }
  }

  return { worst, steps, won: game.won }
}

describe('no level can trap the player in a death loop', () => {
  for (const level of curated) {
    it(`${level.name}`, () => {
      fc.assert(
        fc.property(inputPlan, (plan) => {
          const grid = decodeGrid(level.maze)
          const game = createGame(grid, {
            era: level.era,
            fogRadius: level.fog_radius,
            deathMode: level.death_mode,
          })

          const result = worstDeathStreak(game, plan, SECOND * 90)
          expect(
            result.worst,
            `${result.worst} deaths on consecutive steps — the player never regained control`
          ).toBeLessThan(3)
        }),
        { numRuns: 25 }
      )
    })
  }
})

describe('escalation stays survivable', () => {
  /**
   * The void arms after ten deaths on a sadistic level. Force it well past that
   * and confirm the player still gets to move between deaths.
   */
  it('remains playable long after the void has armed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: curated.length - 1 }),
        inputPlan,
        (index, plan) => {
          const grid = decodeGrid(curated[index].maze)
          const game = createGame(grid, { era: 'sadistic', fogRadius: 3.5, deathMode: 'cumulative' })

          // start deep in the escalation
          game.deaths = 30
          game.corruptionActive = true
          game.corruptionFrontier = [{ x: grid.start.x, y: grid.start.y }]

          const result = worstDeathStreak(game, plan, SECOND * 60)
          expect(result.worst).toBeLessThan(3)
        }
      ),
      { numRuns: 40 }
    )
  })

  it('lets the apparition kill, but never twice in a row', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: curated.length - 1 }),
        inputPlan,
        (index, plan) => {
          const grid = decodeGrid(curated[index].maze)
          const game = createGame(grid, { era: 'punishing', fogRadius: 3.5 })

          const result = worstDeathStreak(game, plan, SECOND * 120)
          expect(result.worst).toBeLessThan(3)
        }
      ),
      { numRuns: 30 }
    )
  })
})

describe('the clock keeps moving', () => {
  it('advances game time even under constant death', () => {
    const grid = decodeGrid(curated[curated.length - 1].maze)
    const game = createGame(grid, { era: 'sadistic', fogRadius: 3.5 })
    game.deaths = 25

    game.input.right = true
    for (let i = 0; i < SECOND * 30; i++) stepGame(game)

    // 30 seconds of stepping is 30 seconds of game time, deaths or not
    expect(game.now).toBeGreaterThan(29_000)
  })
})
