/**
 * Ball movement and collision.
 *
 * Two things changed from the original, both bugs rather than preferences:
 *
 * 1. Everything is in CELL units, not pixels. The old code baked `cellSize`
 *    into velocity, acceleration and radius, so the physics changed whenever
 *    the render scale changed, which made a responsive canvas impossible. One
 *    cell is 1.0. The renderer is the only thing that knows about pixels.
 *
 * 2. Movement advances on a FIXED timestep (see loop.js). The old code applied
 *    acceleration and friction once per requestAnimationFrame with no delta
 *    time, so the ball moved at double speed on a 120Hz display and the game
 *    was a different difficulty depending on the monitor. The constants below
 *    are the original per-frame values and a step is 1/60s, so the feel at
 *    60Hz is unchanged — it is now the same everywhere else too.
 *
 * The motor modifiers are gone (see obstacles.js). Nothing in here makes the
 * ball harder to steer.
 */

import { getCell } from './maze'

const BALL_RADIUS = 0.3        // cells
const ACCEL = 0.036            // cells per step^2 (was 3.6 * 0.3 px at cellSize 30)
const FRICTION = 0.82
const MAX_SPEED = 0.42         // cells per step
const BOUNCE = -0.3            // velocity retained, reversed, on impact
const SUBSTEPS = 4             // collision substeps, prevents tunnelling

function createBallState(grid) {
  return {
    x: grid.start.x + 0.5,
    y: grid.start.y + 0.5,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
  }
}

function gateKey(x, y) {
  return `${x},${y}`
}

/**
 * A closed gate blocks the direction you would travel to go back through it.
 * `closedGates` lives in game state; the original mutated the level's own cell
 * array to close a gate, which corrupted the level for every later attempt.
 */
function gateBlocks(cell, closedGates) {
  if (!cell || !cell.gate) return null
  if (!closedGates.has(gateKey(cell.x, cell.y))) return null
  return cell.gate.direction
}

function resolveCollisions(x, y, radius, grid, closedGates) {
  let hitX = false
  let hitY = false

  // outer border
  if (x - radius < 0) { x = radius; hitX = true }
  if (x + radius > grid.cols) { x = grid.cols - radius; hitX = true }
  if (y - radius < 0) { y = radius; hitY = true }
  if (y + radius > grid.rows) { y = grid.rows - radius; hitY = true }

  // Walls are mirrored onto both neighbouring cells, so the cell under the
  // ball's centre carries every wall that can stop it. Two passes let a
  // resolution on one axis be re-checked against the other.
  for (let pass = 0; pass < 2; pass++) {
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    const cell = getCell(grid, cx, cy)
    if (!cell) break

    if (cell.walls.right && x + radius > cx + 1) { x = cx + 1 - radius; hitX = true }
    if (cell.walls.left && x - radius < cx) { x = cx + radius; hitX = true }
    if (cell.walls.bottom && y + radius > cy + 1) { y = cy + 1 - radius; hitY = true }
    if (cell.walls.top && y - radius < cy) { y = cy + radius; hitY = true }

    const blocked = gateBlocks(cell, closedGates)
    if (blocked === 'right' && x - radius < cx) { x = cx + radius; hitX = true }
    if (blocked === 'left' && x + radius > cx + 1) { x = cx + 1 - radius; hitX = true }
    if (blocked === 'down' && y - radius < cy) { y = cy + radius; hitY = true }
    if (blocked === 'up' && y + radius > cy + 1) { y = cy + 1 - radius; hitY = true }

    // The ball's rim can reach into a neighbour whose facing wall the centre
    // cell does not carry (corner approaches).
    const rightCell = getCell(grid, Math.floor(x + radius), cy)
    if (rightCell && rightCell.walls.left) {
      const wallX = Math.floor(x + radius)
      if (x < wallX) { x = wallX - radius; hitX = true }
    }
    const leftCell = getCell(grid, Math.floor(x - radius), cy)
    if (leftCell && leftCell.walls.right) {
      const wallX = Math.floor(x - radius) + 1
      if (x > wallX) { x = wallX + radius; hitX = true }
    }
    const belowCell = getCell(grid, cx, Math.floor(y + radius))
    if (belowCell && belowCell.walls.top) {
      const wallY = Math.floor(y + radius)
      if (y < wallY) { y = wallY - radius; hitY = true }
    }
    const aboveCell = getCell(grid, cx, Math.floor(y - radius))
    if (aboveCell && aboveCell.walls.bottom) {
      const wallY = Math.floor(y - radius) + 1
      if (y > wallY) { y = wallY + radius; hitY = true }
    }
  }

  return { x, y, hitX, hitY }
}

/**
 * Advance the ball by exactly one fixed step. Mutates `ball` — this runs a few
 * hundred times a second and the original allocated a fresh ball object plus a
 * fresh copy of every cell in the grid on every single one.
 */
function stepBall(ball, input, grid, closedGates) {
  let dx = 0
  let dy = 0
  if (input.up) dy -= 1
  if (input.down) dy += 1
  if (input.left) dx -= 1
  if (input.right) dx += 1

  // normalise so diagonals are not faster than orthogonals
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2
    dy *= Math.SQRT1_2
  }

  ball.vx = (ball.vx + dx * ACCEL) * FRICTION
  ball.vy = (ball.vy + dy * ACCEL) * FRICTION

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
    const resolved = resolveCollisions(
      ball.x + stepVx, ball.y + stepVy, ball.radius, grid, closedGates
    )
    ball.x = resolved.x
    ball.y = resolved.y
    if (resolved.hitX) hitX = true
    if (resolved.hitY) hitY = true
  }

  if (hitX) ball.vx *= BOUNCE
  if (hitY) ball.vy *= BOUNCE
}

function cellUnder(ball, grid) {
  return getCell(grid, Math.floor(ball.x), Math.floor(ball.y))
}

/** Traps and mimics both kill; they differ only in what the player was shown. */
function checkLethal(ball, grid) {
  const cell = cellUnder(ball, grid)
  if (!cell) return null
  if (cell.trap) return { x: cell.x, y: cell.y, cause: 'trap' }
  if (cell.mimic) return { x: cell.x, y: cell.y, cause: 'mimic' }
  return null
}

function checkModifier(ball, grid) {
  const cell = cellUnder(ball, grid)
  if (!cell || !cell.modifier) return null
  return { type: cell.modifier, x: cell.x, y: cell.y }
}

function checkMemoryWipe(ball, grid) {
  const cell = cellUnder(ball, grid)
  return !!(cell && cell.memoryWipe)
}

function checkWin(ball, grid) {
  return Math.floor(ball.x) === grid.end.x && Math.floor(ball.y) === grid.end.y
}

export {
  BALL_RADIUS,
  ACCEL,
  FRICTION,
  MAX_SPEED,
  SUBSTEPS,
  createBallState,
  stepBall,
  resolveCollisions,
  cellUnder,
  checkLethal,
  checkModifier,
  checkMemoryWipe,
  checkWin,
  gateKey,
}
