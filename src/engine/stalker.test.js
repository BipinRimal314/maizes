import { describe, it, expect } from 'vitest'
import { createGrid } from './maze'
import { createGame, stepGame, STEP_MS } from './game'
import {
  createStalker, resetStalker, recordStalkerPosition, updateStalker,
  stalkerCountdown, STALKER_DELAY_MS,
} from './stalker'

const SECOND = Math.round(1000 / STEP_MS)

describe('the grace period', () => {
  it('does not activate before the delay', () => {
    const stalker = createStalker(true)
    const ball = { x: 0.5, y: 0.5 }

    for (let t = 0; t < STALKER_DELAY_MS; t += 100) {
      recordStalkerPosition(stalker, ball, t)
      updateStalker(stalker, ball, t)
    }

    expect(stalker.active).toBe(false)
    expect(stalker.caught).toBe(false)
  })

  it('activates at the far end of the recorded path, not on top of the ball', () => {
    const stalker = createStalker(true)
    const ball = { x: 0.5, y: 0.5 }

    // walk right for the whole delay
    for (let t = 0; t <= STALKER_DELAY_MS + 200; t += 100) {
      ball.x = 0.5 + t / 1000
      recordStalkerPosition(stalker, ball, t)
      updateStalker(stalker, ball, t)
    }

    expect(stalker.active).toBe(true)
    expect(stalker.caught).toBe(false)
    // the shadow should be back where we started, not where we are
    expect(stalker.x).toBeLessThan(2)
    expect(ball.x).toBeGreaterThan(9)
  })

  /**
   * The regression. The delay was measured against the game clock, which never
   * resets, so from ten seconds into a level onward every respawn placed the
   * shadow on the freshly cleared path — whose only entry was the ball's own
   * position. It caught you on the very next step, forever.
   */
  it('restarts the grace period after a death', () => {
    const stalker = createStalker(true)
    const ball = { x: 0.5, y: 0.5 }

    for (let t = 0; t <= STALKER_DELAY_MS + 1000; t += 100) {
      recordStalkerPosition(stalker, ball, t)
      updateStalker(stalker, ball, t)
    }

    // player dies well past the delay
    const deathTime = STALKER_DELAY_MS + 1000
    resetStalker(stalker, deathTime)

    // next step after respawning must not be an instant re-catch
    recordStalkerPosition(stalker, ball, deathTime + STEP_MS)
    updateStalker(stalker, ball, deathTime + STEP_MS)

    expect(stalker.caught).toBe(false)
    expect(stalker.active).toBe(false)
  })

  it('reports a fresh countdown after a death', () => {
    const stalker = createStalker(true)
    const ball = { x: 0.5, y: 0.5 }

    for (let t = 0; t <= STALKER_DELAY_MS + 5000; t += 100) {
      recordStalkerPosition(stalker, ball, t)
      updateStalker(stalker, ball, t)
    }
    expect(stalkerCountdown(stalker, STALKER_DELAY_MS + 5000)).toBe(0)

    const deathTime = STALKER_DELAY_MS + 5000
    resetStalker(stalker, deathTime)
    expect(stalkerCountdown(stalker, deathTime)).toBe(STALKER_DELAY_MS / 1000)
  })
})

describe('in a running game', () => {
  it('does not trap the player in a respawn loop', () => {
    // a corridor with a trap, on a level that arms the apparition
    const grid = createGrid(10, 1)
    grid.cells[4].trap = true
    const game = createGame(grid, { era: 'punishing' })

    // run past the delay, dying on the trap along the way
    game.input.right = true
    for (let i = 0; i < SECOND * 25; i++) stepGame(game)

    const deathsAfter25s = game.deaths

    // another five seconds should not add dozens of deaths
    for (let i = 0; i < SECOND * 5; i++) stepGame(game)
    const added = game.deaths - deathsAfter25s

    // a respawn loop adds a death every single step (300 in five seconds)
    expect(added).toBeLessThan(20)
  })

  it('never kills the player on the step right after a respawn', () => {
    const grid = createGrid(12, 1)
    grid.cells[6].trap = true
    const game = createGame(grid, { era: 'sadistic' })

    let consecutive = 0
    let worst = 0
    let previousDeaths = 0

    game.input.right = true
    for (let i = 0; i < SECOND * 40; i++) {
      stepGame(game)
      if (game.deaths > previousDeaths) {
        consecutive++
        worst = Math.max(worst, consecutive)
        previousDeaths = game.deaths
      } else {
        consecutive = 0
      }
    }

    // deaths on back-to-back steps mean the player never regained control
    expect(worst).toBeLessThan(3)
  })

  it('leaves learning levels alone entirely', () => {
    const game = createGame(createGrid(8, 8), { era: 'learning' })
    expect(game.stalker.enabled).toBe(false)

    for (let i = 0; i < SECOND * 30; i++) stepGame(game)
    expect(game.deaths).toBe(0)
  })
})
