import { describe, it, expect, vi } from 'vitest'
import { createGrid, setSurface, SAND, SNOW } from './grid.js'
import { createGame } from './game.js'
import { drawSurfaces, drawFog, drawMaze } from './render.js'
import { createCanvas } from '@napi-rs/canvas'

// Only actual maze walls should draw solid boundary lines.
describe('terrain readability', () => {
  it.each([SAND, SNOW])('textures surface %s without drawing false walls', (kind) => {
    const grid = createGrid(3, 3)
    setSurface(grid, 1, 1, kind)
    const ctx = { fillRect: vi.fn(), beginPath: vi.fn(), stroke: vi.fn() }
    drawSurfaces(ctx, grid, 40)
    expect(ctx.fillRect).toHaveBeenCalledWith(40, 40, 40, 40)
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(1)
    expect(ctx.stroke).not.toHaveBeenCalled()
    for (const [x, y, width, height] of ctx.fillRect.mock.calls.slice(1)) {
      expect(x).toBeGreaterThan(40)
      expect(y).toBeGreaterThan(40)
      expect(x + width).toBeLessThan(80)
      expect(y + height).toBeLessThan(80)
    }
  })

  it('leaves the complete maze visible in dev mode even on fog levels', () => {
    const grid = createGrid(8, 6)
    grid.fog = 2.4
    grid.memory = 2500
    const game = createGame(grid)
    game.dev = true
    const ctx = createCanvas(320, 240).getContext('2d')
    drawMaze(ctx, game, 40)
    const before = ctx.getImageData(0, 0, 320, 240).data
    drawFog(ctx, game, 40)
    expect(ctx.getImageData(0, 0, 320, 240).data).toEqual(before)
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(width, height) { return createCanvas(width, height) }
    })
    try {
      game.dev = false
      drawFog(ctx, game, 40)
      expect(ctx.getImageData(0, 0, 320, 240).data).not.toEqual(before)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
