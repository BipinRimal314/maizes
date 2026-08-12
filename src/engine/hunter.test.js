import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createGrid, setWall, DIRECTIONS, isOpen, key } from './grid.js'
import { createGame, stepGame, restartGame, STEP_MS } from './game.js'
import { MAX_SPEED } from './physics.js'
import {
  BALL_TOP_SPEED,
  HUNTER_SPEED_CAP,
  CATCH_DISTANCE,
  createHunter,
  sleepHunter,
  stepHunter,
  spawnCell,
  distanceField,
  canTouch,
  wakeProgress,
} from './hunter.js'
import { buildMaze } from '../generate/maze.js'
import { createRng } from '../generate/rng.js'

/**
 * The hunter is the only mechanic that can kill you while you are standing
 * still, so its two fairness invariants get proved rather than asserted:
 * it cannot reach through a wall, and it cannot out-run the ball.
 */

function openGrid(cols, rows) {
  const grid = createGrid(cols, rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) setWall(grid, x, y, DIRECTIONS[1], false)
      if (y + 1 < rows) setWall(grid, x, y, DIRECTIONS[2], false)
    }
  }
  return grid
}

function mazeGrid(seed, cols = 12, rows = 12) {
  const built = buildMaze(createRng(seed), { cols, rows, loops: 0.08 })
  return built ? built.grid : null
}

describe('speed', () => {
  it("the cap is below the ball's real terminal velocity", () => {
    // The ball never reaches MAX_SPEED — friction settles it far lower — so a
    // hunter sized against MAX_SPEED would out-run the thing it is chasing.
    expect(BALL_TOP_SPEED).toBeLessThan(MAX_SPEED)
    expect(HUNTER_SPEED_CAP).toBeLessThan(BALL_TOP_SPEED)
  })

  it('clamps a hunter configured faster than the cap', () => {
    const grid = openGrid(6, 6)
    grid.hunter = { spawnMs: 0, speed: 99 }
    expect(createHunter(grid).speed).toBe(HUNTER_SPEED_CAP)
  })

  it('never moves further in one step than its speed', () => {
    const grid = mazeGrid(4242)
    grid.hunter = { spawnMs: 0, speed: 0.09 }
    const game = createGame(grid)
    const hunter = game.hunter

    stepHunter(hunter, grid, game.ball, 0)   // wakes and places it
    for (let i = 0; i < 4000; i++) {
      const before = { x: hunter.x, y: hunter.y }
      stepHunter(hunter, grid, game.ball, i * STEP_MS)
      const moved = Math.hypot(hunter.x - before.x, hunter.y - before.y)
      expect(moved).toBeLessThanOrEqual(hunter.speed + 1e-9)
    }
  })
})

describe('walls', () => {
  it('refuses a touch through a wall even at zero distance', () => {
    const grid = createGrid(3, 1)   // three cells, all walls up
    expect(canTouch(grid, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false)
    setWall(grid, 0, 0, DIRECTIONS[1], false)
    expect(canTouch(grid, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true)
  })

  it('allows a touch in the same cell', () => {
    const grid = createGrid(3, 1)
    expect(canTouch(grid, { x: 1, y: 0 }, { x: 1, y: 0 })).toBe(true)
  })

  it('never leaves the maze or crosses a closed edge', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), (seed) => {
        const grid = mazeGrid(seed, 10, 10)
        if (!grid) return
        grid.hunter = { spawnMs: 0, speed: 0.09 }
        const game = createGame(grid)
        const hunter = game.hunter

        stepHunter(hunter, grid, game.ball, 0)
        let previous = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }

        for (let i = 0; i < 1500; i++) {
          // drive the ball around so the hunter keeps re-pathing
          game.input.right = i % 40 < 20
          game.input.left = i % 40 >= 20
          game.input.down = i % 80 < 40
          stepGame(game)
          if (!hunter.active) { previous = null; continue }

          const cell = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }
          expect(cell.x).toBeGreaterThanOrEqual(0)
          expect(cell.x).toBeLessThan(grid.cols)
          expect(cell.y).toBeGreaterThanOrEqual(0)
          expect(cell.y).toBeLessThan(grid.rows)

          if (previous && (cell.x !== previous.x || cell.y !== previous.y)) {
            const dx = cell.x - previous.x
            const dy = cell.y - previous.y
            expect(Math.abs(dx) + Math.abs(dy), 'teleported').toBe(1)
            const direction = DIRECTIONS.find((d) => d.dx === dx && d.dy === dy)
            expect(isOpen(grid, previous.x, previous.y, direction), 'walked through a wall').toBe(true)
          }
          previous = cell
        }
      }),
      { numRuns: 12 }
    )
  })
})

