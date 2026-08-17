/**
 * What shape of problem a level is.
 *
 * Every level so far has been generated from a tier and a seed. The tier says
 * which mechanics are switched on and the seed shuffles the geometry — which
 * means two levels in the same chapter differ in their walls and in nothing
 * else. Twenty-eight of the thirty-nine shipped levels re-run a configuration
 * the player has already been taught.
 *
 * These are the numbers that let a level be told apart from another one by
 * something the player would actually notice: how committed the route is, how
 * often it forks, how far the maize drags you off it, how crowded the traps
 * are, whether there is a single place the whole level funnels through.
 *
 * Two things use them. `INTENTS` in generate.js turns them into a question a
 * level must ask before it is allowed to ship, and the distinctness rule in
 * buildLevels.js uses the vector to refuse a level that is too near one already
 * accepted. Both are checks in the existing style: generate, measure, discard.
 *
 * Everything here is a graph fact — cheap, exact, and independent of how well
 * anyone plays.
 *
 * Every term in the comparable vector is a rate rather than a count, so two
 * boards of different sizes are compared on shape and not on area. `loopRate`
 * is the one exception worth knowing about: on a *fully open* room it climbs
 * with size. Carved mazes never approach that — the generator injects loops as
 * a fixed proportion — so within the levels this game ships it behaves.
 */

import { DIRECTIONS, isOpen, key } from '../engine/grid.js'
import { findPath, distancesFrom } from './analysis.js'

/** How many of a cell's four sides are open. */
function openSides(grid, x, y) {
  let open = 0
  for (const direction of DIRECTIONS) {
    if (isOpen(grid, x, y, direction)) open += 1
  }
  return open
}

/** Every open edge in the maze, counted once. */
function edgeCount(grid) {
  let edges = 0
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      // right and bottom only, so each shared edge is counted a single time
      if (isOpen(grid, x, y, DIRECTIONS[1])) edges += 1
      if (isOpen(grid, x, y, DIRECTIONS[2])) edges += 1
    }
  }
  return edges
}

/**
 * Cells on the route that the level cannot be finished without.
 *
 * Found by removing each one and asking whether the exit is still reachable. A
 * maze with none of these is a maze you can always go around; a maze with
 * several has places the hunter can simply wait.
 */
function chokepoints(grid, route) {
  let count = 0
  for (const cell of route) {
    if (cell.x === grid.start.x && cell.y === grid.start.y) continue
    if (cell.x === grid.end.x && cell.y === grid.end.y) continue
    const blocked = new Set([key(cell.x, cell.y)])
    if (!findPath(grid, grid.start, grid.end, blocked)) count += 1
  }
  return count
}

/**
 * How widely the maize is spread around the start, in degrees.
 *
 * Capturing sends you back, so each ear is its own round trip. Two ears in the
 * same direction is one walk done twice; two ears in opposite directions is a
 * different level entirely, and this is the number that tells them apart.
 */
function maizeSpread(grid) {
  if (grid.flags.length < 2) return 0

  const angles = grid.flags.map((flag) =>
    Math.atan2(flag.y - grid.start.y, flag.x - grid.start.x)
  ).sort((a, b) => a - b)

  // widest gap between neighbours on the circle; the spread is what is left
  let widest = angles[0] + Math.PI * 2 - angles[angles.length - 1]
  for (let i = 1; i < angles.length; i++) {
    widest = Math.max(widest, angles[i] - angles[i - 1])
  }
  return Math.round(((Math.PI * 2 - widest) * 180) / Math.PI)
}

/** Cells within one step of the route, as a set of keys. */
function routeShoulder(grid, route) {
  const shoulder = new Set()
  for (const cell of route) {
    shoulder.add(key(cell.x, cell.y))
    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, cell.x, cell.y, direction)) continue
      shoulder.add(key(cell.x + direction.dx, cell.y + direction.dy))
    }
  }
  return shoulder
}

/**
 * The shape of one level, as numbers.
 *
 * Rates rather than counts throughout, so an 18x11 board and a 13x8 board can
 * be compared without the bigger one simply scoring higher on everything.
 */
function levelMetrics(grid) {
  const route = findPath(grid, grid.start, grid.end)
  if (!route) return null

  const cells = grid.cols * grid.rows
  const span = grid.cols + grid.rows
  const shoulder = routeShoulder(grid, route)

  let junctions = 0
  for (const cell of route) {
    if (openSides(grid, cell.x, cell.y) >= 3) junctions += 1
  }

  const chokes = chokepoints(grid, route)
  const fromStart = distancesFrom(grid, grid.start)
  const detours = grid.flags.map((flag) => fromStart.get(key(flag.x, flag.y)) ?? 0)

  return {
    // how long the walk is against the size of the board
    routeRatio: route.length / span,
    // how often it forks under your feet
    junctionRate: junctions / route.length,
    // edges beyond a spanning tree: how much the maze lets you go around
    loopRate: (edgeCount(grid) - (cells - 1)) / cells,
    // degrees of arc the maize is scattered over, seen from the start
    maizeSpread: maizeSpread(grid),
    // mean trip out to an ear, against the length of the main route
    maizeDetour: detours.length
      ? detours.reduce((a, b) => a + b, 0) / detours.length / route.length
      : 0,
    // share of traps sitting on or beside the way through
    trapPressure: grid.traps.length
      ? grid.traps.filter((t) => shoulder.has(key(t.x, t.y))).length / grid.traps.length
      : 0,
    // places the level funnels through and cannot avoid
    chokepoints: chokes,
    // the same thing as a share of the walk, which is what makes it comparable
    // between a 13x8 board and an 18x11 one
    chokeRate: chokes / route.length,
    routeLength: route.length,
  }
}

/**
 * The comparable form: a short vector of roughly 0..1 numbers.
 *
 * Used only for "is this level too much like that one". Each term is scaled so
 * a meaningful difference in it moves the distance by a similar amount —
 * otherwise `maizeSpread`, measured in degrees, would drown out everything
 * else and distinctness would come to mean "the maize is somewhere different".
 */
function intentVector(metrics) {
  return [
    metrics.routeRatio / 3,
    metrics.junctionRate * 2,
    metrics.loopRate * 6,
    metrics.maizeSpread / 360,
    metrics.maizeDetour * 2,
    metrics.trapPressure,
    /*
     * The rate, not the count. A count grows with the board, so an 18x11 level
     * would read as far from a 13x8 one for no reason a player could see —
     * "distinct" has to mean a different shape, not a different size.
     */
    metrics.chokeRate,
  ]
}

/** Euclidean distance between two levels' shapes. */
function shapeDistance(a, b) {
  const u = intentVector(a)
  const v = intentVector(b)
  let sum = 0
  for (let i = 0; i < u.length; i++) sum += (u[i] - v[i]) ** 2
  return Math.sqrt(sum)
}

export {
  levelMetrics,
  intentVector,
  shapeDistance,
  chokepoints,
  maizeSpread,
  openSides,
  edgeCount,
}
