/**
 * Game state and one fixed step of simulation.
 *
 * The complete rule set:
 *
 *   - Capture every flag. Capturing one sends you back to the start.
 *   - Traps are invisible. Stepping on one sends you back to the start and
 *     counts as a death.
 *   - Once every flag is captured, reach the exit.
 *   - Fog, where a level has it, shows only what is near you. Cells you have
 *     stood in stay dimly remembered.
 *   - The hunter, where a level has one, wakes after a while and comes for you.
 *     It is slower than you. **Touching it loses the level outright.** Returning
 *     to the start puts it back to sleep.
 *
 * The two failure modes are deliberately not the same weight. A trap costs you
 * the walk back and nothing else — your maize is safe, always. The hunter costs
 * you the level. That is the only thing in the game that can take picked maize
 * away, and it is the reason the countdown is worth watching.
 *
 * There is nothing else. No eras, no death modes, no escalation that changes
 * the rules while you play. Every bug in the last version came from those:
 * escalation that made levels unwinnable after ten deaths, a death mode that
 * wiped flags you could only reach by dying, a mechanic switched on by era that
 * contradicted another mechanic switched on by era.
 *
 * Captured flags persist across deaths, always. That single rule removes the
 * entire class of "you must die to progress but dying undoes progress".
 *
 * Plain mutable state, no React. The component reads a small snapshot a few
 * times a second and is otherwise not involved.
 */

import { createBall, resetBall, stepBall, ballCell } from './physics.js'
import { key, trapSet, flagSet, surfaceAt } from './grid.js'
import { createHunter, sleepHunter, stepHunter } from './hunter.js'
/*
 * Every word the player reads lives in src/content.js, including these. The
 * engine imports them rather than holding them so that changing what the farmer
 * says never means opening the file that decides whether he is alive.
 */
import { DEATH_QUIPS, CAUGHT_QUIPS, PICKED_ONE, PICKED_LAST, GHOST_WOKE } from '../content.js'

const STEP_MS = 1000 / 60
const TRAIL_LENGTH = 14
const RESPAWN_FLASH_MS = 450
const CAPTURE_FLASH_MS = 700

function createGame(grid) {
  return {
    grid,
    ball: createBall(grid),
    input: { up: false, down: false, left: false, right: false },

    now: 0,              // game-clock ms; advances only while running
    won: false,
    lost: false,         // caught by the hunter; the attempt is over
    paused: false,
    deaths: 0,

    traps: trapSet(grid),
    flags: flagSet(grid),
    captured: new Set(),
    exitOpen: grid.flags.length === 0,

    hunter: createHunter(grid),

    // cell -> the game time you were last standing in it. A Map rather than a
    // Set because on `memory` levels the trail behind you fades with age, so
    // "when" is as load-bearing as "whether".
    visited: new Map([[key(grid.start.x, grid.start.y), 0]]),

    // transient presentation state, read by the renderer
    flash: null,         // { x, y, until, kind: 'trap' | 'flag' }
    shake: 0,            // ms of screen shake left, set when something goes wrong
    trail: [],           // recent ball positions, oldest first
    cell: null,          // the cell the ball was in last step, for footfalls
    quip: '',

    onDeath: null,
    onCapture: null,
    onStep: null,
    onWin: null,
    onLose: null,
    onSound: null,
  }
}

function emit(game, sound) {
  if (game.onSound) game.onSound(sound)
}

/** A trap. Costs the walk back and nothing else — picked maize is never lost. */
function die(game, at) {
  game.deaths += 1
  game.shake = 240
  resetBall(game.ball, game.grid)
  // back at the start, so the hunter loses interest and its clock restarts
  sleepHunter(game.hunter, game.now)
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  game.quip = DEATH_QUIPS[game.deaths % DEATH_QUIPS.length]
  emit(game, 'death')
  if (game.onDeath) game.onDeath(at, 'trap')
}

/**
 * Caught. The attempt is over — not a respawn, a loss.
 *
 * Nothing is reset here beyond stopping the simulation; `restartGame` does the
 * clearing when the player asks for another go. Leaving the board exactly as it
 * was at the moment of the catch means the overlay is drawn over the position
 * that lost it, which is the only useful thing to look at afterwards.
 */
function lose(game, at) {
  game.lost = true
  game.shake = 420
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  game.quip = CAUGHT_QUIPS[(game.deaths + 1) % CAUGHT_QUIPS.length]
  emit(game, 'caught')
  if (game.onLose) game.onLose(at)
}

