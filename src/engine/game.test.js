import { describe, it, expect, vi } from 'vitest'
import { createGrid, setWall, DIRECTIONS } from './grid.js'
import { createGame, stepGame, restartGame, snapshot, STEP_MS } from './game.js'

const SECOND = Math.round(1000 / STEP_MS)

/** An open corridor of `length` cells with walls only on the outside. */
function corridor(length) {
  const grid = createGrid(length, 1)
  for (let x = 0; x < length - 1; x++) setWall(grid, x, 0, DIRECTIONS[1], false)
  grid.start = { x: 0, y: 0 }
  grid.end = { x: length - 1, y: 0 }
  return grid
}

function run(game, steps, direction = 'right') {
  game.input[direction] = true
  for (let i = 0; i < steps; i++) stepGame(game)
  game.input[direction] = false
}

describe('flags', () => {
  it('unlock the exit only when all are captured', () => {
    const grid = corridor(8)
    grid.flags = [{ x: 2, y: 0 }, { x: 4, y: 0 }]
    const game = createGame(grid)

    expect(game.exitOpen).toBe(false)
    game.ball.x = 2.5
    stepGame(game)
    expect(game.captured.size).toBe(1)
    expect(game.exitOpen).toBe(false)

    game.ball.x = 4.5
    stepGame(game)
    expect(game.exitOpen).toBe(true)
  })

  it('are not deaths', () => {
    const grid = corridor(6)
    grid.flags = [{ x: 3, y: 0 }]
    const game = createGame(grid)
    game.ball.x = 3.5
    stepGame(game)
    expect(game.captured.size).toBe(1)
    expect(game.deaths).toBe(0)
  })

  it('survive death, always', () => {
    // the entire class of "you must die to progress but dying undoes progress"
    const grid = corridor(8)
    grid.flags = [{ x: 2, y: 0 }]
    grid.traps = [{ x: 5, y: 0 }]
    const game = createGame(grid)

    game.ball.x = 2.5
    stepGame(game)
    expect(game.captured.size).toBe(1)

    game.ball.x = 5.5
    stepGame(game)
    expect(game.deaths).toBe(1)
    expect(game.captured.size).toBe(1)
    expect(game.exitOpen).toBe(true)
  })

  it('send the ball home and do not re-trigger', () => {
    const grid = corridor(6)
    grid.flags = [{ x: 3, y: 0 }]
    const game = createGame(grid)
    game.ball.x = 3.5
    stepGame(game)
    expect(Math.floor(game.ball.x)).toBe(0)
    game.ball.x = 3.5
    stepGame(game)
    expect(game.captured.size).toBe(1)
  })

  it('open the exit immediately when a level has none', () => {
    expect(createGame(corridor(4)).exitOpen).toBe(true)
  })
})

describe('traps', () => {
  it('kill and return the ball to the start', () => {
    const grid = corridor(6)
    grid.traps = [{ x: 3, y: 0 }]
    const game = createGame(grid)
    game.ball.x = 3.5
    stepGame(game)
    expect(game.deaths).toBe(1)
    expect(Math.floor(game.ball.x)).toBe(0)
  })

  it('never kill twice in a row — the player always regains control', () => {
    const grid = corridor(10)
    grid.traps = [{ x: 4, y: 0 }]
    const game = createGame(grid)

    let streak = 0
    let worst = 0
    let previous = 0
    game.input.right = true
    for (let i = 0; i < SECOND * 60; i++) {
      stepGame(game)
      if (game.deaths > previous) { streak++; worst = Math.max(worst, streak); previous = game.deaths }
      else streak = 0
    }
    expect(worst).toBeLessThan(2)
  })
})

describe('winning', () => {
  it('needs the exit open', () => {
    const grid = corridor(5)
    grid.flags = [{ x: 2, y: 0 }]
    const onWin = vi.fn()
    const game = createGame(grid)
    game.onWin = onWin
    game.exitOpen = false
    game.ball.x = 4.5
    stepGame(game)
    expect(game.won).toBe(false)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('fires once and freezes the clock', () => {
    const grid = corridor(5)
    const onWin = vi.fn()
    const game = createGame(grid)
    game.onWin = onWin
    run(game, 600)
    expect(game.won).toBe(true)
    expect(onWin).toHaveBeenCalledTimes(1)
    const at = game.now
    for (let i = 0; i < 60; i++) stepGame(game)
    expect(game.now).toBe(at)
  })
})

describe('the clock', () => {
  it('advances only while running', () => {
    const game = createGame(corridor(20))
    for (let i = 0; i < SECOND; i++) stepGame(game)
    expect(game.now).toBeCloseTo(1000, 0)
    game.paused = true
    for (let i = 0; i < SECOND; i++) stepGame(game)
    expect(game.now).toBeCloseTo(1000, 0)
  })
})

describe('the level is never modified', () => {
  it('survives play and restart untouched', () => {
    const grid = corridor(10)
    grid.flags = [{ x: 3, y: 0 }]
    grid.traps = [{ x: 6, y: 0 }]
    const before = JSON.stringify({ ...grid, walls: Array.from(grid.walls) })

    const game = createGame(grid)
    run(game, 1200)
    restartGame(game)

    expect(JSON.stringify({ ...grid, walls: Array.from(grid.walls) })).toBe(before)
    expect(game.deaths).toBe(0)
    expect(game.captured.size).toBe(0)
    expect(game.now).toBe(0)
  })
})

describe('the HUD snapshot', () => {
  it('carries only primitives', () => {
    const grid = corridor(6)
    grid.flags = [{ x: 2, y: 0 }]
    grid.fog = 3
    const hud = snapshot(createGame(grid))
    for (const value of Object.values(hud)) {
      expect(value instanceof Set).toBe(false)
      expect(value instanceof Map).toBe(false)
      expect(typeof value === 'object' && value !== null).toBe(false)
    }
    expect(hud.flagsTotal).toBe(1)
    expect(hud.hasFog).toBe(true)
  })
})
