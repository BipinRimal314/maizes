/**
 * The Apparition — a shadow that retraces your exact path on a delay.
 *
 * It does not chase and it does not cheat. It walks where you walked, ten
 * seconds late, which means the only thing that kills you is your own
 * hesitation or backtracking. That is why it survives the motor-difficulty
 * cull: you beat it with route decisions, not reflexes.
 *
 * Rewritten to be mutable and driven by the game clock. The original rebuilt
 * the entire path array every 100ms (`path: [...stalker.path, pos]`), which is
 * quadratic in level length, and read Date.now() directly, so it kept advancing
 * while the game was paused.
 */

const STALKER_DELAY_MS = 10000
const STALKER_SAMPLE_MS = 100
const STALKER_CATCH_RADIUS = 0.6   // cells — must overlap the ball, not merely be near

function createStalker(enabled = false) {
  return {
    enabled,
    path: [],        // {x, y, t} in cell units, game-clock ms
    index: 0,        // replay cursor
    x: null,
    y: null,
    lastSample: -Infinity,
    active: false,
    caught: false,
  }
}

function resetStalker(stalker) {
  stalker.path.length = 0
  stalker.index = 0
  stalker.x = null
  stalker.y = null
  stalker.lastSample = -Infinity
  stalker.active = false
  stalker.caught = false
  return stalker
}

/**
 * Sample the ball's position onto the replay tape. `now` is game-clock ms since
 * the attempt began, so a paused game records nothing.
 */
function recordStalkerPosition(stalker, ball, now) {
  if (!stalker.enabled) return
  if (now - stalker.lastSample < STALKER_SAMPLE_MS) return
  stalker.path.push({ x: ball.x, y: ball.y, t: now })
  stalker.lastSample = now
}

function updateStalker(stalker, ball, now) {
  if (!stalker.enabled || stalker.path.length === 0) return

  if (now < STALKER_DELAY_MS) {
    stalker.active = false
    return
  }
  stalker.active = true

  // walk the cursor forward to the sample matching (now - delay)
  const targetTime = now - STALKER_DELAY_MS
  while (
    stalker.index < stalker.path.length - 1 &&
    stalker.path[stalker.index + 1].t <= targetTime
  ) {
    stalker.index++
  }

  const pos = stalker.path[stalker.index]
  stalker.x = pos.x
  stalker.y = pos.y

  // Same cell only — it must not reach through a wall to kill you.
  const sameCell =
    Math.floor(pos.x) === Math.floor(ball.x) &&
    Math.floor(pos.y) === Math.floor(ball.y)

  stalker.caught = sameCell && Math.hypot(pos.x - ball.x, pos.y - ball.y) < STALKER_CATCH_RADIUS
}

/** Seconds until it starts moving, or 0 once it is hunting. */
function stalkerCountdown(stalker, now) {
  if (!stalker.enabled) return null
  if (stalker.active) return 0
  return Math.max(0, Math.ceil((STALKER_DELAY_MS - now) / 1000))
}

export {
  createStalker,
  resetStalker,
  recordStalkerPosition,
  updateStalker,
  stalkerCountdown,
  STALKER_DELAY_MS,
  STALKER_SAMPLE_MS,
  STALKER_CATCH_RADIUS,
}
