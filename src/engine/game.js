import { difficultyGrid } from './difficulty.js'
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
 * Legacy unhunted fields preserve captured flags. Explicit Easy always keeps
 * maize on trap falls; Difficult always clears it. This removes the
 * entire class of "you must die to progress but dying undoes progress".
 *
 * Plain mutable state, no React. The component reads a small snapshot a few
 * times a second and is otherwise not involved.
 */

import { createBall, resetBall, stepBall, ballCell } from './physics.js'
import { key, trapSet, flagSet, surfaceAt } from './grid.js'
import { toolGrid, resetTools, stepTools, REPEL_MS } from './tools.js'
import { createHunter, sleepHunter, stepHunter } from './hunter.js'
import { NEUTRAL } from './assist.js'
import { pushFx, pruneFx, bumpAxis } from './fx.js'
/*
 * Every word the player reads lives in src/content.js, including these. The
 * engine imports them rather than holding them so that changing what the farmer
 * says never means opening the file that decides whether he is alive.
 */
import {
  DEATH_QUIPS, WEARY_QUIPS, QUIPS_BEFORE_WEARY,
  CAUGHT_QUIPS, LOST_MAIZE_QUIPS, PICKED_ONE, PICKED_LAST, GHOST_WOKE,
} from '../content.js'

const STEP_MS = 1000 / 60
const TRAIL_LENGTH = 14
const RESPAWN_FLASH_MS = 450
const CAPTURE_FLASH_MS = 700
const BUMP_SOUND_GAP_MS = 140

/**
 * @param {object} grid
 * @param {object} assist  the player's help settings. Defaults to NEUTRAL, and
 *                         the solvers pass nothing — so what is judged during
 *                         generation is always the game as designed, whatever
 *                         this player has turned on. See engine/assist.js.
 */
const exitReady = game => game.captured.size >= game.grid.flags.length && (game.grid.discoveries ?? []).every(p => !p.required || game.discoveries.has(p.id))

