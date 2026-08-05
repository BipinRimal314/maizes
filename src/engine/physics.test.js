import { describe, it, expect } from 'vitest'
import { createGrid, toggleWallBetween, setGate } from './maze'
import {
  BALL_RADIUS, MAX_SPEED,
  createBallState, stepBall, cellUnder,
  checkLethal, checkWin, checkMemoryWipe, gateKey,
} from './physics'

const NO_GATES = new Set()
const NO_INPUT = { up: false, down: false, left: false, right: false }

function press(dir) {
  return { ...NO_INPUT, [dir]: true }
}

/** Run the ball for a while, as the fixed-timestep loop would. */
function simulate(ball, input, grid, steps, closedGates = NO_GATES) {
  for (let i = 0; i < steps; i++) stepBall(ball, input, grid, closedGates)
  return ball
}

describe('units', () => {
  it('places the ball at the centre of the start cell in cell units', () => {
    const grid = createGrid(5, 5)
    grid.start = { x: 2, y: 3 }
    const ball = createBallState(grid)

    // cell units, not pixels — the old code multiplied by cellSize here, which
    // is what tied physics to the render scale
    expect(ball.x).toBe(2.5)
    expect(ball.y).toBe(3.5)
    expect(ball.radius).toBe(BALL_RADIUS)
  })
})

describe('walls', () => {
  it('stops the ball at a wall instead of passing through', () => {
    const grid = createGrid(5, 1)
    const withWall = toggleWallBetween(grid, 1, 0, 2, 0)
    const ball = createBallState({ ...withWall, start: { x: 0, y: 0 } })

    simulate(ball, press('right'), withWall, 200)

    // it must not reach cell 2
    expect(ball.x).toBeLessThanOrEqual(2 - BALL_RADIUS + 1e-6)
  })

  it('does not tunnel through a wall even at full speed', () => {
    const grid = createGrid(12, 1)
    const withWall = toggleWallBetween(grid, 9, 0, 10, 0)
    const ball = createBallState({ ...withWall, start: { x: 0, y: 0 } })

    // long straight run-up so the ball is at terminal velocity on impact
    simulate(ball, press('right'), withWall, 400)

    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
    expect(ball.x).toBeLessThan(10)
  })

  it('keeps the ball inside the outer border', () => {
    const grid = createGrid(4, 4)
    const ball = createBallState(grid)

    simulate(ball, { ...NO_INPUT, up: true, left: true }, grid, 300)

    expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
    expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
  })
})

describe('movement', () => {
  it('does not let diagonal travel outrun orthogonal travel', () => {
    const grid = createGrid(20, 20)
    grid.start = { x: 0, y: 0 }

    const straight = createBallState(grid)
    simulate(straight, press('right'), grid, 60)
    const straightDistance = Math.hypot(straight.x - 0.5, straight.y - 0.5)

    const diagonal = createBallState(grid)
    simulate(diagonal, { ...NO_INPUT, right: true, down: true }, grid, 60)
    const diagonalDistance = Math.hypot(diagonal.x - 0.5, diagonal.y - 0.5)

    expect(diagonalDistance).toBeLessThanOrEqual(straightDistance + 1e-6)
  })

  it('comes to rest when input stops', () => {
    const grid = createGrid(20, 1)
    const ball = createBallState(grid)

    simulate(ball, press('right'), grid, 30)
    expect(Math.abs(ball.vx)).toBeGreaterThan(0)

    simulate(ball, NO_INPUT, grid, 120)
    expect(Math.abs(ball.vx)).toBeLessThan(1e-3)
  })

  it('is deterministic — the same steps produce the same position', () => {
    const grid = createGrid(10, 10)
    const a = createBallState(grid)
    const b = createBallState(grid)

    simulate(a, press('right'), grid, 100)
    simulate(b, press('right'), grid, 100)

    expect(a.x).toBe(b.x)
    expect(a.y).toBe(b.y)
  })
})

describe('one-way gates', () => {
  it('lets the ball through while the gate is open', () => {
    const grid = setGate(createGrid(6, 1), 2, 0, 'right')
    const ball = createBallState(grid)

    simulate(ball, press('right'), grid, 200)
    expect(ball.x).toBeGreaterThan(3)
  })

  it('blocks the way back once closed', () => {
    const grid = setGate(createGrid(6, 1), 2, 0, 'right')
    const closed = new Set([gateKey(2, 0)])

    const ball = createBallState(grid)
    ball.x = 2.5
    simulate(ball, press('left'), grid, 200, closed)

    // cannot retreat past the gate's left edge
    expect(ball.x).toBeGreaterThanOrEqual(2 + BALL_RADIUS - 1e-6)
  })

  it('does not modify the level when a gate closes', () => {
    // The original wrote gate state back into grid.cells, corrupting the level
    // for every later attempt. Closed gates live in game state now.
    const grid = setGate(createGrid(6, 1), 2, 0, 'right')
    const before = JSON.stringify(grid)

    const ball = createBallState(grid)
    simulate(ball, press('right'), grid, 200, new Set([gateKey(2, 0)]))

    expect(JSON.stringify(grid)).toBe(before)
  })
})

describe('lethal cells', () => {
  it('reports traps and mimics with the cause that killed you', () => {
    const grid = createGrid(3, 3)
    grid.cells[4].trap = true
    const ball = createBallState(grid)
    ball.x = 1.5
    ball.y = 1.5
    expect(checkLethal(ball, grid)).toMatchObject({ x: 1, y: 1, cause: 'trap' })

    grid.cells[4].trap = false
    grid.cells[4].mimic = true
    expect(checkLethal(ball, grid)).toMatchObject({ cause: 'mimic' })
  })

  it('a mimic is lethal — it was inert before, because nothing set cell.mimic', () => {
    const grid = createGrid(3, 3)
    grid.cells[0].mimic = true
    const ball = createBallState(grid)
    expect(checkLethal(ball, grid)?.cause).toBe('mimic')
  })

  it('reports nothing on an ordinary cell', () => {
    const grid = createGrid(3, 3)
    expect(checkLethal(createBallState(grid), grid)).toBeNull()
  })
})

describe('level queries', () => {
  it('detects the exit only in the exit cell', () => {
    const grid = createGrid(4, 4)
    grid.end = { x: 3, y: 3 }
    const ball = createBallState(grid)

    expect(checkWin(ball, grid)).toBe(false)
    ball.x = 3.5
    ball.y = 3.5
    expect(checkWin(ball, grid)).toBe(true)
  })

  it('detects memory wipe zones', () => {
    const grid = createGrid(3, 3)
    grid.cells[4].memoryWipe = true
    const ball = createBallState(grid)
    expect(checkMemoryWipe(ball, grid)).toBe(false)
    ball.x = 1.5
    ball.y = 1.5
    expect(checkMemoryWipe(ball, grid)).toBe(true)
  })

  it('reports the cell under the ball', () => {
    const grid = createGrid(4, 4)
    const ball = createBallState(grid)
    ball.x = 2.7
    ball.y = 1.2
    expect(cellUnder(ball, grid)).toMatchObject({ x: 2, y: 1 })
  })
})
