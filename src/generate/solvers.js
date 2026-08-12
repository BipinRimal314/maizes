/**
 * Two simulated players, with two different jobs.
 *
 * `playPerfectly` knows the whole maze and every trap. It is the *correctness*
 * oracle: if a player who knows everything cannot finish without dying, the
 * level is unfair, full stop. It drives the real physics, so it also proves the
 * ball can physically walk the route — a maze can be solvable on paper and
 * still have geometry the ball cannot get through.
 *
 * `playBlind` knows only what it has walked into, and learns trap positions by
 * dying on them. It estimates *difficulty*. It is never a correctness gate.
 *
 * Keeping those two roles apart is the point. Last time a single simulated
 * player did both jobs, and when it got stuck through its own timidity that was
 * indistinguishable from an unwinnable level — I spent a round chasing the
 * wrong bug because of it.
 */

import { createGame, stepGame } from '../engine/game.js'
import { ballCell } from '../engine/physics.js'
import { DIRECTIONS, isOpen, key } from '../engine/grid.js'
import { findPath } from './analysis.js'

const WAYPOINT_REACHED = 0.22
const INPUT_DEADZONE = 0.04
const STALL_LIMIT = 300

function clearInput(game) {
  game.input.up = false
  game.input.down = false
  game.input.left = false
  game.input.right = false
}

/** Point the inputs at a cell centre. True while still travelling. */
function steer(game, target) {
  const dx = target.x + 0.5 - game.ball.x
  const dy = target.y + 0.5 - game.ball.y

  game.input.left = dx < -INPUT_DEADZONE
  game.input.right = dx > INPUT_DEADZONE
  game.input.up = dy < -INPUT_DEADZONE
  game.input.down = dy > INPUT_DEADZONE

  return Math.hypot(dx, dy) > WAYPOINT_REACHED
}

/**
 * Walk a known route. Gives up if the ball stops closing on its waypoint, which
 * is how physical impossibility announces itself.
 */
function followRoute(game, route, budget) {
  let waypoint = 1
  let steps = 0
  let stalled = 0
  let closest = Infinity

  while (waypoint < route.length && steps < budget) {
    const target = route[waypoint]
    const deathsBefore = game.deaths
    const capturedBefore = game.captured.size

    if (!steer(game, target)) {
      waypoint++
      stalled = 0
      closest = Infinity
      continue
    }

    stepGame(game)
    steps++

    if (game.won) { clearInput(game); return { ok: true, steps } }
    // both send the ball to the start, so the route no longer applies
    if (game.deaths > deathsBefore) { clearInput(game); return { ok: true, steps, died: true } }
    if (game.captured.size > capturedBefore) { clearInput(game); return { ok: true, steps, captured: true } }

    const distance = Math.hypot(target.x + 0.5 - game.ball.x, target.y + 0.5 - game.ball.y)
    if (distance < closest - 1e-4) {
      closest = distance
      stalled = 0
    } else if (++stalled > STALL_LIMIT) {
      clearInput(game)
      return { ok: false, steps, reason: `stuck approaching ${target.x},${target.y}` }
    }
  }

  clearInput(game)
  if (steps >= budget) return { ok: false, steps, reason: 'out of budget' }
  return { ok: true, steps }
}

/**
 * The correctness oracle: a player who knows everything.
 *
 * Captures flags nearest-first along trap-free routes — capturing returns you
 * to the start, so each is its own trip — then walks to the exit. It never
 * knowingly steps on a trap, so any death it suffers is the level's fault and
 * any route it cannot walk is geometry the ball cannot fit through.
 */
