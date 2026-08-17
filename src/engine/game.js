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
 *     It is slower than you. Touching it sends you back to the start. Returning
 *     to the start puts it back to sleep.
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
import { key, trapSet, flagSet } from './grid.js'
import { createHunter, sleepHunter, stepHunter } from './hunter.js'

const STEP_MS = 1000 / 60
const RESPAWN_FLASH_MS = 450
const CAPTURE_FLASH_MS = 700

const DEATH_QUIPS = [
  "you're doing great, sweetie!",
  'everyone makes mistakes. yours are just very frequent.',
  'the maze believes in you. we think.',
  "that was the maze's fault. definitely.",
  'pain is just spicy progress.',
  "still here? we're impressed, honestly.",
  'have you tried being better at this?',
  'suffering builds character. you have SO much character.',
  "the maze whispers: 'again.'",
  'breathe. then fail again.',
  "we'd hug you but we're a maze.",
  'nobody saw that. (everybody saw that.)',
]

const CAUGHT_QUIPS = [
  'it found you. it was always going to.',
  'you were warned. gently, but you were warned.',
  'faster next time. you are literally faster than it.',
  'caught. embarrassing, given the speed difference.',
  'it does not get tired. you might.',
  'tag. you are it. you are always it.',
]

function createGame(grid) {
  return {
    grid,
    ball: createBall(grid),
    input: { up: false, down: false, left: false, right: false },

    now: 0,              // game-clock ms; advances only while running
    won: false,
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
    quip: '',

    onDeath: null,
    onCapture: null,
    onWin: null,
    onSound: null,
  }
}

function emit(game, sound) {
  if (game.onSound) game.onSound(sound)
}

function die(game, at, cause = 'trap') {
  game.deaths += 1
  resetBall(game.ball, game.grid)
  // back at the start, so the hunter loses interest and its clock restarts
  sleepHunter(game.hunter, game.now)
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  game.quip = cause === 'hunter'
    ? CAUGHT_QUIPS[game.deaths % CAUGHT_QUIPS.length]
    : DEATH_QUIPS[game.deaths % DEATH_QUIPS.length]
  emit(game, cause === 'hunter' ? 'caught' : 'death')
  if (game.onDeath) game.onDeath(at, cause)
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
  game.quip = game.exitOpen
    ? 'every ear picked. the exit is open.'
    : 'got one. back you go.'
  emit(game, game.exitOpen ? 'unlock' : 'capture')
  if (game.onCapture) game.onCapture(at)
}

/** One fixed step. `game.now` advances by exactly STEP_MS. */
function stepGame(game) {
  if (game.won || game.paused) return

  game.now += STEP_MS
  stepBall(game.ball, game.input, game.grid)

  const cell = ballCell(game.ball)
  const id = key(cell.x, cell.y)

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
    die(game, cell, 'hunter')
  } else if (wasAsleep && game.hunter.active) {
    game.quip = 'something is awake. it knows where you are.'
    emit(game, 'hunter')
  }
}

/** Restart the attempt. The level itself is never modified, so this is total. */
function restartGame(game) {
  resetBall(game.ball, game.grid)
  game.now = 0
  game.hunter = createHunter(game.grid)
  game.won = false
  game.deaths = 0
  game.captured.clear()
  game.exitOpen = game.grid.flags.length === 0
  game.visited.clear()
  game.visited.set(key(game.grid.start.x, game.grid.start.y), 0)
  game.flash = null
  game.quip = ''
}

/** The small flat object React renders. No collections cross this boundary. */
function snapshot(game) {
  return {
    now: game.now,
    won: game.won,
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
  DEATH_QUIPS,
  CAUGHT_QUIPS,
  createGame,
  stepGame,
  restartGame,
  snapshot,
}
