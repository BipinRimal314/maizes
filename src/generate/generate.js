/**
 * Generate a level: build, place, judge, keep or discard.
 *
 * Levels are never repaired. If a candidate fails the oracle it is thrown away
 * and the next seed is tried. That is the whole reason this architecture exists
 * — the previous version placed obstacles and then tried to patch the result
 * into fairness, and every patch had an edge it did not cover.
 */

import { key, setSurface, SAND, SNOW, DIRECTIONS, isOpen } from '../engine/grid.js'
import { createRng } from './rng.js'
import { buildMaze } from './maze.js'
import { branchDepth, distancesFrom, safeReachable } from './analysis.js'
import { judge } from './oracle.js'
import { hunterSpeedCap } from '../engine/hunter.js'
import { levelMetrics, shapeDistance } from './metrics.js'

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
 * The fog only ever tightens, and only on a chapter that is not introducing
 * something else: 4.5 where it arrives, 2.9 from the chapter that is about fog,
 * 2.4 once the boards get bigger. The chapters that introduce the hunter and
 * fading memory inherit the radius of the one before them untouched, because
 * one new variable at a time is the whole reason a player can tell what got
 * harder.
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

  blind: { cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 3, fog: 2.9 },

  // `hunted` is `blind` with a hunter and nothing else changed — the same trick
  // that introduced fog, for the same reason. Generous timer, slow hunter.
  hunted: {
    cols: 16, rows: 9, loops: 0.08, flags: 2, traps: 3, fog: 2.9,
    hunter: { speed: 0.075, margin: 1.9 },
  },

  // Faster than the hunter in `hunted`, but not on a tighter leash. The last
  // chapter is meant to be the hard one, not the unfun one, and being caught
  // already costs a respawn on the biggest, foggiest boards in the game.
  cruel: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // Sand arrives: `cruel` with patches of sun-baked flat and nothing else
  // changed. The ball crosses them half again as fast, which is a gift on a
  // straight and a problem on the corner at the end of one.
  dry: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    sand: 4,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // Snow arrives, and the sand stays: once a mechanic is in the game it does
  // not leave. Deep snow costs the ball nearly a third of its speed, which is
  // why the hunter's cap is computed per grid — see hunter.js.
  white: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    sand: 3, snow: 3,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // `fading` is `cruel` with a memory that rots, and nothing else changed. The
  // trail you leave closes up behind you, so the map you have built in your
  // head stops matching the one on screen.
  fading: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    sand: 3, snow: 3,
    memory: 7000,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // The enchanted forest. Mechanically this is `fading` with a shorter memory
  // and nothing else changed; everything that makes it feel different is the
  // terrain, which is presentation and touches no proof.
  enchanted: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    sand: 3, snow: 3,
    memory: 4000,
    hunter: { speed: 0.095, margin: 1.8 },
  },

  // Same again, only the memory is shorter — the one variable tightening, the
  // way the fog radius tightens from chapter to chapter.
  vanishing: {
    cols: 18, rows: 11, loops: 0.10, flags: 3, traps: 5, fog: 2.4,
    sand: 3, snow: 3,
    memory: 2500,
    hunter: { speed: 0.095, margin: 1.8 },
  },
}

/**
 * What question a level asks.
 *
 * The tier says which mechanics are switched on. The intent says what shape of
 * problem they are arranged into — and two levels in the same chapter now
 * differ by this rather than only by their random seed, which is the whole
 * reason twenty-eight of thirty-nine shipped levels felt like re-runs.
 *
 * An intent is two things: knobs that change how the maze is built, and a
 * `want` the finished level has to satisfy. The want is checked *before* the
 * physics simulation, so a candidate with the wrong shape is thrown away for
 * almost nothing — only the ones that ask the right question are expensive.
 *
 * The thresholds are taken from the measured spread of the thirty-nine levels
 * that already exist, not invented: `warren` wants a junction rate above the
 * 75th percentile, `artery` below the 25th, and so on. That way each intent is
 * demonstrably reachable and demonstrably not the average.
 */
