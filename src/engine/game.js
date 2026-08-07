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

    visited: new Set([key(grid.start.x, grid.start.y)]),

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

function die(game, at) {
  game.deaths += 1
  resetBall(game.ball, game.grid)
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  game.quip = DEATH_QUIPS[game.deaths % DEATH_QUIPS.length]
  emit(game, 'death')
  if (game.onDeath) game.onDeath(at)
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
  game.flash = { x: at.x, y: at.y, until: game.now + CAPTURE_FLASH_MS, kind: 'flag' }
  game.quip = game.exitOpen
    ? 'every flag taken. the exit is open.'
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

  game.visited.add(id)

  if (game.exitOpen && cell.x === game.grid.end.x && cell.y === game.grid.end.y) {
    game.won = true
    emit(game, 'win')
    if (game.onWin) game.onWin()
  }
}

/** Restart the attempt. The level itself is never modified, so this is total. */
function restartGame(game) {
  resetBall(game.ball, game.grid)
  game.now = 0
  game.won = false
  game.deaths = 0
  game.captured.clear()
  game.exitOpen = game.grid.flags.length === 0
  game.visited.clear()
  game.visited.add(key(game.grid.start.x, game.grid.start.y))
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
    quip: game.quip,
  }
}

export {
  STEP_MS,
  DEATH_QUIPS,
  createGame,
  stepGame,
  restartGame,
  snapshot,
}