function createGame(grid, assist = NEUTRAL, difficulty = null) {
  grid = difficultyGrid(grid, difficulty)
  const originalGrid = grid
  grid = toolGrid(grid)
  return {
    grid,
    originalGrid,
    difficulty,
    hasAxe: false,
    charm: 0,
    charmPicked: false,
    wood: new Set((grid.wood ?? []).map(p => key(p.x, p.y))),
    chopping: null,
    discoveries: new Set(),
    discovery: null,
    discoveryUntil: 0,
    assist,
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
    exitOpen: grid.flags.length === 0 && !(grid.discoveries ?? []).some(p => p.required),

    hunter: createHunter(grid, assist.ghostPace),

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
    camera: null,        // { x, y } in cells when the board is bigger than the view
    fx: [],              // timestamped presentation events; see engine/fx.js
    outro: 0,            // ms since the level was won; the only clock that runs after
    stick: null,         // the touch stick, in cell coordinates, while a finger is down
    dev: false,          // full-map testing: no deaths or pickup teleports
    lastBump: -1e9,      // game time of the last audible knock, to rate-limit it

    /*
     * Where in the oath list this field starts.
     *
     * Without it every field opens on the same quip, so the first three are
     * heard twenty-six times and the last nine are never heard at all. Derived
     * from the board so it is stable for a level and different between levels.
     */
    quipOffset: grid.start.x * 31 + grid.start.y * 17 + grid.flags.length * 7,

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

/**
 * What he says on the way back up.
 *
 * An oath for the first few falls in a field, and after that the oaths give
 * out. A player who is stuck on a field hears the joke three or four times, not
 * nine, and the going-quiet is the same tiredness the chapters are describing.
 */
function quipFor(game) {
  if (game.deaths <= QUIPS_BEFORE_WEARY) {
    return DEATH_QUIPS[(game.quipOffset + game.deaths) % DEATH_QUIPS.length]
  }
  return WEARY_QUIPS[(game.quipOffset + game.deaths) % WEARY_QUIPS.length]
}

/**
 * A trap.
 *
 * Before the ghost chapters it costs the walk back and nothing else. Once a
 * field has something hunting in it, a fall costs the field: every picked ear
 * goes back where it lay, the way it does when the ghost catches you. The
 * stakes step up on the same level the ghost arrives, and never step down.
 *
 * That is a change to the rule that used to say "picked maize is never lost
 * to a trap". It still holds on every field without a hunter, which is where
 * the class of bug it guarded against — needing to die to learn a trap, and
 * losing progress for learning it — would actually hurt. On a hunted field
 * the player has already learned to keep the walk short.
 */
function die(game, at) {
  game.deaths += 1
  game.shake = game.assist.steadyBoard ? 0 : 170
  resetBall(game.ball, game.grid)
  // back at the start, so the hunter loses interest and its clock restarts
  sleepHunter(game.hunter, game.now)
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  game.trail = []

  const costsTheField = game.captured.size > 0 && (game.difficulty === 'difficult' || (game.difficulty !== 'easy' && game.hunter !== null))
  if (costsTheField) {
    for (const id of game.captured) {
      const comma = id.indexOf(',')
      pushFx(game, 'unpick', { x: +id.slice(0, comma), y: +id.slice(comma + 1) })
    }
    game.captured.clear()
    game.exitOpen = game.grid.flags.length === 0 && (game.grid.discoveries ?? []).every(p => !p.required || game.discoveries.has(p.id))
    game.quip = LOST_MAIZE_QUIPS[(game.quipOffset + game.deaths) % LOST_MAIZE_QUIPS.length]
  } else {
    game.quip = quipFor(game)
  }
  pushFx(game, 'fall', at)
  pushFx(game, 'spawn', game.grid.start)
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
  game.shake = game.assist.steadyBoard ? 0 : 300
  game.flash = { x: at.x, y: at.y, until: game.now + RESPAWN_FLASH_MS, kind: 'trap' }
  pushFx(game, 'fall', at, { caught: true })
  game.quip = CAUGHT_QUIPS[(game.quipOffset + game.deaths + 1) % CAUGHT_QUIPS.length]
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
  game.exitOpen = exitReady(game)
  if (!game.dev && game.grid.pickupMode !== 'continuous') {
    resetBall(game.ball, game.grid)
    sleepHunter(game.hunter, game.now)
  }
  game.flash = { x: at.x, y: at.y, until: game.now + CAPTURE_FLASH_MS, kind: 'flag' }
  game.quip = game.exitOpen ? PICKED_LAST : (game.dev || game.grid.pickupMode === 'continuous') ? 'Another one. Keep going.' : PICKED_ONE
  if (!game.dev && game.grid.pickupMode !== 'continuous') game.trail = []
  pushFx(game, 'pick', at)
  if (game.exitOpen) pushFx(game, 'unlock', at)
  if (!game.dev && game.grid.pickupMode !== 'continuous') pushFx(game, 'spawn', game.grid.start)
  emit(game, game.exitOpen ? 'unlock' : 'capture')
  if (game.onCapture) game.onCapture(at)
}

/** One fixed step. `game.now` advances by exactly STEP_MS. */
function stepGame(game) {
  /*
   * After a win the rules are over and `game.now` stays where it was — the
   * time on the card is the time you finished in. The board still has the hat
   * to walk into the exit, though, so one presentation clock keeps running.
   */
  if (game.won) { game.outro += STEP_MS; return }
  if (game.lost || game.paused) return

  game.now += STEP_MS
  if (game.shake > 0) game.shake = Math.max(0, game.shake - STEP_MS)
  pruneFx(game)

  const vxBefore = game.ball.vx
  const vyBefore = game.ball.vy
  stepTools(game, STEP_MS)
  stepBall(game.ball, game.input, game.grid)
  stepTools(game, 0)

  /*
   * A knock against a wall, shown and — sparingly — heard. Read off the
   * velocity rather than reported by the physics, so `stepBall` stays exactly
   * the function the solvers were proven against.
   */
  const struck = bumpAxis({ vx: vxBefore, vy: vyBefore }, game.ball)
  if (struck) {
    pushFx(game, 'bump', {
      x: game.ball.x + (struck === 'x' ? Math.sign(vxBefore) * game.ball.radius : 0),
      y: game.ball.y + (struck === 'y' ? Math.sign(vyBefore) * game.ball.radius : 0),
    }, { axis: struck })
    if (game.now - game.lastBump > BUMP_SOUND_GAP_MS) {
      game.lastBump = game.now
      emit(game, 'bump')
    }
  }

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

  const found = (game.grid.discoveries ?? []).find(p => key(p.x, p.y) === id && !game.discoveries.has(p.id))
  if (found) {
    game.discoveries.add(found.id)
    game.discovery = found
    game.discoveryUntil = game.now + 9000
    game.exitOpen = exitReady(game)
    game.onDiscovery?.(found)
    emit(game, 'discovery')
  }

  if (!game.dev && game.traps.has(id)) {
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
    if (!game.dev && game.charm > 0) {
      game.charm -= 1
      sleepHunter(game.hunter, game.now)
      game.hunter.wakesAt = game.now + REPEL_MS
      game.quip = 'The ward broke. Ten seconds to get away.'
      emit(game, 'unlock')
    } else if (!game.dev) lose(game, cell)
  } else if (wasAsleep && game.hunter.active) {
    game.quip = GHOST_WOKE
    pushFx(game, 'wake', { x: game.hunter.x, y: game.hunter.y })
    emit(game, 'hunter')
  }
}

/** Restart the attempt. The level itself is never modified, so this is total. */
function restartGame(game) {
  resetTools(game)
  resetBall(game.ball, game.grid)
  game.now = 0
  game.discoveries.clear()
  game.discovery = null
  game.discoveryUntil = 0
  game.hunter = createHunter(game.grid, game.assist.ghostPace)
  game.won = false
  game.lost = false
  game.deaths = 0
  game.captured.clear()
  game.exitOpen = game.grid.flags.length === 0 && (game.grid.discoveries ?? []).every(p => !p.required || game.discoveries.has(p.id))
  game.visited.clear()
  game.visited.set(key(game.grid.start.x, game.grid.start.y), 0)
  game.flash = null
  game.shake = 0
  game.trail = []
  game.cell = null
  game.quip = ''
  game.fx = []
  game.outro = 0
  game.lastBump = -1e9
}

/** The small flat object React renders. No collections cross this boundary. */
function snapshot(game) {
  return {
    discovery: game.now < game.discoveryUntil ? game.discovery : null,
    discoveryCount: game.discoveries.size,
    markersLeft: (game.grid.discoveries ?? []).filter(p => p.required && !game.discoveries.has(p.id)).length,
    hunterMood: game.hunter?.mood ?? 'asleep',
    hasAxe: game.hasAxe,
    needsAxe: Boolean(game.grid.axe),
    woodLeft: game.wood.size,
    charm: game.charm,
    hasCharm: Boolean(game.grid.charm),
    charmPicked: game.charmPicked,
    chopping: game.chopping ? game.chopping.ms / 450 : 0,
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
