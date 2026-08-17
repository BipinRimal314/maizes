/**
 * Generate a level: build, place, judge, keep or discard.
 *
 * Levels are never repaired. If a candidate fails the oracle it is thrown away
 * and the next seed is tried. That is the whole reason this architecture exists
 * — the previous version placed obstacles and then tried to patch the result
 * into fairness, and every patch had an edge it did not cover.
 */

import { key } from '../engine/grid.js'
import { createRng } from './rng.js'
import { buildMaze } from './maze.js'
import { branchDepth, distancesFrom, safeReachable } from './analysis.js'
import { judge } from './oracle.js'

/**
 * Difficulty tiers. Only a handful of numbers vary, which is the point: there
 * is no combination of mechanics to get wrong because there are only four
 * mechanics, and each tier turns on at most one of them that the tier before
 * did not have.
 *
 * Boards are landscape, not square, because the screen is: a square maze on a
 * wide window is a postage stamp with a margin either side of it. Cell counts
 * are held roughly constant across the change so the tiers stay as hard as they
 * were — 14x14 became 18x11, which is 196 cells against 198.
 *
 * `hunter` is `{ speed, margin }` or absent. `speed` is cells per simulation
 * step, clamped by `HUNTER_SPEED_CAP` so it can never out-run the ball.
 * `margin` is how much slack a perfect player gets: the hunter's timer is set
 * to the longest trip perfect play actually takes, times this. 1.7 means you
 * can be seventy percent slower than optimal before anything comes looking.
 */
const TIERS = {
  gentle: { cols: 13, rows: 8, loops: 0.06, flags: 1, traps: 0, fog: null },
  brisk: { cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 2, fog: null },

  // `misty` is `brisk` with fog and nothing else changed: same size, same flag
  // count, same trap count. The only new thing on the level where fog arrives
  // is the fog itself, so a player who suddenly finds it hard knows exactly
  // what changed. The radius is generous here and tightens in later tiers.
  misty: { cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 2, fog: 4.5 },

  blind: { cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 3, fog: 3.5 },

  // `hunted` is `blind` with a hunter and nothing else changed — the same trick
  // that introduced fog, for the same reason. Generous timer, slow hunter.
  hunted: {
    cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 3, fog: 3.5,
    hunter: { speed: 0.075, margin: 1.9 },
  },

  // Faster than the hunter in `hunted`, but not on a tighter leash. The last
  // chapter is meant to be the hard one, not the unfun one, and being caught
  // already costs a respawn on the biggest, foggiest boards in the game.
  cruel: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 3.0,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // `fading` is `cruel` with a memory that rots, and nothing else changed. The
  // trail you leave closes up behind you, so the map you have built in your
  // head stops matching the one on screen.
  fading: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 3.0,
    memory: 7000,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // Same again, only the memory is shorter — the one variable tightening, the
  // way the fog radius tightens from chapter to chapter.
  vanishing: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 3.0,
    memory: 2500,
    hunter: { speed: 0.095, margin: 1.8 },
  },
}

/**
 * Flags go where a player would plausibly go looking: deep in a branch off the
 * main route, and a decent distance from the start.
 */
function placeFlags(grid, route, rng, count) {
  if (count === 0) return true

  const depth = branchDepth(grid, route)
  const fromStart = distancesFrom(grid, grid.start)
  const onRoute = new Set(route.map((c) => key(c.x, c.y)))

  const candidates = []
  for (const [id, d] of depth) {
    const [x, y] = id.split(',').map(Number)
    if (onRoute.has(id)) continue
    if (x === grid.start.x && y === grid.start.y) continue
    if (x === grid.end.x && y === grid.end.y) continue
    const distance = fromStart.get(id) ?? 0
    if (distance < 3) continue
    candidates.push({ x, y, score: d * 2 + distance })
  }

  if (candidates.length < count) return false

  // spread them out, so capturing one does not reveal the next
  const chosen = []
  const pool = rng.shuffle(candidates).sort((a, b) => b.score - a.score)

  for (const candidate of pool) {
    if (chosen.length >= count) break
    const tooClose = chosen.some(
      (c) => Math.abs(c.x - candidate.x) + Math.abs(c.y - candidate.y) < 3
    )
    if (tooClose) continue
    chosen.push(candidate)
  }

  if (chosen.length < count) return false
  grid.flags = chosen.map((c) => ({ x: c.x, y: c.y }))
  return true
}

/**
 * Traps go on shallow branches beside the route — the tempting wrong turn — and
 * never anywhere that would cut off something the player has to touch. That
 * last condition is checked here rather than trusted, because it is the one
 * that made three levels unwinnable last time.
 */