function playPerfectly(grid, { budget = 250000 } = {}) {
  const game = createGame(grid)
  const traps = game.traps
  let steps = 0
  let guard = grid.flags.length + 2
  let cause = null
  game.onDeath = (_at, why) => { cause = why }

  // A "leg" is one trip out from the start: to a flag, or finally to the exit.
  // Capturing teleports you back, so legs are exactly the intervals the hunter's
  // clock measures — which is why the generator sizes `spawnMs` off the longest.
  let longestLegMs = 0
  let legStartedAt = 0
  const endLeg = () => {
    longestLegMs = Math.max(longestLegMs, game.now - legStartedAt)
    legStartedAt = game.now
  }

  while (!game.exitOpen && guard-- > 0) {
    const from = ballCell(game.ball)
    let chosen = null

    for (const flag of grid.flags) {
      if (game.captured.has(key(flag.x, flag.y))) continue
      const route = findPath(grid, from, flag, traps)
      if (!route) {
        return { solved: false, reason: `flag ${flag.x},${flag.y} has no trap-free route`, deaths: game.deaths, steps }
      }
      if (!chosen || route.length < chosen.route.length) chosen = { flag, route }
    }

    if (!chosen) break

    const walked = followRoute(game, chosen.route, budget - steps)
    steps += walked.steps
    if (!walked.ok) {
      return { solved: false, reason: `flag ${chosen.flag.x},${chosen.flag.y}: ${walked.reason}`, deaths: game.deaths, steps }
    }
    if (walked.died) {
      const reason = cause === 'hunter'
        ? 'the hunter caught a perfect player'
        : 'died on a route it believed was trap-free'
      return { solved: false, reason, deaths: game.deaths, steps }
    }
    endLeg()
  }

  if (!game.exitOpen) {
    return { solved: false, reason: 'could not capture every flag', deaths: game.deaths, steps }
  }

  const exitRoute = findPath(grid, ballCell(game.ball), grid.end, traps)
  if (!exitRoute) {
    return { solved: false, reason: 'the exit has no trap-free route', deaths: game.deaths, steps }
  }

  const walked = followRoute(game, exitRoute, budget - steps)
  steps += walked.steps
  if (!walked.ok) {
    return { solved: false, reason: `exit: ${walked.reason}`, deaths: game.deaths, steps }
  }
  if (walked.died) {
    const reason = cause === 'hunter'
      ? 'the hunter caught a perfect player on the way to the exit'
      : 'died on a route to the exit it believed was trap-free'
    return { solved: false, reason, deaths: game.deaths, steps }
  }
  endLeg()

  return {
    solved: game.won,
    reason: game.won ? null : 'stood on the exit without winning',
    deaths: game.deaths,
    steps,
    seconds: game.now / 1000,
    longestLegMs,
  }
}

/** Nearest cell that opens onto somewhere unexplored. */
function nearestFrontier(grid, from, known, avoid) {
  const seen = new Set([key(from.x, from.y)])
  const queue = [from]

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]

    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const next = { x: at.x + direction.dx, y: at.y + direction.dy }
      const id = key(next.x, next.y)

      if (!known.has(id) && !avoid.has(id)) return next
      if (seen.has(id) || avoid.has(id)) continue
      seen.add(id)
      queue.push(next)
    }
  }

  return null
}

/** What a blind player should head for next. */
function blindTarget(grid, game, from, known, avoid) {
  for (const flag of grid.flags) {
    const id = key(flag.x, flag.y)
    if (game.captured.has(id) || !known.has(id)) continue
    if (findPath(grid, from, flag, avoid)) return flag
  }

  const frontier = nearestFrontier(grid, from, known, avoid)
  if (frontier) return frontier

  if (game.exitOpen && findPath(grid, from, grid.end, avoid)) return grid.end

  for (const flag of grid.flags) {
    if (game.captured.has(key(flag.x, flag.y))) continue
    if (findPath(grid, from, flag, avoid)) return flag
  }

  return null
}

/**
 * The difficulty estimator: a player who cannot see, and who learns where the
 * traps are the only way anyone does.
 */
function playBlind(grid, { budget = 150000 } = {}) {
  const game = createGame(grid)
  const known = new Set([key(grid.start.x, grid.start.y)])
  const learned = new Set()
  let steps = 0
  let caught = 0

  game.onDeath = (at, cause) => {
    // Only a trap teaches you something about the floor. Learning the cell the
    // hunter happened to catch you in would make the blind player avoid a
    // perfectly safe corridor forever, and it would do it on the levels that
    // are already the hardest.
    if (cause === 'hunter') caught++
    else learned.add(key(at.x, at.y))
  }

  while (steps < budget && !game.won) {
    const from = ballCell(game.ball)
    known.add(key(from.x, from.y))

    // prefer routes that avoid known traps; accept one rather than stand still
    let target = blindTarget(grid, game, from, known, learned)
    let avoid = learned
    if (!target) {
      target = blindTarget(grid, game, from, known, new Set())
      avoid = new Set()
    }
    if (!target) break

    const route = findPath(grid, from, target, avoid) || findPath(grid, from, target, new Set())
    if (!route || route.length < 2) break

    // one cell at a time, so a death or capture re-plans immediately
    const walked = followRoute(game, route.slice(0, 2), budget - steps)
    steps += walked.steps
    if (!walked.ok) break
  }

  clearInput(game)

  return {
    solved: game.won,
    deaths: game.deaths,
    caught,
    steps,
    explored: known.size,
    seconds: game.now / 1000,
  }
}

export { playPerfectly, playBlind, followRoute, nearestFrontier }
