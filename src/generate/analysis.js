/**
 * Graph facts about a maze.
 *
 * Everything the oracle needs to judge a level exactly, without simulating
 * anything. Cheap, deterministic, and the right tool for questions that have a
 * definite answer — "is this flag reachable without dying" is not a matter of
 * how well someone plays.
 */

import { DIRECTIONS, inBounds, isOpen, key } from '../engine/grid.js'

/** Breadth-first distances from a cell, optionally refusing to enter `blocked`. */
function distancesFrom(grid, origin, blocked = null) {
  const dist = new Map([[key(origin.x, origin.y), 0]])
  const queue = [origin]

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    const d = dist.get(key(at.x, at.y))

    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      const id = key(nx, ny)
      if (dist.has(id)) continue
      if (blocked && blocked.has(id)) continue
      dist.set(id, d + 1)
      queue.push({ x: nx, y: ny })
    }
  }

  return dist
}

/** Shortest route between two cells, or null. */
function findPath(grid, from, to, blocked = null) {
  const previous = new Map([[key(from.x, from.y), null]])
  const queue = [from]

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    if (at.x === to.x && at.y === to.y) {
      const path = []
      let cursor = key(at.x, at.y)
      while (cursor !== null && cursor !== undefined) {
        const [px, py] = cursor.split(',').map(Number)
        path.push({ x: px, y: py })
        cursor = previous.get(cursor)
      }
      return path.reverse()
    }

    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      const id = key(nx, ny)
      if (previous.has(id)) continue
      if (blocked && blocked.has(id)) continue
      previous.set(id, key(at.x, at.y))
      queue.push({ x: nx, y: ny })
    }
  }

  return null
}

/**
 * Cells reachable from the start without ever entering a trap.
 *
 * This is the fairness question. A flag outside this set can only be captured
 * by dying on the way, and three levels shipped like that last time.
 */
function safeReachable(grid, traps) {
  return new Set(distancesFrom(grid, grid.start, traps).keys())
}

/** The two cells furthest apart, both through the maze and across the board. */
function furthestPair(grid, spatialFloor) {
  const cells = []
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) cells.push({ x, y })
  }

  let best = null
  for (const origin of cells) {
    const dist = distancesFrom(grid, origin)
    for (const [id, d] of dist) {
      const [x, y] = id.split(',').map(Number)
      const manhattan = Math.abs(x - origin.x) + Math.abs(y - origin.y)
      // Graph distance alone picks cells that sit side by side with a wall
      // between them: a forty-step walk to the square you are standing next to.
      // That is the shape the old fitness function was rewarding.
      if (manhattan < spatialFloor) continue
      if (!best || d > best.distance) {
        best = { from: origin, to: { x, y }, distance: d }
      }
    }
  }

  return best
}

/**
 * How far each cell sits down a branch off the main route. Depth 0 is on the
 * route; deeper means the player has already committed to going that way.
 */
function branchDepth(grid, route) {
  const depth = new Map()
  const queue = []

  for (const cell of route) {
    depth.set(key(cell.x, cell.y), 0)
    queue.push(cell)
  }

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    const d = depth.get(key(at.x, at.y))
    for (const direction of DIRECTIONS) {
      if (!isOpen(grid, at.x, at.y, direction)) continue
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      const id = key(nx, ny)
      if (depth.has(id)) continue
      depth.set(id, d + 1)
      queue.push({ x: nx, y: ny })
    }
  }

  return depth
}

/** Cells with exactly one open side — the tips of dead ends. */
function deadEnds(grid) {
  const out = []
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      let open = 0
      for (const direction of DIRECTIONS) {
        if (isOpen(grid, x, y, direction)) open++
      }
      if (open === 1) out.push({ x, y })
    }
  }
  return out
}

/** Every cell connected to the start at all. */
function connectedCount(grid) {
  return distancesFrom(grid, grid.start).size
}

function isFullyConnected(grid) {
  let openCells = 0
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (inBounds(grid, x, y)) openCells++
    }
  }
  return connectedCount(grid) === openCells
}

export {
  distancesFrom,
  findPath,
  safeReachable,
  furthestPair,
  branchDepth,
  deadEnds,
  connectedCount,
  isFullyConnected,
}
