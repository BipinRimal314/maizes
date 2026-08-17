/**
 * The oracle: everything a level must satisfy before it is allowed to exist.
 *
 * A level is generated, then judged. If it fails any check it is thrown away
 * and the next seed is tried. Nothing is ever patched up to pass — a level that
 * needs fixing is a level we do not need.
 *
 * The checks are ordered cheapest first, because most rejections are cheap
 * ones and the physics simulation is by far the most expensive.
 *
 * Each rule below exists because its absence shipped a broken level last time.
 */

import { key } from '../engine/grid.js'
import { findPath, safeReachable, distancesFrom } from './analysis.js'
import { playPerfectly, playBlind } from './solvers.js'

const RULES = {
  //: the exit must be far enough away, through the maze and across the board
  MIN_ROUTE_FRACTION: 0.5,
  MIN_SPATIAL_FRACTION: 0.25,
  //: a blind player should not need dozens of attempts
  MAX_BLIND_DEATHS: 25,
  //: being caught costs the whole attempt, so it gets a far smaller allowance
  MAX_BLIND_LOSSES: 6,
  /*
   * How long optimal play may take. A cap on patience, not on difficulty.
   *
   * The `artery` and `bottleneck` intents produce long committed routes, which
   * is the point of them — but left unbounded they produced a hundred-cell
   * corridor taking a minute of perfect play, on boards that also carry a
   * hunter and a memory that rots. Losing one of those at the fifty-fifth
   * second is not hard, it is tedious, and the fix is to never ship it.
   */
  MAX_PERFECT_SECONDS: 40,
}

function trapKeys(grid) {
  return new Set(grid.traps.map((t) => key(t.x, t.y)))
}

/**
 * Exact, graph-based checks. Fast, and they answer questions that have definite
 * answers regardless of how well anyone plays.
 */
function checkStructure(grid) {
  const problems = []
  const traps = trapKeys(grid)
  const scale = grid.cols + grid.rows

  const route = findPath(grid, grid.start, grid.end)
  if (!route) {
    problems.push('no route from the start to the exit')
    return problems
  }

  if (route.length < scale * RULES.MIN_ROUTE_FRACTION) {
    problems.push(`the route is only ${route.length} cells`)
  }

  const manhattan = Math.abs(grid.start.x - grid.end.x) + Math.abs(grid.start.y - grid.end.y)
  if (manhattan < scale * RULES.MIN_SPATIAL_FRACTION) {
    // an exit two cells from the start behind a wall is not a hard level, and
    // the old difficulty metric scored exactly that shape highest
    problems.push(`the exit is ${manhattan} cells from the start`)
  }

  // Nothing lethal may stand between the player and anything they must touch.
  // Three levels shipped with every flag behind a trap, on a difficulty where
  // dying wipes captured flags — unwinnable, not hard.
  const safe = safeReachable(grid, traps)
  if (!safe.has(key(grid.end.x, grid.end.y))) {
    problems.push('the exit can only be reached by stepping on a trap')
  }
  for (const flag of grid.flags) {
    if (!safe.has(key(flag.x, flag.y))) {
      problems.push(`flag ${flag.x},${flag.y} can only be reached by stepping on a trap`)
    }
  }

  for (const trap of grid.traps) {
    if (trap.x === grid.start.x && trap.y === grid.start.y) problems.push('a trap is on the start')
    if (trap.x === grid.end.x && trap.y === grid.end.y) problems.push('a trap is on the exit')
    if (grid.flags.some((f) => f.x === trap.x && f.y === trap.y)) {
      problems.push(`a trap shares a cell with the flag at ${trap.x},${trap.y}`)
    }
  }

  for (const flag of grid.flags) {
    if (flag.x === grid.end.x && flag.y === grid.end.y) problems.push('a flag is on the exit')
    if (flag.x === grid.start.x && flag.y === grid.start.y) problems.push('a flag is on the start')
  }

  // every cell should be part of the maze; an island is wasted space and can
  // hide a flag forever
  const reachable = distancesFrom(grid, grid.start)
  if (reachable.size !== grid.cols * grid.rows) {
    problems.push(`${grid.cols * grid.rows - reachable.size} cells are walled off entirely`)
  }

  return problems
}

/**
 * Judge a level. Returns `{ ok, problems, difficulty }`.
 *
 * `full` runs the physics simulations too — always on when building the shipped
 * set, and skippable when a caller only wants the cheap structural verdict.
 */
function judge(grid, { full = true } = {}) {
  const problems = checkStructure(grid)
  if (problems.length > 0) return { ok: false, problems, difficulty: null }

  if (!full) return { ok: true, problems: [], difficulty: null }

  // A player who knows everything must finish without dying. If they cannot,
  // the level is unfair or the ball physically cannot walk it.
  const perfect = playPerfectly(grid)
  if (!perfect.solved) {
    return { ok: false, problems: [`a perfect player could not finish: ${perfect.reason}`], difficulty: null }
  }
  if (perfect.deaths > 0) {
    return { ok: false, problems: [`a perfect player still died ${perfect.deaths} times`], difficulty: null }
  }
  if (perfect.seconds > RULES.MAX_PERFECT_SECONDS) {
    return {
      ok: false,
      problems: [`even played perfectly this takes ${perfect.seconds.toFixed(0)}s`],
      difficulty: null,
    }
  }

  // A blind player estimates how hard it actually is.
  const blind = playBlind(grid)
  if (blind.deaths > RULES.MAX_BLIND_DEATHS) {
    return { ok: false, problems: [`a blind player died ${blind.deaths} times`], difficulty: null }
  }
  if (blind.losses > RULES.MAX_BLIND_LOSSES) {
    return {
      ok: false,
      problems: [`a blind player was caught ${blind.losses} times`],
      difficulty: null,
    }
  }

  return {
    ok: true,
    problems: [],
    difficulty: {
      perfectSeconds: perfect.seconds,
      perfectSteps: perfect.steps,
      // the longest single trip out from the start, which is the interval the
      // hunter's clock actually measures
      perfectLegMs: perfect.longestLegMs,
      blindDeaths: blind.deaths,
      blindLosses: blind.losses,
      blindSeconds: blind.seconds,
      blindSolved: blind.solved,
      explored: blind.explored,
      routeLength: findPath(grid, grid.start, grid.end).length,
    },
  }
}

export { judge, checkStructure, RULES }