function placeTraps(grid, route, rng, count) {
  if (count === 0) return true

  const depth = branchDepth(grid, route)
  const reserved = new Set([
    key(grid.start.x, grid.start.y),
    key(grid.end.x, grid.end.y),
    ...grid.flags.map((f) => key(f.x, f.y)),
  ])

  const candidates = []
  for (const [id, d] of depth) {
    if (d < 1 || d > 3) continue
    if (reserved.has(id)) continue
    const [x, y] = id.split(',').map(Number)
    candidates.push({ x, y })
  }

  const pool = rng.shuffle(candidates)
  grid.traps = []

  for (const candidate of pool) {
    if (grid.traps.length >= count) break

    grid.traps.push(candidate)
    const traps = new Set(grid.traps.map((t) => key(t.x, t.y)))
    const safe = safeReachable(grid, traps)

    const stillFair =
      safe.has(key(grid.end.x, grid.end.y)) &&
      grid.flags.every((f) => safe.has(key(f.x, f.y)))

    if (!stillFair) grid.traps.pop()
  }

  return grid.traps.length === count
}

/** Build one candidate level from a seed, or null if the seed is a dud. */
function buildCandidate(seed, tier) {
  const rng = createRng(seed)
  const built = buildMaze(rng, tier)
  if (!built) return null

  const { grid, route } = built
  grid.fog = tier.fog
  grid.memory = tier.memory ?? null

  if (!placeFlags(grid, route, rng, tier.flags)) return null
  if (!placeTraps(grid, route, rng, tier.traps)) return null

  return grid
}

/**
 * Fit a hunter to a level that has already been judged without one.
 *
 * The timer is derived, never guessed. `perfectLegMs` is the longest single
 * trip out from the start that optimal play actually takes, measured on this
 * exact maze by the same engine the player will drive; the hunter wakes at that
 * times the tier's margin. So the hunter is, by construction, something only a
 * slow player meets.
 *
 * Construction is not proof, though, which is why the caller re-judges the
 * level afterwards with the hunter installed and still demands zero deaths from
 * perfect play. If the derivation is ever wrong the level is discarded rather
 * than shipped, the same as every other failure here.
 */
function fitHunter(grid, tier, difficulty) {
  if (!tier.hunter) return null

  const leg = difficulty.perfectLegMs
  if (!Number.isFinite(leg) || leg <= 0) return null

  return {
    spawnMs: Math.round(leg * tier.hunter.margin),
    speed: tier.hunter.speed,
  }
}

/**
 * Search seeds until one produces a level the oracle accepts.
 *
 * Returns the level plus the verdict that admitted it, so the shipped set
 * carries its own evidence.
 */
function generateLevel(tierName, seed, { attempts = 400 } = {}) {
  const tier = TIERS[tierName]
  if (!tier) throw new Error(`unknown tier: ${tierName}`)

  const rejected = []

  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidateSeed = seed + attempt * 7919
    const grid = buildCandidate(candidateSeed, tier)
    if (!grid) {
      rejected.push({ seed: candidateSeed, problems: ['could not be built'] })
      continue
    }

    // First pass with no hunter: proves the maze itself, and measures the
    // perfect run the hunter's timer is derived from.
    let verdict = judge(grid)

    if (verdict.ok && tier.hunter) {
      grid.hunter = fitHunter(grid, tier, verdict.difficulty)
      if (!grid.hunter) {
        rejected.push({ seed: candidateSeed, problems: ['could not size a hunter'] })
        continue
      }
      // Second pass with the hunter installed. Same rules, no exemptions.
      verdict = judge(grid)
    }

    if (verdict.ok) {
      return {
        grid,
        seed: candidateSeed,
        tier: tierName,
        difficulty: verdict.difficulty,
        attempts: attempt + 1,
        rejected,
      }
    }
    rejected.push({ seed: candidateSeed, problems: verdict.problems })
  }

  return { grid: null, rejected, attempts }
}

/** Serialise to the compact shipped form. */
function toJSON(level, name) {
  const { grid } = level
  return {
    name,
    tier: level.tier,
    seed: level.seed,
    c: grid.cols,
    r: grid.rows,
    w: Array.from(grid.walls),
    s: [grid.start.x, grid.start.y],
    e: [grid.end.x, grid.end.y],
    f: grid.flags.map((f) => [f.x, f.y]),
    t: grid.traps.map((t) => [t.x, t.y]),
    fog: grid.fog,
    m: grid.memory,
    h: grid.hunter ? [grid.hunter.spawnMs, grid.hunter.speed] : null,
    difficulty: level.difficulty,
  }
}

function fromJSON(data) {
  return {
    cols: data.c,
    rows: data.r,
    walls: Uint8Array.from(data.w),
    start: { x: data.s[0], y: data.s[1] },
    end: { x: data.e[0], y: data.e[1] },
    flags: data.f.map(([x, y]) => ({ x, y })),
    traps: data.t.map(([x, y]) => ({ x, y })),
    fog: data.fog ?? null,
    memory: data.m ?? null,
    hunter: data.h ? { spawnMs: data.h[0], speed: data.h[1] } : null,
  }
}

export { TIERS, generateLevel, buildCandidate, fitHunter, toJSON, fromJSON, placeFlags, placeTraps }
