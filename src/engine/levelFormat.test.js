import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createGrid, createCell } from './maze'
import {
  encodeGrid,
  decodeGrid,
  visibleWalls,
  packLiar,
  unpackLiar,
  FORMAT_VERSION,
} from './levelFormat'

function gridWith(mutate) {
  const grid = createGrid(4, 4)
  mutate(grid)
  return grid
}

describe('round trip', () => {
  it('preserves walls, start, end and hidden word', () => {
    const grid = gridWith((g) => {
      g.cells[5].walls = { top: true, right: false, bottom: true, left: false }
      g.start = { x: 1, y: 2 }
      g.end = { x: 3, y: 0 }
      g.hiddenWord = 'SUFFER'
    })

    const back = decodeGrid(encodeGrid(grid))

    expect(back.cells[5].walls).toEqual({ top: true, right: false, bottom: true, left: false })
    expect(back.start).toEqual({ x: 1, y: 2 })
    expect(back.end).toEqual({ x: 3, y: 0 })
    expect(back.hiddenWord).toBe('SUFFER')
  })

  // These three are the obstacles the old format had no slot for. Each one
  // silently vanished on encode, which is why the deception layer never worked.
  it('preserves mimics', () => {
    const grid = gridWith((g) => { g.cells[6].mimic = true })
    expect(decodeGrid(encodeGrid(grid)).cells[6].mimic).toBe(true)
  })

  it('preserves memory wipe zones', () => {
    const grid = gridWith((g) => { g.cells[7].memoryWipe = true })
    expect(decodeGrid(encodeGrid(grid)).cells[7].memoryWipe).toBe(true)
  })

  it('preserves liar walls', () => {
    const grid = gridWith((g) => {
      g.cells[8].liarWalls = { top: false, right: true, bottom: true, left: false }
    })
    expect(decodeGrid(encodeGrid(grid)).cells[8].liarWalls).toEqual({
      top: false, right: true, bottom: true, left: false,
    })
  })

  it('preserves several obstacles stacked on one cell', () => {
    const grid = gridWith((g) => {
      const c = g.cells[9]
      c.walls = { top: true, right: true, bottom: false, left: false }
      c.trap = true
      c.mimic = true
      c.memoryWipe = true
      c.gate = { direction: 'right', open: true }
      c.liarWalls = { top: true, right: false, bottom: false, left: true }
    })

    const c = decodeGrid(encodeGrid(grid)).cells[9]
    expect(c.trap).toBe(true)
    expect(c.mimic).toBe(true)
    expect(c.memoryWipe).toBe(true)
    expect(c.gate).toEqual({ direction: 'right', open: true })
    expect(c.liarWalls).toEqual({ top: true, right: false, bottom: false, left: true })
  })

  it('stamps the format version', () => {
    expect(encodeGrid(createGrid(2, 2)).v).toBe(FORMAT_VERSION)
  })
})

describe('liar walls', () => {
  it('shows the opposite of reality on lying sides only', () => {
    const cell = createCell(0, 0)
    cell.walls = { top: true, right: true, bottom: false, left: false }
    cell.liarWalls = { top: true, right: false, bottom: true, left: false }

    // top lies: real wall -> shown open. bottom lies: real gap -> shown solid.
    expect(visibleWalls(cell)).toEqual({
      top: false, right: true, bottom: true, left: false,
    })
  })

  it('returns the real walls when the cell does not lie', () => {
    const cell = createCell(0, 0)
    cell.walls = { top: true, right: false, bottom: false, left: true }
    expect(visibleWalls(cell)).toBe(cell.walls)
  })

  it('packs and unpacks side masks', () => {
    const liar = { top: false, right: true, bottom: false, left: true }
    expect(unpackLiar(packLiar(liar))).toEqual(liar)
    expect(packLiar(null)).toBe(0)
    expect(unpackLiar(0)).toBeNull()
  })
})

describe('v1 compatibility', () => {
  it('decodes a v1 entry, since trap shared bit 1 with the new flags field', () => {
    const v1 = {
      c: 2, r: 2, s: [0, 0], e: [1, 1], w: '',
      d: [[0, 0, 15, null, 1, null], [1, 1, 3, 'fakeExit', 0, 'up']],
    }
    const grid = decodeGrid(v1)
    expect(grid.cells[0].trap).toBe(true)
    expect(grid.cells[0].walls).toEqual({ top: true, right: true, bottom: true, left: true })
    expect(grid.cells[3].modifier).toBe('fakeExit')
    expect(grid.cells[3].gate).toEqual({ direction: 'up', open: true })
  })

  it('salvages a v1 mimic out of the modifier slot it was stranded in', () => {
    const grid = decodeGrid({
      c: 2, r: 2, s: [0, 0], e: [1, 1], w: '',
      d: [[0, 1, 0, 'mimic', 0, null]],
    })
    expect(grid.cells[2].mimic).toBe(true)
    expect(grid.cells[2].modifier).toBeNull()
  })

  it('salvages a v1 liar wall, which was stored as an array in a string field', () => {
    const grid = decodeGrid({
      c: 2, r: 2, s: [0, 0], e: [1, 1], w: '',
      d: [[1, 0, 6, ['liar_wall', { right: false, bottom: false }], 0, null]],
    })
    const cell = grid.cells[1]
    expect(cell.liarWalls).toEqual({ top: false, right: true, bottom: true, left: false })
    expect(cell.modifier).toBeNull()
    // real walls are right+bottom, both lying, so both are shown as open
    expect(visibleWalls(cell)).toEqual({
      top: false, right: false, bottom: false, left: false,
    })
  })
})

describe('shipped level data', () => {
  const levels = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
  )

  it('is all format v2', () => {
    for (const level of levels) {
      expect(level.maze.v, level.name).toBe(FORMAT_VERSION)
    }
  })

  it('carries no obstacle stranded in the modifier slot', () => {
    for (const level of levels) {
      for (const entry of level.maze.d) {
        const modifier = entry[3]
        expect(Array.isArray(modifier), `${level.name} ${entry[0]},${entry[1]}`).toBe(false)
        expect(['mimic', 'memory_wipe', 'memoryWipe']).not.toContain(modifier)
      }
    }
  })

  it('decodes mimics and liar walls into the fields the game reads', () => {
    // The counts themselves belong to levelData.test.js. What matters here is
    // that they land on cell.mimic and cell.liarWalls at all — under the old
    // format they decoded into cell.modifier, where checkLethal and the
    // renderer never looked, and the entire deception layer did nothing.
    let mimics = 0
    let liars = 0
    for (const level of levels) {
      for (const cell of decodeGrid(level.maze).cells) {
        if (cell.mimic) mimics++
        if (cell.liarWalls) liars++
        expect(typeof cell.modifier === 'string' || cell.modifier === null).toBe(true)
      }
    }
    expect(mimics).toBeGreaterThan(0)
    expect(liars).toBeGreaterThan(0)
  })

  it('every level is decodable and has start and end in bounds', () => {
    for (const level of levels) {
      const g = decodeGrid(level.maze)
      expect(g.cells.length, level.name).toBe(g.cols * g.rows)
      expect(g.start.x).toBeGreaterThanOrEqual(0)
      expect(g.start.x).toBeLessThan(g.cols)
      expect(g.start.y).toBeLessThan(g.rows)
      expect(g.end.x).toBeLessThan(g.cols)
      expect(g.end.y).toBeLessThan(g.rows)
    }
  })
})
