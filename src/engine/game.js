/**
 * The game state and one fixed step of simulation.
 *
 * This is plain mutable state with no React in it. The original kept all of
 * this in a useState object and called setState from inside requestAnimationFrame,
 * so every frame re-rendered the whole component tree and allocated fresh Sets,
 * Maps and a full copy of the grid. It also called setState from *inside* a
 * setState updater (via applyModifierEffect), which React 19 double-invokes in
 * StrictMode — modifiers could fire twice.
 *
 * The component now reads a small HUD snapshot a few times a second and is
 * otherwise not involved.
 */

import { createBallState, stepBall, checkLethal, checkModifier, checkMemoryWipe, checkWin } from './physics'
import { createStalker, resetStalker, recordStalkerPosition, updateStalker } from './stalker'
import { spreadCorruption } from './fog'

const STEP_MS = 1000 / 60

const CORRUPTION_INTERVAL_MS = 10000
const CORRUPTION_DEATH_THRESHOLD = 10
const FOG_SHRINK_AFTER_DEATHS = 3
const FOG_SHRINK_PER_DEATH = 0.5
const FOG_MIN_RADIUS = 1.0
const TRAP_FLASH_MS = 500
const PSYCHE_MS = 800

const DEATH_QUIPS = [
  "you're doing great, sweetie!",
  'everyone makes mistakes. yours are just very frequent.',
  'the maze believes in you. we think.',
  "that was the maze's fault. definitely.",
  'pain is just spicy progress.',
  "still here? we're impressed, honestly.",
  "the ball forgives you. the maze doesn't.",
  'maybe try closing your eyes? can’t be worse.',
  "we'd hug you but we're a maze.",
  'that one hurt us too. not really.',
  'have you tried being better at this?',
  'suffering builds character. you have SO much character.',
  "the maze whispers: 'again.'",
  'almost! (we say that every time.)',
  'breathe. then fail again.',
  "nobody's watching. (everyone's watching.)",
]

const CAUSE_QUIPS = {
  mimic: 'that exit was lying to you.',
  stalker: 'the apparition caught you.',
  corruption: 'the void consumed you.',
  wipe: 'your memory has been wiped.',
}

function countFakeExits(grid) {
  let n = 0
  for (const cell of grid.cells) if (cell.modifier === 'fakeExit') n++
  return n
}

function createGame(grid, options = {}) {
  const era = options.era || 'learning'
  const baseFog = options.fogRadius ?? null
  const fakeExitsTotal = countFakeExits(grid)

  return {
    grid,
    era,
    deathMode: options.deathMode || 'progress',

    ball: createBallState(grid),
    input: { up: false, down: false, left: false, right: false },

    now: 0,             // game-clock ms, advances only while running
    won: false,
    paused: false,
    deaths: 0,

    baseFogRadius: baseFog,
    fogRadius: baseFog,

    fakeExitsTotal,
    fakeExitsCollected: new Set(),
    exitUnlocked: fakeExitsTotal === 0,
    psycheUntil: -1,

    visited: new Set(),
    closedGates: new Set(),

    trapFlash: null,     // { x, y, until }
    lastQuip: '',
    lastWipeCell: null,

    corruptionActive: false,
    corrupted: new Set(),
    corruptionFrontier: [],
    lastCorruptionTick: 0,

    stalker: createStalker(era === 'punishing' || era === 'sadistic'),

    lastSample: 0,

    // set by the host so deaths and gate passes reach telemetry
    onDeath: options.onDeath || null,
    onGatePass: options.onGatePass || null,
    onWin: options.onWin || null,
    onSound: options.onSound || null,
    onSample: options.onSample || null,
  }
}

// Telemetry samples the path on the game clock, so a paused game records
// nothing and a 120Hz display does not produce twice the data of a 60Hz one.
const SAMPLE_INTERVAL_MS = 500

function emit(game, sound) {
  if (game.onSound) game.onSound(sound)
}

/**
 * Send the ball back to the start and apply whatever escalation this era and
 * death count call for.
 */
function killPlayer(game, cause, at) {
  game.deaths += 1
  game.ball = createBallState(game.grid)

  if (at) {
    game.trapFlash = { x: at.x, y: at.y, until: game.now + TRAP_FLASH_MS }
  }

  // sadistic levels tighten the fog once you start failing
  if (game.era === 'sadistic' && game.baseFogRadius !== null && game.deaths > FOG_SHRINK_AFTER_DEATHS) {
    game.fogRadius = Math.max(
      game.baseFogRadius - (game.deaths - FOG_SHRINK_AFTER_DEATHS) * FOG_SHRINK_PER_DEATH,
      FOG_MIN_RADIUS
    )
  }

  // The void is per attempt. It eats outward from the spawn point, so a void
  // that persisted across deaths would corrupt the cells next to the start and
  // then kill the player on the first step of every later attempt, forever —
  // an unwinnable level and an unbreakable respawn loop. Each respawn gets a
  // clean maze and a fresh interval before the first ring appears; it re-arms
  // immediately, because the death count that armed it has not gone away.
  if (game.era === 'sadistic' && game.deaths >= CORRUPTION_DEATH_THRESHOLD) {
    game.corruptionActive = true
    game.corrupted = new Set()
    game.corruptionFrontier = [{ x: game.grid.start.x, y: game.grid.start.y }]
    game.lastCorruptionTick = game.now
  }

  // 'progress' keeps collected false exits; anything harsher makes you redo them
  if (game.deathMode !== 'progress') {
    game.fakeExitsCollected.clear()
    game.exitUnlocked = game.fakeExitsTotal === 0
  }

  // the ten-second grace period restarts from this respawn
  resetStalker(game.stalker, game.now)

  game.lastQuip = CAUSE_QUIPS[cause] || DEATH_QUIPS[game.deaths % DEATH_QUIPS.length]

  emit(game, 'death')
  if (game.onDeath) game.onDeath(cause, at)
}

