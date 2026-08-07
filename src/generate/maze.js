/**
 * Maze construction.
 *
 * Recursive backtracker for a perfect maze (exactly one route between any two
 * cells), then a few walls removed to create loops so the layout is not a pure
 * tree and a wrong turn is not always instantly obvious.
 *
 * No geometry is ever hand-authored. Everything is a function of the seed.
 */

import { createGrid, DIRECTIONS, inBounds, setWall, isOpen, key } from '../engine/grid.js'
import { furthestPair, deadEnds, findPath } from './analysis.js'

/** Carve a perfect maze with an iterative depth-first walk. */
function carve(grid, rng) {
  const visited = new Set()
  const startX = rng.int(grid.cols)
  const startY = rng.int(grid.rows)
  const stack = [{ x: startX, y: startY }]
  visited.add(key(startX, startY))

  while (stack.length) {
    const at = stack[stack.length - 1]
    const options = []

    for (const direction of DIRECTIONS) {
      const nx = at.x + direction.dx
      const ny = at.y + direction.dy
      if (!inBounds(grid, nx, ny)) continue
      if (visited.has(key(nx, ny))) continue
      options.push(direction)
    }

    if (options.length === 0) {
      stack.pop()
      continue
    }

    const direction = rng.pick(options)
    const nx = at.x + direction.dx
    const ny = at.y + direction.dy
    setWall(grid, at.x, at.y, direction, false)
    visited.add(key(nx, ny))
    stack.push({ x: nx, y: ny })
  }
}

/**
 * Knock out a proportion of the remaining interior walls.
 *
 * A perfect maze has exactly one route anywhere, which makes every junction a
 * binary right-or-wrong. Loops mean a wrong turn can still get you somewhere,
 * which is what makes a wrong turn cost thought rather than just time.
 */
function addLoops(grid, rng, proportion) {
  const candidates = []

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      for (const direction of [DIRECTIONS[1], DIRECTIONS[2]]) { // right, bottom
        const nx = x + direction.dx
        const ny = y + direction.dy
        if (!inBounds(grid, nx, ny)) continue
        if (isOpen(grid, x, y, direction)) continue
        candidates.push({ x, y, direction })
      }
    }
  }

  const shuffled = rng.shuffle(candidates)
  const count = Math.floor(candidates.length * proportion)
  for (let i = 0; i < count; i++) {
    const c = shuffled[i]
    setWall(grid, c.x, c.y, c.direction, false)
  }
}

/**
 * Build a maze and place its start and exit as far apart as the layout allows,
 * measured both through the corridors and across the board.
 */
function buildMaze(rng, { cols, rows, loops }) {
  const grid = createGrid(cols, rows)
  carve(grid, rng)
  addLoops(grid, rng, loops)

  const spatialFloor = (cols + rows) * 0.3
  const pair = furthestPair(grid, spatialFloor)
  if (!pair) return null

  grid.start = pair.from
  grid.end = pair.to

  const route = findPath(grid, grid.start, grid.end)
  if (!route) return null

  return { grid, route, deadEnds: deadEnds(grid) }
}

export { buildMaze, carve, addLoops }
