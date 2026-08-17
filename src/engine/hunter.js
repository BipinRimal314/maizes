/**
 * The hunter: the fourth and last mechanic.
 *
 * The rule, in full:
 *
 *   Take too long and something starts looking for you. It always knows where
 *   you are. It is slower than you. Touching it sends you back to the start.
 *   Returning to the start — for any reason — puts it back to sleep.
 *
 * That last clause is what keeps it from being the mechanic that broke the
 * previous game. A chaser that persists across a respawn can camp the start and
 * kill you the instant you appear, which is not difficulty, it is a soft lock.
 * Sleeping on every return to the start also means the hunter's clock and the
 * player's "current attempt" are the same clock, so the thing the player has to
 * reason about is exactly the thing they can see.
 *
 * Two invariants make it fair, and both are tested rather than argued:
 *
 * 1. **It cannot catch you through a wall.** It walks the same graph the ball
 *    does, and a catch additionally requires the two cells to be the same or
 *    joined by an open edge. Proximity alone is not enough — two cells either
 *    side of a wall can put the centres well inside the catch distance.
 *
 * 2. **It is strictly slower than the ball.** The cap is checked against the
 *    ball's real terminal velocity, not its `MAX_SPEED` constant — friction
 *    means the ball never actually reaches `MAX_SPEED`, and sizing the hunter
 *    against a number it cannot reach would make it faster than the player it
 *    is chasing.
 *
 *    It is also sized against the **slowest ground on that particular grid**,
 *    not against the ball at full tilt. Deep snow costs the ball nearly a third
 *    of its top speed; a hunter allowed two thirds of the *unslowed* ball would
 *    be faster than a player wading through it, and being caught now costs the
 *    whole level. The cap is per-grid for exactly that reason.
 *
 * It never gates correctness. `spawnMs` is derived per level from how long a
 * perfect player actually takes (see `generate.js`), so a player walking the
 * optimal route never meets it at all. The oracle then re-judges the level with
 * the hunter present and still demands zero deaths from perfect play, so the
 * claim is checked and not merely intended.
 */

import { DIRECTIONS, isOpen, inBounds, key } from './grid.js'
import { ACCEL, FRICTION, slowestSurface } from './physics.js'

/**
 * The ball's real top speed, in cells per step.
 *
 * Terminal velocity of `v <- (v + ACCEL) * FRICTION`, which settles where
 * `v = ACCEL * FRICTION / (1 - FRICTION)`. This is roughly 0.164 — well under
 * the 0.42 `MAX_SPEED` clamp, which only ever bites on a diagonal input spike.
 */
const BALL_TOP_SPEED = (ACCEL * FRICTION) / (1 - FRICTION)

/** Share of the ball's speed a hunter may have. A third in hand is a real escape. */
const HUNTER_SPEED_SHARE = 0.67

/** The cap on ordinary ground, with no slow surfaces anywhere. */
const HUNTER_SPEED_CAP = BALL_TOP_SPEED * HUNTER_SPEED_SHARE

/**
 * The cap for one grid: the ball's top speed on the worst ground it contains.
 * On a level with no snow this is just `HUNTER_SPEED_CAP`.
 */
function hunterSpeedCap(grid) {
  return BALL_TOP_SPEED * slowestSurface(grid) * HUNTER_SPEED_SHARE
}

/** Centres must be this close to count as a touch, on top of the open-edge test. */
const CATCH_DISTANCE = 0.5

/** How long the hunter telegraphs before it actually starts moving. */
const WAKE_WARNING_MS = 2500

const HUNTER_RADIUS = 0.3

function createHunter(grid) {
  if (!grid.hunter) return null
  return {
    x: 0,
    y: 0,
    active: false,
    spawnMs: grid.hunter.spawnMs,
    wakesAt: grid.hunter.spawnMs,
    speed: Math.min(grid.hunter.speed, hunterSpeedCap(grid)),
    radius: HUNTER_RADIUS,
    field: null,        // BFS distances from the player's cell
    fieldFrom: null,    // the cell that field was computed from
  }
}

/** Put the hunter back to sleep and restart its clock. Called on every respawn. */
function sleepHunter(hunter, now) {
  if (!hunter) return
  hunter.active = false
  hunter.wakesAt = now + hunter.spawnMs
  hunter.field = null
  hunter.fieldFrom = null
}

/**
 * Where the hunter appears: the cell furthest from the player through the maze.
 *
 * Furthest *through the maze* rather than across the board, because a cell on
 * the far side of the board can be two corridors away, and a hunter that spawns
 * on top of you has no counterplay.
 */