function collectFakeExit(game, at) {
  const key = `${at.x},${at.y}`
  if (game.fakeExitsCollected.has(key)) return

  game.fakeExitsCollected.add(key)
  game.exitUnlocked = game.fakeExitsCollected.size >= game.fakeExitsTotal
  game.psycheUntil = game.now + PSYCHE_MS
  game.deaths += 1
  game.ball = createBallState(game.grid)
  game.lastQuip = 'psyche.'
  emit(game, 'fail')
}

/** One fixed step. `game.now` advances by exactly STEP_MS. */
function stepGame(game) {
  if (game.won || game.paused) return

  game.now += STEP_MS
  const { grid, ball } = game

  stepBall(ball, game.input, grid, game.closedGates)

  const lethal = checkLethal(ball, grid)
  if (lethal) {
    killPlayer(game, lethal.cause, lethal)
    return
  }

  const cx = Math.floor(ball.x)
  const cy = Math.floor(ball.y)
  const key = `${cx},${cy}`

  // one-way gates close behind you
  const cell = grid.cells[cy * grid.cols + cx]
  if (cell && cell.gate && !game.closedGates.has(key)) {
    game.closedGates.add(key)
    if (game.onGatePass) game.onGatePass()
  }

  const modifier = checkModifier(ball, grid)
  if (modifier && modifier.type === 'fakeExit') {
    collectFakeExit(game, modifier)
    return
  }

  // memory wipe fires once per entry, not once per frame stood on it
  if (checkMemoryWipe(ball, grid)) {
    if (game.lastWipeCell !== key) {
      game.lastWipeCell = key
      game.visited.clear()
      game.lastQuip = CAUSE_QUIPS.wipe
      emit(game, 'wipe')
    }
  } else if (game.lastWipeCell !== null && game.lastWipeCell !== key) {
    game.lastWipeCell = null
  }

  game.visited.add(key)

  if (game.corruptionActive && game.now - game.lastCorruptionTick > CORRUPTION_INTERVAL_MS) {
    const spread = spreadCorruption(game.corrupted, game.corruptionFrontier, grid)
    game.corrupted = spread.corruptedCells
    game.corruptionFrontier = spread.frontier
    game.lastCorruptionTick = game.now
  }
  if (game.corruptionActive && game.corrupted.has(key)) {
    killPlayer(game, 'corruption', { x: cx, y: cy })
    return
  }

  if (game.onSample && game.now - game.lastSample >= SAMPLE_INTERVAL_MS) {
    game.lastSample = game.now
    game.onSample(ball.x, ball.y)
  }

  recordStalkerPosition(game.stalker, ball, game.now)
  updateStalker(game.stalker, ball, game.now)
  if (game.stalker.caught) {
    killPlayer(game, 'stalker', { x: cx, y: cy })
    return
  }

  if (checkWin(ball, grid) && game.exitUnlocked) {
    game.won = true
    emit(game, 'victory')
    if (game.onWin) game.onWin()
  }
}

/** Restart the current level from scratch, keeping the level itself pristine. */
function restartGame(game) {
  game.ball = createBallState(game.grid)
  game.now = 0
  game.won = false
  game.deaths = 0
  game.fogRadius = game.baseFogRadius
  game.fakeExitsCollected.clear()
  game.exitUnlocked = game.fakeExitsTotal === 0
  game.psycheUntil = -1
  game.visited.clear()
  game.closedGates.clear()
  game.trapFlash = null
  game.lastQuip = ''
  game.lastWipeCell = null
  game.corruptionActive = false
  game.corrupted = new Set()
  game.corruptionFrontier = []
  game.lastCorruptionTick = 0
  game.lastSample = 0
  resetStalker(game.stalker, 0)
}

/**
 * The small, allocation-light object React actually renders. Everything here is
 * a primitive so the component can cheaply skip identical updates.
 */
function hudSnapshot(game) {
  return {
    now: game.now,
    won: game.won,
    paused: game.paused,
    deaths: game.deaths,
    fogRadius: game.fogRadius,
    fakeExitsTotal: game.fakeExitsTotal,
    fakeExitsFound: game.fakeExitsCollected.size,
    exitUnlocked: game.exitUnlocked,
    lastQuip: game.lastQuip,
    psycheActive: game.now < game.psycheUntil,
    stalkerEnabled: game.stalker.enabled,
    stalkerActive: game.stalker.active,
    corruptionActive: game.corruptionActive,
  }
}

export {
  STEP_MS,
  DEATH_QUIPS,
  CAUSE_QUIPS,
  createGame,
  stepGame,
  restartGame,
  killPlayer,
  hudSnapshot,
  countFakeExits,
}
