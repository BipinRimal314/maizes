/**
 * Tick-by-tick traces of the real engine, for the iOS port to replay.
 *
 * The rules in `ios/Maizes/Engine` are a Swift port of `src/engine`, and a port
 * is only as good as the check that it is still the same game. Every level was
 * proven beatable against the JS engine; this records what that engine does
 * under three different drivers and `ios/MaizesTests/ParityTests.swift`
 * replays the same inputs and demands the same doubles, bit for bit.
 *
 *   route    walks trap-free routes to a win: captures, the exit, a hunter
 *            that stays asleep
 *   wander   seeded random targets, traps ignored: deaths, lost maize, bumps,
 *            surfaces
 *   linger   stays out on the field avoiding traps and maize until the hunter
 *            wakes and catches it, then restarts
 *
 * Doubles are written as their 64-bit patterns in hex, because a decimal
 * round trip through two JSON parsers is exactly the kind of thing that could
 * differ by one ulp and send a test chasing a bug that is not in the engine.
 *
 *   node src/scripts/traces.js     (npm run traces)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromJSON } from '../generate/generate.js'
import { createGame, stepGame, restartGame } from '../engine/game.js'
import { ballCell } from '../engine/physics.js'
import { key } from '../engine/grid.js'
import { findPath } from '../generate/analysis.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT = resolve(ROOT, 'ios/MaizesTests/traces.json')
const EVERY = 60
const RESTART = -1

const view = new DataView(new ArrayBuffer(8))
function hex(n) {
  view.setFloat64(0, n)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

/** State at a step. The field order is the contract with ParityTests.swift. */
function checkpoint(step, game) {
  const h = game.hunter
  return [
    step, hex(game.now),
    hex(game.ball.x), hex(game.ball.y), hex(game.ball.vx), hex(game.ball.vy),
    h ? [hex(h.x), hex(h.y), h.active ? 1 : 0, hex(h.wakesAt)] : null,
    game.deaths, game.captured.size, game.won ? 1 : 0, game.lost ? 1 : 0, game.exitOpen ? 1 : 0,
    game.quip, game.fx.length, game.trail.length, game.visited.size, hex(game.shake),
  ]
}

function recorder(game) {
  const inputs = []
  const checkpoints = []
  let step = 0
  const push = (mask) => {
    const last = inputs[inputs.length - 1]
    if (last && last[0] === mask && mask !== RESTART) last[1] += 1
    else inputs.push([mask, 1])
  }
  return {
    get step() { return step },
    tick() {
      const i = game.input
      push((i.up ? 1 : 0) | (i.down ? 2 : 0) | (i.left ? 4 : 0) | (i.right ? 8 : 0))
      stepGame(game)
      step += 1
      if (step % EVERY === 0) checkpoints.push(checkpoint(step, game))
    },
    restart() {
      push(RESTART)
      restartGame(game)
    },
    finish() {
      checkpoints.push(checkpoint(step, game))
      return { inputs, checkpoints }
    },
  }
}

/** The solvers' steering, verbatim: point the inputs at a cell centre. */
function steer(game, target) {
  const dx = target.x + 0.5 - game.ball.x
  const dy = target.y + 0.5 - game.ball.y
  game.input.left = dx < -0.04
  game.input.right = dx > 0.04
  game.input.up = dy < -0.04
  game.input.down = dy > 0.04
  return Math.hypot(dx, dy) > 0.22
}

/** Walk a route until it ends, something resets the ball, or `limit` steps pass. */
function walk(game, rec, route, limit) {
  const deaths = game.deaths
  const captured = game.captured.size
  let waypoint = 1
  let steps = 0
  while (waypoint < route.length && steps < limit) {
    if (!steer(game, route[waypoint])) { waypoint += 1; continue }
    rec.tick()
    steps += 1
    if (game.won || game.lost || game.deaths > deaths || game.captured.size > captured) break
  }
  game.input.up = game.input.down = game.input.left = game.input.right = false
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function route(grid) {
  const game = createGame(grid)
  const rec = recorder(game)
  while (!game.won && rec.step < 20000) {
    const from = ballCell(game.ball)
    let target = grid.end
    if (!game.exitOpen) {
      let best = null
      for (const flag of grid.flags) {
        if (game.captured.has(key(flag.x, flag.y))) continue
        const path = findPath(grid, from, flag, game.traps)
        if (path && (!best || path.length < best.length)) best = path
      }
      if (!best) break
      walk(game, rec, best, 4000)
      continue
    }
    const path = findPath(grid, from, target, game.traps)
    if (!path) break
    walk(game, rec, path, 4000)
  }
  // a little of the outro, which only runs after a win
  for (let i = 0; i < 30; i++) rec.tick()
  return rec.finish()
}

function wander(grid, seed) {
  const game = createGame(grid)
  const rec = recorder(game)
  const random = mulberry32(seed)
  while (rec.step < 6000 && !game.won) {
    if (game.lost) { rec.restart(); continue }
    const target = { x: Math.floor(random() * grid.cols), y: Math.floor(random() * grid.rows) }
    const path = findPath(grid, ballCell(game.ball), target, null)
    if (!path || path.length < 2) {
      // a held diagonal into whatever is there, for the bumps
      game.input.up = random() < 0.5
      game.input.left = random() < 0.5
      game.input.down = !game.input.up
      game.input.right = !game.input.left
      for (let i = 0; i < 20; i++) rec.tick()
      continue
    }
    walk(game, rec, path, 400)
  }
  return rec.finish()
}

function linger(grid, seed) {
  const game = createGame(grid)
  const rec = recorder(game)
  const random = mulberry32(seed ^ 0x9e3779b9)
  const avoid = new Set([...game.traps, ...game.flags, key(grid.end.x, grid.end.y)])
  let restarts = 0
  while (rec.step < 9000 && restarts < 2) {
    if (game.lost) {
      for (let i = 0; i < 20; i++) rec.tick()   // the stopped board after a catch
      rec.restart()
      restarts += 1
      continue
    }
    const target = { x: Math.floor(random() * grid.cols), y: Math.floor(random() * grid.rows) }
    if (avoid.has(key(target.x, target.y))) continue
    const path = findPath(grid, ballCell(game.ball), target, avoid)
    if (!path || path.length < 2) { rec.tick(); continue }
    walk(game, rec, path, 600)
  }
  return rec.finish()
}

const levels = JSON.parse(readFileSync(resolve(ROOT, 'public/levels.json'), 'utf8'))
const out = levels.map((data) => {
  const grid = fromJSON(data)
  const traces = { route: route(grid), wander: wander(grid, data.seed) }
  if (grid.hunter) traces.linger = linger(grid, data.seed)
  return {
    name: data.name,
    hunter: grid.hunter ? [hex(grid.hunter.spawnMs), hex(grid.hunter.speed)] : null,
    traces,
  }
})

writeFileSync(OUTPUT, JSON.stringify({ every: EVERY, levels: out }))

for (const level of out) {
  const summary = Object.entries(level.traces).map(([name, t]) => {
    const last = t.checkpoints[t.checkpoints.length - 1]
    return `${name} ${last[0]} steps d${last[7]} c${last[8]}${last[9] ? ' won' : ''}${last[10] ? ' lost' : ''}`
  })
  console.log(`${level.name.padEnd(18)} ${summary.join(' | ')}`)
}
