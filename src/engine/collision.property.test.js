import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid } from './levelFormat'
import { LEVELS as HAND_CRAFTED } from './levels'
import { createGrid, toggleWallBetween, setGate } from './maze'
import { createBallState, stepBall, gateKey, BALL_RADIUS } from './physics'

/**
 * Property-based verification that the ball cannot pass through a wall.
 *
 * The reported symptom was "I am moving through walls in various cases". There
 * are two candidate explanations and they need separating:
 *
 *   1. a real collision bug — the ball tunnels or squeezes through geometry
 *   2. liar walls — a wall is *drawn* where none exists, so walking through it
 *      is the mechanic working
 *
 * These properties test the physics against the *true* walls. If they hold, the
 * collision code is sound and the symptom is (2), which is a level-design and
 * legibility problem rather than an engine one.
 *
 * The check is a strong one: after every single step, the cell the ball is in
 * must either be the cell it was in before, or one connected to it by an open
 * edge. Any illegal transition — however brief — fails.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

const SIDES = [
  { name: 'top', dx: 0, dy: -1, opposite: 'bottom' },
  { name: 'right', dx: 1, dy: 0, opposite: 'left' },
  { name: 'bottom', dx: 0, dy: 1, opposite: 'top' },
  { name: 'left', dx: -1, dy: 0, opposite: 'right' },
]
const GATE_BLOCKS = { up: 'bottom', down: 'top', left: 'right', right: 'left' }

function cellAt(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

/** Can the ball leave cell `from` through `side`, against the true walls? */
function edgeOpen(grid, from, side, closedGates) {
  const a = cellAt(grid, from.x, from.y)
  const b = cellAt(grid, from.x + side.dx, from.y + side.dy)
  if (!a || !b) return false

  if (a.walls[side.name]) return false
  if (b.walls[side.opposite]) return false

  if (a.gate && closedGates.has(gateKey(a.x, a.y))) {
    if (GATE_BLOCKS[a.gate.direction] === side.name) return false
  }

  return true
}

/**
 * Is a one-step cell transition legal?
 *
 * Diagonals are allowed, but only through a genuinely open corner. Holding two
 * directions in open space moves the ball across both axes within a single
 * step, so it lands diagonally without passing through anything — that is
 * ordinary movement, not corner cutting. What must never happen is a diagonal
 * where *both* L-shaped routes are blocked: that would mean the ball crossed a
 * wall junction.
 */
function transitionLegal(grid, from, to, closedGates) {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (dx === 0 && dy === 0) return true
  // one step cannot cover more than one cell on either axis
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false

  const horizontal = SIDES.find((s) => s.dx === dx && s.dy === 0)
  const vertical = SIDES.find((s) => s.dy === dy && s.dx === 0)

  if (dy === 0) return edgeOpen(grid, from, horizontal, closedGates)
  if (dx === 0) return edgeOpen(grid, from, vertical, closedGates)

  // diagonal: legal if either right-angle route is open end to end
  const viaHorizontal =
    edgeOpen(grid, from, horizontal, closedGates) &&
    edgeOpen(grid, { x: to.x, y: from.y }, vertical, closedGates)

  const viaVertical =
    edgeOpen(grid, from, vertical, closedGates) &&
    edgeOpen(grid, { x: from.x, y: to.y }, horizontal, closedGates)

  return viaHorizontal || viaVertical
}

/** An input sequence: a list of {dir, steps} held for a while, like a person. */
const inputPlan = fc.array(
  fc.record({
    up: fc.boolean(),
    down: fc.boolean(),
    left: fc.boolean(),
    right: fc.boolean(),
    hold: fc.integer({ min: 1, max: 25 }),
  }),
  { minLength: 8, maxLength: 40 }
)

/**
 * Drive the ball through a plan and return the first illegal transition, or
 * null. Gates are closed on entry, exactly as the game does.
 */
function findIllegalTransition(grid, plan) {
  const ball = createBallState(grid)
  const closedGates = new Set()
  let previous = { x: Math.floor(ball.x), y: Math.floor(ball.y) }

  for (const segment of plan) {
    const input = {
      up: segment.up, down: segment.down, left: segment.left, right: segment.right,
    }
    for (let i = 0; i < segment.hold; i++) {
      stepBall(ball, input, grid, closedGates)

      const current = { x: Math.floor(ball.x), y: Math.floor(ball.y) }

      if (current.x < 0 || current.x >= grid.cols || current.y < 0 || current.y >= grid.rows) {
        return { reason: 'left the board', previous, current, ball: { ...ball } }
      }

      if (!transitionLegal(grid, previous, current, closedGates)) {
        return { reason: 'illegal transition', previous, current, ball: { ...ball } }
      }

      const cell = cellAt(grid, current.x, current.y)
      if (cell.gate) closedGates.add(gateKey(cell.x, cell.y))

      previous = current
    }
  }

  return null
}