const INTENTS = {
  // one long committed walk. Few forks, so a wrong turn is a long wrong turn.
  artery: {
    loops: 0.04,
    want: (m) => m.routeRatio >= 2.05 && m.junctionRate <= 0.24,
  },

  // forks under your feet the whole way. The question is whether you can hold
  // a map in your head, which is the question fog was introduced to ruin.
  warren: {
    loops: 0.12,
    want: (m) => m.junctionRate >= 0.33 && m.routeRatio <= 2.1,
  },

  // maize scattered around the compass. Each ear is its own round trip, so
  // spreading them turns one walk done twice into two different walks.
  detour: {
    spreadMaize: true,
    want: (m) => m.maizeSpread >= 100,
  },

  // traps crowding the only way through. Care, at whatever speed you dare.
  gauntlet: {
    crowdTraps: true,
    want: (m) => m.trapPressure >= 0.8,
  },

  // places the level funnels through, which are places something can wait.
  // The upper bound on route length is what keeps this a funnel rather than a
  // snake: without it the cheapest way to score chokepoints is one long
  // corridor, which is a different and much duller level.
  bottleneck: {
    loops: 0.05,
    want: (m) => m.chokepoints >= 22 && m.routeRatio <= 2.5,
  },

  // loops everywhere, so a wrong turn costs almost nothing and the only thing
  // left to be good at is speed.
  circuit: {
    loops: 0.17,
    want: (m) => m.loopRate >= 0.13 && m.routeRatio <= 1.95,
  },
}

/**
 * Flags go where a player would plausibly go looking: deep in a branch off the
 * main route, and a decent distance from the start.
 */
function placeFlags(grid, route, rng, count, intent = {}) {
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

  /*
   * On a `detour` level, pick for angle rather than for score.
   *
   * Rejection sampling cannot find this on its own — the measured median
   * spread across the shipped set is 23 degrees, so waiting for a seed that
   * happens to scatter the maize around the compass would burn thousands of
   * candidates. Choosing greedily for the widest gap gets there directly.
   */
  const angleOf = (c) => Math.atan2(c.y - grid.start.y, c.x - grid.start.x)
  const separation = (a, b) => {
    const d = Math.abs(angleOf(a) - angleOf(b))
    return Math.min(d, Math.PI * 2 - d)
  }

  for (const candidate of pool) {
    if (chosen.length >= count) break
    const tooClose = chosen.some(
      (c) => Math.abs(c.x - candidate.x) + Math.abs(c.y - candidate.y) < 3
    )
    if (tooClose) continue
    if (intent.spreadMaize && chosen.length > 0) {
      const nearest = Math.min(...chosen.map((c) => separation(c, candidate)))
      if (nearest < Math.PI / 2.4) continue
    }
    chosen.push(candidate)
  }

  // a spread that could not be met is a dud seed, not a level to ship anyway
  if (intent.spreadMaize && chosen.length < count) return false

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
function placeTraps(grid, route, rng, count, intent = {}) {
  if (count === 0) return true

  const depth = branchDepth(grid, route)
  const reserved = new Set([
    key(grid.start.x, grid.start.y),
    key(grid.end.x, grid.end.y),
    ...grid.flags.map((f) => key(f.x, f.y)),
  ])

  // ordinarily traps sit one to three steps off the route — the tempting wrong
  // turn. A `gauntlet` pulls them right up against it, so the danger is on the
  // way through rather than beside it.
  const maxDepth = intent.crowdTraps ? 1 : 3
  const candidates = []
  for (const [id, d] of depth) {
    if (d < 1 || d > maxDepth) continue
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

/**
 * Lay patches of unusual ground.
 *
 * Blobs, not scatter. A single fast cell in the middle of a corridor is noise —
 * you are across it before it registers. A patch you can see coming, commit to
 * and cross is a decision, and it reads on the board as somewhere rather than
 * as a texture.
 *
 * Nothing is laid on the start, the exit, an ear of maize or a trap. The first
 * three are places the player must be able to read at a glance and the fourth
 * is invisible — tinting the ground over a trap would be a tell, and a trap you
 * can see is not a trap.
 */
function placeSurfaces(grid, rng, { sand = 0, snow = 0 } = {}) {
  const reserved = new Set([
    key(grid.start.x, grid.start.y),
    key(grid.end.x, grid.end.y),
    ...grid.flags.map((f) => key(f.x, f.y)),
    ...grid.traps.map((t) => key(t.x, t.y)),
  ])
  const taken = new Set()

  const grow = (kind, size) => {
    const seeds = []
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const id = key(x, y)
        if (reserved.has(id) || taken.has(id)) continue
        seeds.push({ x, y })
      }
    }
    if (seeds.length === 0) return false

    const from = rng.pick(seeds)
    const blob = []
    const queue = [from]
    const seen = new Set([key(from.x, from.y)])

    // flood outward through open edges only, so a patch is one walkable place
    // rather than a shape sprayed across walls
    for (let head = 0; head < queue.length && blob.length < size; head++) {
      const at = queue[head]
      const id = key(at.x, at.y)
      if (reserved.has(id) || taken.has(id)) continue
      blob.push(at)
      taken.add(id)

      for (const direction of rng.shuffle([...DIRECTIONS])) {
        if (!isOpen(grid, at.x, at.y, direction)) continue
        const next = { x: at.x + direction.dx, y: at.y + direction.dy }
        const nid = key(next.x, next.y)
        if (seen.has(nid)) continue
        seen.add(nid)
        queue.push(next)
      }
    }

    if (blob.length < 2) return false
    for (const cell of blob) setSurface(grid, cell.x, cell.y, kind)
    return true
  }

  for (let i = 0; i < sand; i++) {
    if (!grow(SAND, 3 + rng.int(4))) return false
  }
  for (let i = 0; i < snow; i++) {
    if (!grow(SNOW, 3 + rng.int(4))) return false
  }
  return true
}

/** Build one candidate level from a seed, or null if the seed is a dud. */
function buildCandidate(seed, tier, intent = {}) {
  const rng = createRng(seed)
  // an intent may reshape the maze itself before anything is placed in it
  const built = buildMaze(rng, { ...tier, loops: intent.loops ?? tier.loops })
  if (!built) return null

  const { grid, route } = built
  grid.fog = tier.fog
  grid.memory = tier.memory ?? null

  if (!placeFlags(grid, route, rng, tier.flags, intent)) return null
  if (!placeTraps(grid, route, rng, tier.traps, intent)) return null
  if (!placeSurfaces(grid, rng, tier)) return null

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
    /*
     * Clamped here, so the shipped level records the speed that actually runs.
     * `createHunter` clamps too, but writing the tier's wish into the artifact
     * and quietly running something slower makes the data a lie — and it is the
     * data the tests re-judge the campaign against.
     *
     * On a grid with snow the cap is well under what the tier asks for, because
     * the hunter is sized against the ball on the worst ground it will meet.
     */
    speed: Math.min(tier.hunter.speed, hunterSpeedCap(grid)),
  }
}

