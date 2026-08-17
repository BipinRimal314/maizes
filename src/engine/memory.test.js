import { describe, it, expect, beforeAll } from 'vitest'
import { createGrid, setWall, DIRECTIONS, key } from './grid.js'
import { createGame, stepGame, restartGame } from './game.js'
import { drawFog } from './render.js'

/**
 * Fading memory.
 *
 * It is the one mechanic that is purely presentational — it changes what the
 * canvas paints, not what the simulation permits — so what is worth testing is
 * that the record it draws from decays, and that the drawing honours it.
 */

function openGrid(cols, rows) {
  const grid = createGrid(cols, rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) setWall(grid, x, y, DIRECTIONS[1], false)
      if (y + 1 < rows) setWall(grid, x, y, DIRECTIONS[2], false)
    }
  }
  grid.fog = 3.5
  return grid
}

/**
 * `render.js` caches its offscreen fog canvas at module scope, so a stub has to
 * be reached through a mutable reference — handing it a fresh object per test
 * would only ever be seen by the first one.
 */
let activeCtx = null

beforeAll(() => {
  global.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return activeCtx }
  }
})

/** A canvas stub that records the alphas the fog compositor punches with. */
function recordingContext() {
  const fills = []
  let current = null
  const ctx = {
    canvas: null,
    globalCompositeOperation: 'source-over',
    set fillStyle(value) { current = value },
    get fillStyle() { return current },
    clearRect() {},
    fillRect(x, y, w, h) { fills.push({ x, y, w, h, style: current }) },
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {}, arc() {}, fill() {}, save() {}, restore() {}, drawImage() {},
  }
  activeCtx = ctx
  return { ctx, fills }
}

describe('the visited record', () => {
  it('remembers when each cell was last stood in', () => {
    const grid = openGrid(8, 8)
    const game = createGame(grid)

    game.input.right = true
    for (let i = 0; i < 120; i++) stepGame(game)

    expect(game.visited.size).toBeGreaterThan(1)
    for (const [id, at] of game.visited) {
      expect(typeof at, `${id} should carry a timestamp`).toBe('number')
      expect(at).toBeLessThanOrEqual(game.now)
    }
  })

  it('keeps the current cell fresh while you stand in it', () => {
    const grid = openGrid(8, 8)
    const game = createGame(grid)
    const start = key(grid.start.x, grid.start.y)

    for (let i = 0; i < 60; i++) stepGame(game)
    expect(game.visited.get(start)).toBeCloseTo(game.now, 5)
  })

  it('is emptied by a restart', () => {
    const grid = openGrid(8, 8)
    const game = createGame(grid)
    game.input.right = true
    for (let i = 0; i < 120; i++) stepGame(game)
    expect(game.visited.size).toBeGreaterThan(1)

    restartGame(game)
    expect(game.visited.size).toBe(1)
    expect(game.visited.get(key(grid.start.x, grid.start.y))).toBe(0)
  })
})

describe('the fog compositor', () => {
  it('punches every visited cell at full strength when memory is permanent', () => {
    const grid = openGrid(8, 8)
    grid.memory = null
    const game = createGame(grid)
    game.input.right = true
    for (let i = 0; i < 120; i++) stepGame(game)

    const { ctx, fills } = recordingContext()
    drawFog(ctx, game, 20)

    const cells = fills.filter((f) => f.w === 20 && f.h === 20)
    expect(cells.length).toBe(game.visited.size)
    // one alpha for all of them: nothing has faded
    expect(new Set(cells.map((c) => c.style)).size).toBe(1)
  })

  it('drops cells older than the memory span, and dims the rest by age', () => {
    const grid = openGrid(14, 14)
    grid.memory = 2000
    const game = createGame(grid)

    // down the first column, then along the bottom row: the column has gone
    // stale by the time the row is walked, and the row itself spans a range of
    // ages. Walking one straight line instead parks the ball against a wall and
    // leaves exactly one fresh cell, which proves nothing about the gradient.
    for (let i = 0; i < 300; i++) {
      game.input.down = i < 150
      game.input.right = i >= 150
      stepGame(game)
    }

    const { ctx, fills } = recordingContext()
    drawFog(ctx, game, 20)

    const cells = fills.filter((f) => f.w === 20 && f.h === 20)
    const stale = [...game.visited.values()].filter((at) => game.now - at >= grid.memory)

    expect(stale.length, 'the walk should have left stale cells behind').toBeGreaterThan(0)
    expect(cells.length, 'stale cells should not be painted').toBe(game.visited.size - stale.length)
    // survivors are at different ages, so they cannot all share one alpha
    expect(new Set(cells.map((c) => c.style)).size).toBeGreaterThan(1)
  })

  it('forgets a cell entirely once the span has passed', () => {
    const grid = openGrid(8, 8)
    grid.memory = 500
    const game = createGame(grid)
    for (let i = 0; i < 2; i++) stepGame(game)

    const { ctx, fills } = recordingContext()
    game.now = 10000            // long past the span, without moving
    drawFog(ctx, game, 20)

    expect(fills.filter((f) => f.w === 20 && f.h === 20).length).toBe(0)
  })

  it('does nothing at all on a level with no fog', () => {
    const grid = openGrid(8, 8)
    grid.fog = null
    const game = createGame(grid)
    const { ctx, fills } = recordingContext()
    drawFog(ctx, game, 20)
    expect(fills).toHaveLength(0)
  })
})

describe('memory never changes what is possible', () => {
  it('leaves the simulation identical with and without it', () => {
    // it is a rendering rule, not a rule of the game; two runs of the same
    // inputs must agree on position, deaths and captures regardless
    const run = (memory) => {
      const grid = openGrid(10, 10)
      grid.memory = memory
      grid.traps = [{ x: 3, y: 0 }]
      grid.flags = [{ x: 6, y: 6 }]
      const game = createGame(grid)
      for (let i = 0; i < 600; i++) {
        game.input.right = i % 60 < 30
        game.input.down = i % 60 >= 30
        stepGame(game)
      }
      return { x: game.ball.x, y: game.ball.y, deaths: game.deaths, captured: game.captured.size }
    }

    expect(run(2500)).toEqual(run(null))
  })
})