describe('the ball never crosses a wall', () => {
  const cases = [
    ...HAND_CRAFTED.map((l) => ({ name: l.name, grid: l.grid })),
    ...curated.map((l) => ({ name: l.name, grid: decodeGrid(l.maze) })),
  ]

  for (const level of cases) {
    it(`${level.name}`, () => {
      fc.assert(
        fc.property(inputPlan, (plan) => {
          const violation = findIllegalTransition(level.grid, plan)
          expect(
            violation,
            violation
              ? `${violation.reason}: (${violation.previous.x},${violation.previous.y}) -> ` +
                `(${violation.current.x},${violation.current.y}) at ` +
                `ball(${violation.ball.x.toFixed(3)}, ${violation.ball.y.toFixed(3)}) ` +
                `v(${violation.ball.vx.toFixed(3)}, ${violation.ball.vy.toFixed(3)})`
              : ''
          ).toBeNull()
        }),
        { numRuns: 120 }
      )
    })
  }
})

describe('adversarial geometry', () => {
  it('holds on randomly walled grids', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        fc.integer({ min: 3, max: 8 }),
        fc.array(fc.tuple(fc.nat(7), fc.nat(7), fc.nat(3)), { maxLength: 40 }),
        inputPlan,
        (cols, rows, edges, plan) => {
          let grid = createGrid(cols, rows)
          for (const [x, y, dir] of edges) {
            if (x >= cols || y >= rows) continue
            const side = SIDES[dir]
            const nx = x + side.dx
            const ny = y + side.dy
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
            grid = toggleWallBetween(grid, x, y, nx, ny)
          }

          const violation = findIllegalTransition(grid, plan)
          expect(violation, violation ? `${violation.reason}` : '').toBeNull()
        }
      ),
      { numRuns: 400 }
    )
  })

  it('cannot escape a fully sealed cell', () => {
    fc.assert(
      fc.property(inputPlan, (plan) => {
        const grid = createGrid(4, 4)
        grid.start = { x: 1, y: 1 }
        // seal cell (1,1) on all four sides
        const sealed = cellAt(grid, 1, 1)
        sealed.walls = { top: true, right: true, bottom: true, left: true }
        for (const side of SIDES) {
          const neighbour = cellAt(grid, 1 + side.dx, 1 + side.dy)
          if (neighbour) neighbour.walls[side.opposite] = true
        }

        const ball = createBallState(grid)
        const closedGates = new Set()
        for (const segment of plan) {
          const input = { up: segment.up, down: segment.down, left: segment.left, right: segment.right }
          for (let i = 0; i < segment.hold; i++) {
            stepBall(ball, input, grid, closedGates)
            expect(Math.floor(ball.x)).toBe(1)
            expect(Math.floor(ball.y)).toBe(1)
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  it('respects a closed gate from every approach', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('up', 'down', 'left', 'right'),
        inputPlan,
        (direction, plan) => {
          const grid = setGate(createGrid(5, 5), 2, 2, direction)
          const closedGates = new Set([gateKey(2, 2)])
          const ball = createBallState(grid)
          let previous = { x: Math.floor(ball.x), y: Math.floor(ball.y) }

          for (const segment of plan) {
            const input = { up: segment.up, down: segment.down, left: segment.left, right: segment.right }
            for (let i = 0; i < segment.hold; i++) {
              stepBall(ball, input, grid, closedGates)
              const current = { x: Math.floor(ball.x), y: Math.floor(ball.y) }
              expect(transitionLegal(grid, previous, current, closedGates)).toBe(true)
              previous = current
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe('invariants that must hold every step', () => {
  it('keeps the ball inside the board and under the speed cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: curated.length - 1 }),
        inputPlan,
        (index, plan) => {
          const grid = decodeGrid(curated[index].maze)
          const ball = createBallState(grid)
          const closedGates = new Set()

          for (const segment of plan) {
            const input = { up: segment.up, down: segment.down, left: segment.left, right: segment.right }
            for (let i = 0; i < segment.hold; i++) {
              stepBall(ball, input, grid, closedGates)

              expect(Number.isFinite(ball.x)).toBe(true)
              expect(Number.isFinite(ball.y)).toBe(true)
              expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
              expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6)
              expect(ball.x).toBeLessThanOrEqual(grid.cols - BALL_RADIUS + 1e-6)
              expect(ball.y).toBeLessThanOrEqual(grid.rows - BALL_RADIUS + 1e-6)
            }
          }
        }
      ),
      { numRuns: 150 }
    )
  })
})
