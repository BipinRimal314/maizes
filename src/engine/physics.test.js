import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createGrid, setWall, DIRECTIONS, ALL } from './grid.js'
import { createBall, stepBall, BALL_RADIUS, MAX_SPEED } from './physics.js'
import { createRng } from '../generate/rng.js'
import { buildMaze } from '../generate/maze.js'

/**
 * The ball must never cross a wall, and must never sink into one.
 *
 * These are separate claims. The first is topological — did it end up in a cell
 * it had no right to reach. The second is geometric — is its circle overlapping
 * a wall it is merely touching. The old engine passed the first while failing
 * the second, which looked exactly like clipping to anyone playing.
 */

const inputPlan = fc.array(
  fc.record({
    up: fc.boolean(), down: fc.boolean(), left: fc.boolean(), right: fc.boolean(),
    hold: fc.integer({ min: 1, max: 30 }),
  }),
  { minLength: 8, maxLength: 40 }
)

const wallsAt = (g, x, y) => (x < 0 || x >= g.cols || y < 0 || y >= g.rows ? ALL : g.walls[y * g.cols + x])

function edgeOpen(grid, from, direction) {
  const nx = from.x + direction.dx
  const ny = from.y + direction.dy
  if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) return false
  if (wallsAt(grid, from.x, from.y) & direction.bit) return false
  if (wallsAt(grid, nx, ny) & direction.opposite) return false
  return true
}

/** Diagonals are legal only through a genuinely open corner. */
function transitionLegal(grid, from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return true
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false

  const horizontal = DIRECTIONS.find((d) => d.dx === dx && d.dy === 0)
  const vertical = DIRECTIONS.find((d) => d.dy === dy && d.dx === 0)

  if (dy === 0) return edgeOpen(grid, from, horizontal)
  if (dx === 0) return edgeOpen(grid, from, vertical)

  return (edgeOpen(grid, from, horizontal) && edgeOpen(grid, { x: to.x, y: from.y }, vertical))
    || (edgeOpen(grid, from, vertical) && edgeOpen(grid, { x: from.x, y: to.y }, horizontal))
}

/** How deep the ball's circle is inside a wall, if at all. */
function penetration(grid, ball) {
  const cx = Math.floor(ball.x)
  const cy = Math.floor(ball.y)
  if (cx < 0 || cx >= grid.cols || cy < 0 || cy >= grid.rows) return { side: 'off-board', depth: Infinity }
  const w = wallsAt(grid, cx, cy)
  const r = ball.radius
  const checks = [
    { side: 'left', has: w & 8, depth: cx - (ball.x - r) },
    { side: 'right', has: w & 2, depth: (ball.x + r) - (cx + 1) },
    { side: 'top', has: w & 1, depth: cy - (ball.y - r) },
    { side: 'bottom', has: w & 4, depth: (ball.y + r) - (cy + 1) },
    { side: 'board-left', has: 1, depth: r - ball.x },
    { side: 'board-right', has: 1, depth: (ball.x + r) - grid.cols },
    { side: 'board-top', has: 1, depth: r - ball.y },
    { side: 'board-bottom', has: 1, depth: (ball.y + r) - grid.rows },
  ]
  let worst = null
  for (const c of checks) {
    if (!c.has) continue
    if (c.depth > 1e-9 && (!worst || c.depth > worst.depth)) worst = { side: c.side, depth: c.depth }
  }
  return worst
}

function run(grid, plan, check) {
  const ball = createBall(grid)
  let previous = { x: Math.floor(ball.x), y: Math.floor(ball.y) }
  for (const segment of plan) {
    const input = { up: segment.up, down: segment.down, left: segment.left, right: segment.right }
    for (let i = 0; i < segment.hold; i++) {
      stepBall(ball, input, grid)
      const current = { x: Math.floor(ball.x), y: Math.floor(ball.y) }
      const failure = check(grid, ball, previous, current)
      if (failure) return failure
      previous = current
    }
  }
  return null
}

function randomMaze(seed, size) {
  const built = buildMaze(createRng(seed), { cols: size, rows: size, loops: 0.1 })
  return built ? built.grid : null
}

describe('walls are solid', () => {
  it('the ball never makes an illegal cell transition', { timeout: 60000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 4, max: 12 }), inputPlan,
        (seed, size, plan) => {
          const grid = randomMaze(seed, size)
          if (!grid) return
          const failure = run(grid, plan, (g, ball, previous, current) =>
            transitionLegal(g, previous, current) ? null
              : `(${previous.x},${previous.y}) -> (${current.x},${current.y})`)
          expect(failure, failure || '').toBeNull()
        }),
      { numRuns: 300 }
    )
  })

  it('the ball never sinks into a wall', { timeout: 60000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 4, max: 12 }), inputPlan,
        (seed, size, plan) => {
          const grid = randomMaze(seed, size)
          if (!grid) return
          const failure = run(grid, plan, (g, ball) => {
            const hit = penetration(g, ball)
            return hit ? `${hit.side} by ${hit.depth.toFixed(6)} cells` : null
          })
          expect(failure, failure || '').toBeNull()
        }),
      { numRuns: 300 }
    )
  })

  it('cannot escape a sealed cell', { timeout: 30000 }, () => {
    fc.assert(
      fc.property(inputPlan, (plan) => {
        const grid = createGrid(3, 3)
        grid.start = { x: 1, y: 1 }
        for (const d of DIRECTIONS) setWall(grid, 1, 1, d, true)
        const failure = run(grid, plan, (g, ball) =>
          Math.floor(ball.x) === 1 && Math.floor(ball.y) === 1 ? null : 'escaped')
        expect(failure).toBeNull()
      }),
      { numRuns: 150 }
    )
  })

  it('stays under the speed cap', { timeout: 30000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), inputPlan, (seed, plan) => {
        const grid = randomMaze(seed, 10)
        if (!grid) return
        const failure = run(grid, plan, (g, ball) =>
          Math.hypot(ball.vx, ball.vy) <= MAX_SPEED + 1e-9 ? null : 'over the cap')
        expect(failure).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})

describe('units', () => {
  it('places the ball at the centre of the start cell, in cell units', () => {
    const grid = createGrid(5, 5)
    grid.start = { x: 2, y: 3 }
    const ball = createBall(grid)
    expect(ball.x).toBe(2.5)
    expect(ball.y).toBe(3.5)
    expect(ball.radius).toBe(BALL_RADIUS)
  })

  it('is deterministic', () => {
    const grid = randomMaze(42, 8)
    const a = createBall(grid)
    const b = createBall(grid)
    const input = { up: false, down: false, left: false, right: true }
    for (let i = 0; i < 200; i++) { stepBall(a, input, grid); stepBall(b, input, grid) }
    expect(a.x).toBe(b.x)
    expect(a.y).toBe(b.y)
  })
})
