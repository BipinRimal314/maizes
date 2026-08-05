import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid } from './levelFormat'
import { createGrid, toggleWallBetween } from './maze'
import { createBallState, stepBall, BALL_RADIUS } from './physics'

/**
 * The ball's body must never overlap a wall.
 *
 * collision.property.test.js proves the ball never makes an illegal *cell
 * transition*. That is a weaker claim than it sounds: the ball can stay in the
 * correct cell the whole time and still have its circle sunk into the wall
 * beside it. Visually that is indistinguishable from clipping through, and it
 * is what "I am going through the line" describes.
 *
 * The invariant here is geometric, not topological: for the cell the ball
 * occupies, every walled side must be at least one radius away from the centre.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

// Floating point slack only — anything larger is a real overlap.
const EPSILON = 1e-9

const inputPlan = fc.array(
  fc.record({
    up: fc.boolean(),
    down: fc.boolean(),
    left: fc.boolean(),
    right: fc.boolean(),
    hold: fc.integer({ min: 1, max: 30 }),
  }),
  { minLength: 10, maxLength: 50 }
)

function cellAt(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

/** How far the ball has sunk into a wall, and which one. Null if clear. */
function penetration(grid, ball) {
  const cx = Math.floor(ball.x)
  const cy = Math.floor(ball.y)
  const cell = cellAt(grid, cx, cy)
  if (!cell) return { side: 'off-board', depth: Infinity }

  const r = ball.radius
  const checks = [
    { side: 'left', depth: cx - (ball.x - r), has: cell.walls.left },
    { side: 'right', depth: (ball.x + r) - (cx + 1), has: cell.walls.right },
    { side: 'top', depth: cy - (ball.y - r), has: cell.walls.top },
    { side: 'bottom', depth: (ball.y + r) - (cy + 1), has: cell.walls.bottom },
  ]

  let worst = null
  for (const check of checks) {
    if (!check.has) continue
    if (check.depth > EPSILON && (!worst || check.depth > worst.depth)) {
      worst = { side: check.side, depth: check.depth }
    }
  }

  // the outer border is a wall too
  const border = [
    { side: 'board-left', depth: r - ball.x },
    { side: 'board-right', depth: (ball.x + r) - grid.cols },
    { side: 'board-top', depth: r - ball.y },
    { side: 'board-bottom', depth: (ball.y + r) - grid.rows },
  ]
  for (const check of border) {
    if (check.depth > EPSILON && (!worst || check.depth > worst.depth)) {
      worst = { side: check.side, depth: check.depth }
    }
  }

  return worst
}

function deepestPenetration(grid, plan) {
  const ball = createBallState(grid)
  const closedGates = new Set()
  let worst = null

  for (const segment of plan) {
    const input = { up: segment.up, down: segment.down, left: segment.left, right: segment.right }
    for (let i = 0; i < segment.hold; i++) {
      stepBall(ball, input, grid, closedGates)
      const hit = penetration(grid, ball)
      if (hit && (!worst || hit.depth > worst.depth)) {
        worst = { ...hit, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }
      }
    }
  }

  return worst
}

describe('the ball never sinks into a wall', () => {
  for (const level of curated) {
    it(`${level.name}`, () => {
      const grid = decodeGrid(level.maze)
      fc.assert(
        fc.property(inputPlan, (plan) => {
          const worst = deepestPenetration(grid, plan)
          expect(
            worst,
            worst
              ? `sank ${worst.depth.toFixed(6)} cells into the ${worst.side} wall ` +
                `at (${worst.x.toFixed(4)}, ${worst.y.toFixed(4)}) ` +
                `v(${worst.vx.toFixed(4)}, ${worst.vy.toFixed(4)})`
              : ''
          ).toBeNull()
        }),
        { numRuns: 60 }
      )
    })
  }
})

describe('pressed hard against geometry', () => {
  it('holds when driven straight into a wall at full speed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('up', 'down', 'left', 'right'),
        fc.integer({ min: 60, max: 400 }),
        (direction, steps) => {
          const grid = createGrid(6, 6)
          const ball = createBallState(grid)
          ball.x = 3.5
          ball.y = 3.5
          const input = { up: false, down: false, left: false, right: false }
          input[direction] = true

          for (let i = 0; i < steps; i++) {
            stepBall(ball, input, grid, new Set())
            const hit = penetration(grid, ball)
            expect(hit, hit ? `${hit.side} by ${hit.depth}` : '').toBeNull()
          }
        }
      ),
      { numRuns: 120 }
    )
  })

  it('holds when jammed into a corner from every diagonal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { up: true, left: true }, { up: true, right: true },
          { down: true, left: true }, { down: true, right: true }
        ),
        (dirs) => {
          const grid = createGrid(5, 5)
          const ball = createBallState(grid)
          ball.x = 2.5
          ball.y = 2.5
          const input = { up: false, down: false, left: false, right: false, ...dirs }

          for (let i = 0; i < 300; i++) {
            stepBall(ball, input, grid, new Set())
            const hit = penetration(grid, ball)
            expect(hit, hit ? `${hit.side} by ${hit.depth}` : '').toBeNull()
          }
        }
      ),
      { numRuns: 40 }
    )
  })

  it('holds in a one-cell pocket with walls on all sides', () => {
    fc.assert(
      fc.property(inputPlan, (plan) => {
        let grid = createGrid(3, 3)
        grid.start = { x: 1, y: 1 }
        for (const [nx, ny] of [[0, 1], [2, 1], [1, 0], [1, 2]]) {
          grid = toggleWallBetween(grid, 1, 1, nx, ny)
        }

        const worst = deepestPenetration(grid, plan)
        expect(worst, worst ? `${worst.side} by ${worst.depth}` : '').toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('holds on randomly walled grids', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 7 }),
        fc.array(fc.tuple(fc.nat(6), fc.nat(6), fc.nat(3)), { maxLength: 40 }),
        inputPlan,
        (size, edges, plan) => {
          let grid = createGrid(size, size)
          const deltas = [[0, -1], [1, 0], [0, 1], [-1, 0]]
          for (const [x, y, dir] of edges) {
            if (x >= size || y >= size) continue
            const [dx, dy] = deltas[dir]
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue
            grid = toggleWallBetween(grid, x, y, nx, ny)
          }

          const worst = deepestPenetration(grid, plan)
          expect(worst, worst ? `${worst.side} by ${worst.depth}` : '').toBeNull()
        }
      ),
      { numRuns: 250 }
    )
  })
})

describe('the collision radius', () => {
  it('is the value the renderer is given', () => {
    // If these ever diverge the ball will look wrong against walls even when
    // the physics is correct.
    const grid = createGrid(4, 4)
    expect(createBallState(grid).radius).toBe(BALL_RADIUS)
  })
})
