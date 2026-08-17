/**
 * Ball movement and collision.
 *
 * Carried over from the previous engine, which is the one part of it that
 * property tests never found a fault in once these three things were true:
 *
 * 1. Everything is in CELL units. One cell is 1.0. Baking pixel size into
 *    velocity and radius made the physics change with the render scale and made
 *    a responsive canvas impossible.
 *
 * 2. Movement advances on a FIXED timestep (see loop.js). Applying acceleration
 *    once per animation frame with no delta time made the ball move at double
 *    speed on a 120Hz display — the game was a different difficulty depending
 *    on the monitor.
 *
 * 3. Axes are resolved SEPARATELY. Advancing both and resolving once let the
 *    ball cut a diagonal corner out of a cell whose two facing sides were both
 *    walled: the position it got checked at was already past the junction.
 *
 * The constants are the original per-frame values and a step is 1/60s, so the
 * feel at 60Hz is unchanged.
 */

import { DIRECTIONS, inBounds, wallsAt, surfaceAt, GROUND, SAND, SNOW, TOP, RIGHT, BOTTOM, LEFT } from './grid.js'

// Cells. Strictly smaller than it was (0.3): a smaller ball fits anywhere a
// larger one did, so every level the oracle already proved stays proved, and
// the test suite re-judges them all against this number anyway.
const BALL_RADIUS = 0.22       // cells
const ACCEL = 0.036            // cells per step^2
const FRICTION = 0.82
const MAX_SPEED = 0.42         // cells per step
const BOUNCE = -0.3
const SUBSTEPS = 4

/**
 * Ground that changes how the ball moves.
 *
 * Only acceleration is scaled — never friction. Terminal velocity settles at
 * `ACCEL * FRICTION / (1 - FRICTION)`, so scaling acceleration scales the top
 * speed by exactly the same factor and leaves the handling identical: the ball
 * takes corners the way it always did, it just gets there sooner or later.
 * Scaling friction instead would make sand slippery and snow sticky, which
 * changes how the maze is steered rather than how fast it is crossed, and would
 * put the "never overlaps a wall" property at risk for the sake of a feeling.
 *
 * Sand is sun-baked flat and open; snow is deep and has to be waded.
 */
const SURFACES = {
  [GROUND]: 1,
  [SAND]: 1.55,
  [SNOW]: 0.72,
}

/** The acceleration multiplier under a point, in cell coordinates. */
function surfaceFactor(grid, x, y) {
  return SURFACES[surfaceAt(grid, Math.floor(x), Math.floor(y))] ?? 1
}

/** The slowest ground anywhere on this grid. The hunter is sized against it. */
function slowestSurface(grid) {
  if (!grid.surface) return 1
  let slowest = 1
  for (const kind of grid.surface) {
    const factor = SURFACES[kind] ?? 1
    if (factor < slowest) slowest = factor
  }
  return slowest
}

function createBall(grid) {
  return {
    x: grid.start.x + 0.5,
    y: grid.start.y + 0.5,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
  }
}

function resetBall(ball, grid) {
  ball.x = grid.start.x + 0.5
  ball.y = grid.start.y + 0.5
  ball.vx = 0
  ball.vy = 0
}

/**
 * Push the ball out of any wall it overlaps. Walls are mirrored, so the cell
 * under the centre carries everything that can stop it; the rim checks catch
 * the case where the circle reaches into a neighbour the centre is not in.
 */
function resolveCollisions(x, y, radius, grid) {
  let hitX = false
  let hitY = false

  if (x - radius < 0) { x = radius; hitX = true }
  if (x + radius > grid.cols) { x = grid.cols - radius; hitX = true }
  if (y - radius < 0) { y = radius; hitY = true }
  if (y + radius > grid.rows) { y = grid.rows - radius; hitY = true }

  for (let pass = 0; pass < 2; pass++) {
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    if (!inBounds(grid, cx, cy)) break
    const walls = wallsAt(grid, cx, cy)

    if ((walls & RIGHT) && x + radius > cx + 1) { x = cx + 1 - radius; hitX = true }
    if ((walls & LEFT) && x - radius < cx) { x = cx + radius; hitX = true }
    if ((walls & BOTTOM) && y + radius > cy + 1) { y = cy + 1 - radius; hitY = true }
    if ((walls & TOP) && y - radius < cy) { y = cy + radius; hitY = true }

    const rightCell = Math.floor(x + radius)
    if (inBounds(grid, rightCell, cy) && (wallsAt(grid, rightCell, cy) & LEFT) && x < rightCell) {
      x = rightCell - radius
      hitX = true
    }
    const leftCell = Math.floor(x - radius)
    if (inBounds(grid, leftCell, cy) && (wallsAt(grid, leftCell, cy) & RIGHT) && x > leftCell + 1) {
      x = leftCell + 1 + radius
      hitX = true
    }
    const belowCell = Math.floor(y + radius)
    if (inBounds(grid, cx, belowCell) && (wallsAt(grid, cx, belowCell) & TOP) && y < belowCell) {
      y = belowCell - radius
      hitY = true
    }
    const aboveCell = Math.floor(y - radius)
    if (inBounds(grid, cx, aboveCell) && (wallsAt(grid, cx, aboveCell) & BOTTOM) && y > aboveCell + 1) {
      y = aboveCell + 1 + radius
      hitY = true
    }
  }

  return { x, y, hitX, hitY }
}

/** Advance the ball by exactly one fixed step. Mutates `ball`. */
function stepBall(ball, input, grid) {
  let dx = 0
  let dy = 0
  if (input.up) dy -= 1
  if (input.down) dy += 1
  if (input.left) dx -= 1
  if (input.right) dx += 1

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2
    dy *= Math.SQRT1_2
  }

  // the ground under the ball's centre, not under each substep: one lookup a
  // step keeps this cheap for the solvers, which run it hundreds of thousands
  // of times per level
  const accel = ACCEL * surfaceFactor(grid, ball.x, ball.y)

  ball.vx = (ball.vx + dx * accel) * FRICTION
  ball.vy = (ball.vy + dy * accel) * FRICTION

  const speed = Math.hypot(ball.vx, ball.vy)
  if (speed > MAX_SPEED) {
    ball.vx = (ball.vx / speed) * MAX_SPEED
    ball.vy = (ball.vy / speed) * MAX_SPEED
  }

  const stepVx = ball.vx / SUBSTEPS
  const stepVy = ball.vy / SUBSTEPS
  let hitX = false
  let hitY = false

  for (let i = 0; i < SUBSTEPS; i++) {
    // one axis at a time — see the note at the top about corner cutting
    let resolved = resolveCollisions(ball.x + stepVx, ball.y, ball.radius, grid)
    ball.x = resolved.x
    ball.y = resolved.y
    if (resolved.hitX) hitX = true
    if (resolved.hitY) hitY = true

    resolved = resolveCollisions(ball.x, ball.y + stepVy, ball.radius, grid)
    ball.x = resolved.x
    ball.y = resolved.y
    if (resolved.hitX) hitX = true
    if (resolved.hitY) hitY = true
  }

  if (hitX) ball.vx *= BOUNCE
  if (hitY) ball.vy *= BOUNCE
}

function ballCell(ball) {
  return { x: Math.floor(ball.x), y: Math.floor(ball.y) }
}

export {
  BALL_RADIUS,
  SURFACES,
  surfaceFactor,
  slowestSurface,
  ACCEL,
  FRICTION,
  MAX_SPEED,
  SUBSTEPS,
  DIRECTIONS,
  createBall,
  resetBall,
  stepBall,
  resolveCollisions,
  ballCell,
}
