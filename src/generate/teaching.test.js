import { describe, it, expect } from 'vitest'
import { createGrid, setWall, setSurface, DIRECTIONS, SAND, SNOW } from '../engine/grid.js'
import { checkTeaching, graphRadius, surfaceOnRoute, MIN_SURFACE_ON_ROUTE } from './teaching.js'

/**
 * A check that cannot fail is not a check.
 *
 * Every lesson below is shown passing on a level that teaches it and failing on
 * one that does not — which is the only way to tell a working constraint from a
 * predicate that happens to be true of everything it has been shown.
 */

function corridor(n) {
  const grid = createGrid(n, 1)
  for (let x = 0; x + 1 < n; x++) setWall(grid, x, 0, DIRECTIONS[1], false)
  grid.start = { x: 0, y: 0 }
  grid.end = { x: n - 1, y: 0 }
  return grid
}

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

describe('graph radius', () => {
  it('is half the length of a corridor', () => {
    // stand in the middle of eleven cells and the far end is five away
    expect(graphRadius(corridor(11))).toBe(5)
  })

  it('is smaller on a board you can cut across', () => {
    expect(graphRadius(open(6, 6))).toBeLessThan(graphRadius(corridor(36)))
  })
})

describe('the fog lesson', () => {
  const level = () => {
    const grid = open(12, 8)
    grid.fog = 4
    return grid
  }

  it('passes when there is an ear inside the light', () => {
    const grid = level()
    grid.flags = [{ x: 3, y: 2 }]
    expect(checkTeaching(grid, 'fog')).toBeNull()
  })

  it('fails when the first thing to walk to is out in the dark', () => {
    const grid = level()
    grid.flags = [{ x: 11, y: 7 }]
    expect(checkTeaching(grid, 'fog')).toMatch(/nothing to see from the start/)
  })

  it('refuses to claim it taught fog on a level with none', () => {
    const grid = open(8, 8)
    grid.flags = [{ x: 1, y: 1 }]
    expect(checkTeaching(grid, 'fog')).toMatch(/no fog/)
  })
})

describe('the hunter lesson', () => {
  it('passes when there is room for it to be seen coming', () => {
    const grid = corridor(30)
    grid.hunter = { spawnMs: 10000, speed: 0.075 }   // 4.5 cells a second
    expect(checkTeaching(grid, 'hunter')).toBeNull()
  })

  it('fails on a board small enough to cross inside the warning', () => {
    // three seconds at 4.5 cells a second needs fourteen cells of room
    const grid = open(4, 4)
    grid.hunter = { spawnMs: 10000, speed: 0.075 }
    expect(checkTeaching(grid, 'hunter')).toMatch(/it can be on you in/)
  })

  it('fails when the hunter is fast enough to close the gap anyway', () => {
    const grid = corridor(20)
    grid.hunter = { spawnMs: 10000, speed: 0.4 }
    expect(checkTeaching(grid, 'hunter')).toMatch(/it can be on you in/)
  })
})

describe('the ground lessons', () => {
  function withPatch(kind, cells) {
    const grid = corridor(20)
    for (let x = 5; x < 5 + cells; x++) setSurface(grid, x, 0, kind)
    return grid
  }

  it('counts only the patch cells on the way through', () => {
    const grid = corridor(20)
    setSurface(grid, 6, 0, SAND)
    setSurface(grid, 7, 0, SAND)
    expect(surfaceOnRoute(grid, SAND)).toBe(2)
    expect(surfaceOnRoute(grid, SNOW)).toBe(0)
  })

  it('passes when the patch is wide enough to be felt', () => {
    expect(checkTeaching(withPatch(SAND, MIN_SURFACE_ON_ROUTE), 'sand')).toBeNull()
    expect(checkTeaching(withPatch(SNOW, MIN_SURFACE_ON_ROUTE), 'snow')).toBeNull()
  })

  it('fails on a corner you would clip at speed', () => {
    expect(checkTeaching(withPatch(SAND, 1), 'sand')).toMatch(/only 1 cells of sand/)
  })

  it('fails when the patch is somewhere you never go', () => {
    // a patch off to the side of a corridor is a patch nobody walks
    const grid = createGrid(20, 2)
    for (let x = 0; x + 1 < 20; x++) setWall(grid, x, 0, DIRECTIONS[1], false)
    for (let x = 0; x + 1 < 20; x++) setWall(grid, x, 1, DIRECTIONS[1], false)
    grid.start = { x: 0, y: 0 }
    grid.end = { x: 19, y: 0 }
    for (let x = 5; x < 12; x++) setSurface(grid, x, 1, SNOW)
    expect(checkTeaching(grid, 'snow')).toMatch(/only 0 cells of snow/)
  })
})

describe('the memory lesson', () => {
  const grid = () => {
    const g = open(10, 8)
    g.memory = 5000
    return g
  }

  it('passes when a trip out lasts longer than the memory does', () => {
    expect(checkTeaching(grid(), 'memory', { perfectLegMs: 9000 })).toBeNull()
  })

  it('fails when the trail never visibly closes', () => {
    // finish the walk before anything fades and the mechanic introduces
    // itself as nothing at all
    expect(checkTeaching(grid(), 'memory', { perfectLegMs: 4000 }))
      .toMatch(/nothing is seen to fade/)
  })
})

describe('the trap lesson', () => {
  const grid = () => {
    const g = open(8, 8)
    g.traps = [{ x: 3, y: 3 }]
    return g
  }

  it('passes when a blind player finds one', () => {
    expect(checkTeaching(grid(), 'traps', { blindDeaths: 2 })).toBeNull()
  })

  it('fails when the floor never gets a chance to lie', () => {
    expect(checkTeaching(grid(), 'traps', { blindDeaths: 0 }))
      .toMatch(/never once found a trap/)
  })
})

describe('unknown lessons', () => {
  it('throw rather than silently pass', () => {
    expect(() => checkTeaching(open(4, 4), 'sorcery')).toThrow(/unknown lesson/)
  })
})