describe('waking and sleeping', () => {
  it('stays asleep until its timer runs out', () => {
    const grid = openGrid(8, 8)
    grid.hunter = { spawnMs: 5000, speed: 0.08 }
    const game = createGame(grid)

    expect(stepHunter(game.hunter, grid, game.ball, 4999)).toBe(false)
    expect(game.hunter.active).toBe(false)
    stepHunter(game.hunter, grid, game.ball, 5000)
    expect(game.hunter.active).toBe(true)
  })

  it('spawns as far from the player as the maze allows', () => {
    const grid = mazeGrid(88)
    grid.hunter = { spawnMs: 0, speed: 0.08 }
    const game = createGame(grid)
    stepHunter(game.hunter, grid, game.ball, 0)

    const from = { x: Math.floor(game.ball.x), y: Math.floor(game.ball.y) }
    const field = distanceField(grid, from)
    const furthest = Math.max(...field)
    const at = spawnCell(grid, from)
    expect(field[at.y * grid.cols + at.x]).toBe(furthest)
  })

  it('goes back to sleep and restarts its clock on a respawn', () => {
    const grid = openGrid(8, 8)
    grid.hunter = { spawnMs: 3000, speed: 0.08 }
    const game = createGame(grid)

    stepHunter(game.hunter, grid, game.ball, 3000)
    expect(game.hunter.active).toBe(true)

    sleepHunter(game.hunter, 10000)
    expect(game.hunter.active).toBe(false)
    expect(game.hunter.wakesAt).toBe(13000)
  })

  it('is put to sleep by a death, so it cannot camp the start', () => {
    const grid = openGrid(8, 8)
    grid.traps = [{ x: 4, y: 0 }]
    grid.flags = [{ x: 7, y: 7 }]
    grid.hunter = { spawnMs: 100, speed: 0.08 }
    const game = createGame(grid)

    // the hunter wakes long before the ball reaches the trap four cells away
    game.input.right = true
    for (let i = 0; i < 20; i++) stepGame(game)
    expect(game.hunter.active, 'should be awake by now').toBe(true)

    for (let i = 0; i < 400 && game.deaths === 0; i++) stepGame(game)

    expect(game.deaths).toBeGreaterThan(0)
    expect(game.hunter.active, 'still awake after a respawn').toBe(false)
    expect(game.hunter.wakesAt, 'clock did not restart').toBe(game.now + 100)
  })

  it('is put to sleep by a capture too', () => {
    const grid = openGrid(8, 8)
    grid.flags = [{ x: 3, y: 0 }]
    grid.hunter = { spawnMs: 0, speed: 0.08 }
    const game = createGame(grid)

    game.input.right = true
    for (let i = 0; i < 600 && game.captured.size === 0; i++) stepGame(game)

    expect(game.captured.size).toBe(1)
    expect(game.hunter.active).toBe(false)
  })

  it('is rebuilt from scratch by a restart', () => {
    const grid = openGrid(8, 8)
    grid.hunter = { spawnMs: 2000, speed: 0.08 }
    const game = createGame(grid)
    for (let i = 0; i < 200; i++) stepGame(game)

    restartGame(game)
    expect(game.hunter.active).toBe(false)
    expect(game.hunter.wakesAt).toBe(2000)
  })

  it('telegraphs before it wakes', () => {
    const grid = openGrid(8, 8)
    grid.hunter = { spawnMs: 10000, speed: 0.08 }
    const hunter = createHunter(grid)
    expect(wakeProgress(hunter, 0)).toBe(0)
    expect(wakeProgress(hunter, 9000)).toBeGreaterThan(0)
    expect(wakeProgress(hunter, 9000)).toBeLessThan(1)
    expect(wakeProgress(hunter, 10000)).toBe(1)
  })
})

describe('catching', () => {
  it('catches a player who stands still in an open room', () => {
    const grid = openGrid(9, 9)
    grid.hunter = { spawnMs: 0, speed: 0.1 }
    const game = createGame(grid)

    let caught = false
    for (let i = 0; i < 6000 && !caught; i++) {
      stepGame(game)
      if (game.deaths > 0) caught = true
    }
    expect(caught, 'a stationary player was never caught').toBe(true)
  })

  it('never registers a catch while the two are separated by a wall', () => {
    const grid = mazeGrid(1234)
    grid.hunter = { spawnMs: 0, speed: 0.09 }
    const game = createGame(grid)
    const hunter = game.hunter
    stepHunter(hunter, grid, game.ball, 0)

    for (let i = 0; i < 3000; i++) {
      const hit = stepHunter(hunter, grid, game.ball, i * STEP_MS)
      if (!hit) continue
      const a = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }
      const b = { x: Math.floor(game.ball.x), y: Math.floor(game.ball.y) }
      expect(canTouch(grid, a, b), `caught through a wall at ${key(a.x, a.y)}`).toBe(true)
      expect(Math.hypot(hunter.x - game.ball.x, hunter.y - game.ball.y))
        .toBeLessThan(CATCH_DISTANCE)
    }
  })

  it('does not fire on a level with no hunter', () => {
    const grid = mazeGrid(7)
    const game = createGame(grid)
    expect(game.hunter).toBeNull()
    for (let i = 0; i < 500; i++) stepGame(game)
    expect(game.deaths).toBe(0)
  })

  it('cannot steal a win on the step the player reaches the exit', () => {
    // the exit check runs before the hunter moves, on purpose
    const grid = openGrid(5, 5)
    grid.start = { x: 0, y: 0 }
    grid.end = { x: 1, y: 0 }
    grid.flags = []
    grid.hunter = { spawnMs: 0, speed: 0.1 }
    const game = createGame(grid)

    game.input.right = true
    for (let i = 0; i < 300 && !game.won; i++) stepGame(game)
    expect(game.won).toBe(true)
    expect(game.deaths).toBe(0)
  })
})
