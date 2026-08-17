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
import { key, trapSet, flagSet } from './grid.js'
import { createHunter, sleepHunter, stepHunter } from './hunter.js'

const STEP_MS = 1000 / 60
const RESPAWN_FLASH_MS = 450
const CAPTURE_FLASH_MS = 700

/*
 * The farmer, out loud.
 *
 * These used to be the game sneering at the player — "have you tried being
 * better at this?" — which was funny when the game was about suffering and is
 * wrong now that it is about a man looking for his daughter. Nobody is being
 * mocked here. It is a tired dad swearing the way a tired dad swears: mild,
 * agricultural, faintly ridiculous, and every one of them turning back toward
 * her before the line is out.
 *
 * The pattern is deliberate — an oath, then the worry underneath it. The oath
 * is the whimsy and the second half is the reason you keep playing.
 */
const DEATH_QUIPS = [
  'Oh, barnacles. Down a hole, at my age.',
  'Sweet mother of harvest. Mind your feet, old man.',
  'Well, blister my boots. Up. She is still out there.',
  'Great grieving gourds — who digs a pit in a field and leaves it open?',
  'Tarnation. That is twice now. We need not tell her mother.',
  'By the plough and all that pulls it. Again, then.',
  'Heavens to Betsy. Nothing broken. Nothing that counts.',
  "Corn's teeth. Forty years farming and never once fallen in a field.",
  'Oh, thistles. Get up. Get up.',
  'Sakes alive, the ground is against me now as well.',
  'Jumping junebugs, that smarts. She would have laughed at that.',
  'Blast and bother. Back to the start, and no nearer to her.',
]

const CAUGHT_QUIPS = [
  'Merciful heavens. It was right there beside me.',
  'Sweet corn and salvation — it does not even hurry.',
  'Oh, thistles. It has the measure of my hat now.',
  'Land sakes. Faster, old man. Faster.',
  'By the barn door, that thing is patient.',
  'Bless and keep us. Do not let her see me like this.',
]

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
    quip: '',

    onDeath: null,
    onCapture: null,
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
  game.quip = game.exitOpen
    ? 'That is the last of them. The way on is open. Good girl.'
    : 'One more of hers. All the way back with it, then.'
  emit(game, game.exitOpen ? 'unlock' : 'capture')
  if (game.onCapture) game.onCapture(at)
}

/** One fixed step. `game.now` advances by exactly STEP_MS. */
function stepGame(game) {
  if (game.won || game.lost || game.paused) return

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
    lose(game, cell)
  } else if (wasAsleep && game.hunter.active) {
    game.quip = 'Something is up and about out there. It knows where I am.'
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
  DEATH_QUIPS,
  CAUGHT_QUIPS,
  createGame,
  stepGame,
  restartGame,
  snapshot,
}