/**
 * Capture a flag. It throws you back to the start — that is the joke — but it
 * is progress, so it does not count as a death and it is never undone.
 */
function capture(game, at) {
  const id = key(at.x, at.y)
  if (game.captured.has(id)) return

  game.captured.add(id)
  game.exitOpen = game.captured.size >= game.grid.flags.length
  resetBall(game.ball, game.grid)
  // a capture is a return to the start too, so the same rule applies
  sleepHunter(game.hunter, game.now)
  game.flash = { x: at.x, y: at.y, until: game.now + CAPTURE_FLASH_MS, kind: 'flag' }
  game.quip = game.exitOpen ? PICKED_LAST : PICKED_ONE
  emit(game, game.exitOpen ? 'unlock' : 'capture')
  if (game.onCapture) game.onCapture(at)
}

/** One fixed step. `game.now` advances by exactly STEP_MS. */
function stepGame(game) {
  if (game.won || game.lost || game.paused) return

  game.now += STEP_MS
  if (game.shake > 0) game.shake = Math.max(0, game.shake - STEP_MS)
  stepBall(game.ball, game.input, game.grid)

  /*
   * A short tail behind the hat. Sampled every few steps rather than every one:
   * at sixty a second a full-rate trail is a solid line, which reads as a smear
   * and not as movement.
   */
  if (game.trail.length === 0 || game.now % 50 < STEP_MS) {
    game.trail.push({ x: game.ball.x, y: game.ball.y })
    if (game.trail.length > TRAIL_LENGTH) game.trail.shift()
  }

  const cell = ballCell(game.ball)
  const id = key(cell.x, cell.y)

  // a footfall each time the ball crosses into a new cell, carrying whatever
  // ground it landed on — which is how sand and snow announce themselves
  if (!game.cell || game.cell.x !== cell.x || game.cell.y !== cell.y) {
    game.cell = cell
    if (game.onStep) game.onStep(surfaceAt(game.grid, cell.x, cell.y))
  }

  if (game.traps.has(id)) {
    die(game, cell)
    return
  }

  if (game.flags.has(id) && !game.captured.has(id)) {
    capture(game, cell)
    return
  }

  // rewritten every step, so standing in a cell keeps its memory fresh
  game.visited.set(id, game.now)

  if (game.exitOpen && cell.x === game.grid.end.x && cell.y === game.grid.end.y) {
    game.won = true
    emit(game, 'win')
    if (game.onWin) game.onWin()
    return
  }

  // Last, so that stepping onto the exit or a flag on the same step as the
  // hunter arrives resolves in the player's favour. The hunter can stall a run
  // but it can never take one away.
  const wasAsleep = game.hunter !== null && !game.hunter.active
  if (stepHunter(game.hunter, game.grid, game.ball, game.now)) {
    lose(game, cell)
  } else if (wasAsleep && game.hunter.active) {
    game.quip = GHOST_WOKE
    emit(game, 'hunter')
  }
}

/** Restart the attempt. The level itself is never modified, so this is total. */
function restartGame(game) {
  resetBall(game.ball, game.grid)
  game.now = 0
  game.hunter = createHunter(game.grid)
  game.won = false
  game.lost = false
  game.deaths = 0
  game.captured.clear()
  game.exitOpen = game.grid.flags.length === 0
  game.visited.clear()
  game.visited.set(key(game.grid.start.x, game.grid.start.y), 0)
  game.flash = null
  game.shake = 0
  game.trail = []
  game.cell = null
  game.quip = ''
}

/** The small flat object React renders. No collections cross this boundary. */
function snapshot(game) {
  return {
    now: game.now,
    won: game.won,
    lost: game.lost,
    paused: game.paused,
    deaths: game.deaths,
    captured: game.captured.size,
    flagsTotal: game.grid.flags.length,
    exitOpen: game.exitOpen,
    hasFog: game.grid.fog !== null,
    hasHunter: game.hunter !== null,
    hunterAwake: game.hunter !== null && game.hunter.active,
    // seconds of quiet left, floored at zero; null when the level has no hunter
    hunterIn: game.hunter === null || game.hunter.active
      ? null
      : Math.max(0, Math.ceil((game.hunter.wakesAt - game.now) / 1000)),
    quip: game.quip,
  }
}

export {
  STEP_MS,
  TRAIL_LENGTH,
  DEATH_QUIPS,
  CAUGHT_QUIPS,
  createGame,
  stepGame,
  restartGame,
  snapshot,
}