function spawnCell(grid, from) {
  let best = { x: from.x, y: from.y, d: -1 }
  const seen = new Map([[key(from.x, from.y), 0]])
  const queue = [from]

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    const d = seen.get(key(at.x, at.y))
    if (d > best.d) best = { x: at.x, y: at.y, d }

    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      const id = key(nx, ny)
      if (seen.has(id)) continue
      seen.set(id, d + 1)
      queue.push({ x: nx, y: ny })
    }
  }

  return { x: best.x, y: best.y }
}

/**
 * Distances from the player's cell to every other cell, as a flat array.
 *
 * The hunter chases by walking downhill on this. Recomputing it costs one BFS
 * and is only done when the player changes cell — once every few steps rather
 * than every step, which matters because the solvers run this engine for
 * hundreds of thousands of steps per level.
 */
function distanceField(grid, from) {
  const field = new Int32Array(grid.cols * grid.rows).fill(-1)
  field[from.y * grid.cols + from.x] = 0
  const queue = [from]

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    const d = field[at.y * grid.cols + at.x]

    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      if (field[ny * grid.cols + nx] !== -1) continue
      field[ny * grid.cols + nx] = d + 1
      queue.push({ x: nx, y: ny })
    }
  }

  return field
}

/** The neighbouring cell that gets the hunter closer, or null if it is there. */
function stepTowards(grid, field, from) {
  const here = field[from.y * grid.cols + from.x]
  if (here <= 0) return null

  for (const direction of DIRECTIONS) {
    if (!isOpen(grid, from.x, from.y, direction)) continue
    const nx = from.x + direction.dx
    const ny = from.y + direction.dy
    if (field[ny * grid.cols + nx] === here - 1) return { x: nx, y: ny }
  }

  return null
}

/** Same cell, or two cells with an open edge between them. Never through a wall. */
function canTouch(grid, a, b) {
  if (a.x === b.x && a.y === b.y) return true
  for (const direction of DIRECTIONS) {
    if (a.x + direction.dx === b.x && a.y + direction.dy === b.y) {
      return isOpen(grid, a.x, a.y, direction)
    }
  }
  return false
}

/**
 * Advance the hunter one fixed step. Returns true if it caught the ball.
 *
 * Movement is axis-aligned by construction: the hunter is always travelling
 * between the centres of two cells joined by an open edge, so it never needs to
 * resolve a collision. That is the whole reason it does not use the ball's
 * physics — it cannot clip through anything it is not allowed to walk through.
 */
function stepHunter(hunter, grid, ball, now) {
  if (!hunter) return false

  if (!hunter.active) {
    if (now < hunter.wakesAt) return false
    hunter.active = true
    const at = spawnCell(grid, { x: Math.floor(ball.x), y: Math.floor(ball.y) })
    hunter.x = at.x + 0.5
    hunter.y = at.y + 0.5
  }

  const playerCell = { x: Math.floor(ball.x), y: Math.floor(ball.y) }
  if (!inBounds(grid, playerCell.x, playerCell.y)) return false

  if (!hunter.field || hunter.fieldFrom.x !== playerCell.x || hunter.fieldFrom.y !== playerCell.y) {
    hunter.field = distanceField(grid, playerCell)
    hunter.fieldFrom = playerCell
  }

  const cell = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }
  let budget = hunter.speed

  // Walk toward the centre of the next cell, then re-aim. A whole step can
  // cross a short remaining gap and still have distance left, so this loops.
  while (budget > 1e-9) {
    const at = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }
    const next = stepTowards(grid, hunter.field, at)
    const target = next
      ? { x: next.x + 0.5, y: next.y + 0.5 }
      : { x: at.x + 0.5, y: at.y + 0.5 }

    const dx = target.x - hunter.x
    const dy = target.y - hunter.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1e-9) break

    const travel = Math.min(budget, distance)
    hunter.x += (dx / distance) * travel
    hunter.y += (dy / distance) * travel
    budget -= travel
  }

  cell.x = Math.floor(hunter.x)
  cell.y = Math.floor(hunter.y)

  const touching = Math.hypot(hunter.x - ball.x, hunter.y - ball.y) < CATCH_DISTANCE
  return touching && canTouch(grid, cell, playerCell)
}

/** Presentation state: 0 while asleep and far off, 1 the moment it wakes. */
function wakeProgress(hunter, now) {
  if (!hunter || hunter.active) return 1
  const remaining = hunter.wakesAt - now
  if (remaining >= WAKE_WARNING_MS) return 0
  return 1 - remaining / WAKE_WARNING_MS
}

export {
  BALL_TOP_SPEED,
  HUNTER_SPEED_CAP,
  HUNTER_SPEED_SHARE,
  hunterSpeedCap,
  CATCH_DISTANCE,
  WAKE_WARNING_MS,
  HUNTER_RADIUS,
  createHunter,
  sleepHunter,
  stepHunter,
  spawnCell,
  distanceField,
  stepTowards,
  canTouch,
  wakeProgress,
}