/**
 * Search seeds until one produces a level the oracle accepts.
 *
 * Returns the level plus the verdict that admitted it, so the shipped set
 * carries its own evidence.
 */
function generateLevel(tierName, seed, { attempts = 2500, intent: intentName = null, unlike = [], apart = 0 } = {}) {
  const tier = TIERS[tierName]
  if (!tier) throw new Error(`unknown tier: ${tierName}`)

  const intent = intentName ? INTENTS[intentName] : null
  if (intentName && !intent) throw new Error(`unknown intent: ${intentName}`)

  const rejected = []

  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidateSeed = seed + attempt * 7919
    const grid = buildCandidate(candidateSeed, tier, intent ?? {})
    if (!grid) {
      rejected.push({ seed: candidateSeed, problems: ['could not be built'] })
      continue
    }

    /*
     * Shape first, physics second.
     *
     * Both of these throw candidates away, and one of them costs a hundred
     * thousand simulation steps while the other costs a breadth-first search.
     * Asking the cheap question first is the difference between a build that
     * takes two seconds and one that takes several minutes.
     */
    const metrics = levelMetrics(grid)
    if (!metrics) {
      rejected.push({ seed: candidateSeed, problems: ['no route to measure'] })
      continue
    }
    if (intent && !intent.want(metrics)) {
      rejected.push({ seed: candidateSeed, problems: [`not ${intentName} enough`] })
      continue
    }
    const tooSimilar = unlike.find((other) => shapeDistance(metrics, other) < apart)
    if (tooSimilar) {
      rejected.push({ seed: candidateSeed, problems: ['too much like a level already accepted'] })
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
        intent: intentName,
        metrics,
        difficulty: verdict.difficulty,
        attempts: attempt + 1,
        rejected,
      }
    }
    rejected.push({ seed: candidateSeed, problems: verdict.problems })
  }

  return { grid: null, rejected, attempts }
}

/** Sparse form: only the cells that are not ordinary ground. */
function surfaceCells(grid) {
  const out = []
  if (!grid.surface) return out
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const kind = grid.surface[y * grid.cols + x]
      if (kind !== 0) out.push([x, y, kind])
    }
  }
  return out
}

function surfaceFrom(data) {
  const surface = new Uint8Array(data.c * data.r)
  for (const [x, y, kind] of data.sf ?? []) surface[y * data.c + x] = kind
  return surface
}

/** Serialise to the compact shipped form. */
function toJSON(level, name) {
  const { grid } = level
  return {
    name,
    tier: level.tier,
    intent: level.intent,
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
    sf: surfaceCells(grid),
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
    terrain: data.terrain ?? null,
    surface: surfaceFrom(data),
    hunter: data.h ? { spawnMs: data.h[0], speed: data.h[1] } : null,
  }
}

export {
  TIERS, INTENTS, generateLevel, buildCandidate, fitHunter, toJSON, fromJSON,
  placeFlags, placeTraps, placeSurfaces,
}
