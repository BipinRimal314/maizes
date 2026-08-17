import { describe, it, expect } from 'vitest'
import { createGrid, setWall, DIRECTIONS } from '../engine/grid.js'
import { levelMetrics, shapeDistance, chokepoints, maizeSpread, edgeCount, openSides } from './metrics.js'
import { findPath } from './analysis.js'

/**
 * The shape numbers.
 *
 * These decide which levels are allowed to exist, so they are checked against
 * mazes whose answers can be worked out by hand rather than against generated
 * ones where a wrong number would look plausible.
 */

/** A 1-cell-tall corridor, `n` long, open end to end. */
function corridor(n) {
  const grid = createGrid(n, 1)
  for (let x = 0; x + 1 < n; x++) setWall(grid, x, 0, DIRECTIONS[1], false)
  grid.start = { x: 0, y: 0 }
  grid.end = { x: n - 1, y: 0 }
  return grid
}

/** A fully open rectangle: every interior wall down. */
function open(cols, rows) {
  const grid = createGrid(cols, rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) setWall(grid, x, y, DIRECTIONS[1], false)
      if (y + 1 < rows) setWall(grid, x, y, DIRECTIONS[2], false)
    }
  }
  grid.start = { x: 0, y: 0 }
  grid.end = { x: cols - 1, y: rows - 1 }
  return grid
}

describe('counting the maze', () => {
  it('counts open sides', () => {
    const grid = corridor(4)
    expect(openSides(grid, 0, 0)).toBe(1)   // one end
    expect(openSides(grid, 1, 0)).toBe(2)   // middle
    expect(openSides(grid, 3, 0)).toBe(1)   // other end
  })

  it('counts each shared edge once', () => {
    // a corridor of n cells has exactly n-1 edges
    expect(edgeCount(corridor(6))).toBe(5)
    // a fully open 3x3 has 3 horizontal edges per row x3, plus 3 vertical x2
    expect(edgeCount(open(3, 3))).toBe(12)
  })
})

describe('chokepoints', () => {
  it('finds every interior cell of a corridor', () => {
    // remove any middle cell and the far end is unreachable
    const grid = corridor(7)
    const route = findPath(grid, grid.start, grid.end)
    expect(chokepoints(grid, route)).toBe(5)
  })

  it('finds none at all in a room you can walk around', () => {
    const grid = open(4, 4)
    const route = findPath(grid, grid.start, grid.end)
    expect(chokepoints(grid, route)).toBe(0)
  })
})

describe('maize spread', () => {
  it('is zero with fewer than two ears', () => {
    const grid = open(5, 5)
    expect(maizeSpread(grid)).toBe(0)
    grid.flags = [{ x: 4, y: 0 }]
    expect(maizeSpread(grid)).toBe(0)
  })

  it('is a right angle when the ears are at a right angle', () => {
    const grid = open(5, 5)
    grid.start = { x: 0, y: 0 }
    grid.flags = [{ x: 4, y: 0 }, { x: 0, y: 4 }]   // due east and due south
    expect(maizeSpread(grid)).toBe(90)
  })

  it('is small when both ears lie the same way', () => {
    const grid = open(9, 9)
    grid.start = { x: 0, y: 4 }
    grid.flags = [{ x: 8, y: 3 }, { x: 8, y: 5 }]
    expect(maizeSpread(grid)).toBeLessThan(30)
  })

  it('measures the arc they occupy, not the gap they leave', () => {
    // three ears clustered east: the widest gap is the empty west, so the
    // spread is the narrow arc, not the 270 degrees of nothing
    const grid = open(9, 9)
    grid.start = { x: 4, y: 4 }
    grid.flags = [{ x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }]
    expect(maizeSpread(grid)).toBeLessThan(60)
  })
})

describe('the level shape', () => {
  it('reports a corridor as long, forkless and full of chokepoints', () => {
    const m = levelMetrics(corridor(12))
    expect(m.junctionRate).toBe(0)
    expect(m.loopRate).toBe(0)
    expect(m.chokepoints).toBe(10)
    expect(m.routeRatio).toBeGreaterThan(0.9)
  })

  it('reports an open room as forked, loopy and free of chokepoints', () => {
    const m = levelMetrics(open(6, 6))
    expect(m.junctionRate).toBeGreaterThan(0.5)
    expect(m.loopRate).toBeGreaterThan(0.3)
    expect(m.chokepoints).toBe(0)
  })

  it('returns nothing for a maze with no way through', () => {
    const grid = createGrid(4, 4)      // every wall still up
    expect(levelMetrics(grid)).toBeNull()
  })

  it('is scale-free, so a big board does not simply score higher', () => {
    // the same shape at two sizes must land close together, or "distinct"
    // degenerates into "a different size of board"
    const short = levelMetrics(corridor(8))
    const long = levelMetrics(corridor(16))
    expect(shapeDistance(short, long)).toBeLessThan(0.4)

    const smallRoom = levelMetrics(open(5, 5))
    const bigRoom = levelMetrics(open(10, 10))
    expect(Math.abs(smallRoom.junctionRate - bigRoom.junctionRate)).toBeLessThan(0.2)
    expect(Math.abs(smallRoom.chokeRate - bigRoom.chokeRate)).toBeLessThan(0.1)
  })

  it('reports chokepoints as a share of the walk as well as a count', () => {
    const m = levelMetrics(corridor(11))
    expect(m.chokepoints).toBe(9)
    expect(m.chokeRate).toBeCloseTo(9 / 11, 6)
  })
})

describe('shape distance', () => {
  it('is zero between a level and itself', () => {
    const m = levelMetrics(open(6, 6))
    expect(shapeDistance(m, m)).toBe(0)
  })

  it('separates a corridor from a room by a lot', () => {
    expect(shapeDistance(levelMetrics(corridor(12)), levelMetrics(open(6, 6))))
      .toBeGreaterThan(1)
  })

  it('is symmetric', () => {
    const a = levelMetrics(corridor(9))
    const b = levelMetrics(open(5, 5))
    expect(shapeDistance(a, b)).toBeCloseTo(shapeDistance(b, a), 12)
  })

  it('lets no single term dominate the rest', () => {
    /*
     * `maizeSpread` is in degrees and everything else is a rate near zero. If
     * it were fed in raw, two levels differing only in where the maize sits
     * would read as further apart than a corridor is from an open room, and
     * "distinct" would quietly come to mean "the maize is somewhere else".
     */
    const near = levelMetrics(open(6, 6))
    const far = levelMetrics(open(6, 6))
    near.maizeSpread = 0
    far.maizeSpread = 180
    const maizeOnly = shapeDistance(near, far)
    const corridorVsRoom = shapeDistance(levelMetrics(corridor(12)), levelMetrics(open(6, 6)))
    expect(maizeOnly).toBeLessThan(corridorVsRoom)
  })
})
