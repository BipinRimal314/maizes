import { describe, it, expect } from 'vitest'
import { createGrid, setWall, DIRECTIONS } from './grid.js'
import { createGame } from './game.js'
import { drawDevOverlay, drawScene, COLORS } from './render.js'

/**
 * The dev overlay draws the two things the game hides on purpose: the traps,
 * which are invisible by design, and the maize, which is usually under fog.
 * The check that matters is the gate — an overlay that leaks into a normal
 * build does not make the game easier, it makes it pointless.
 */

function openGrid(cols, rows) {
  const grid = createGrid(cols, rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x + 1 < cols) setWall(grid, x, y, DIRECTIONS[1], false)
      if (y + 1 < rows) setWall(grid, x, y, DIRECTIONS[2], false)
    }
  }
  return grid
}

/** Records every fill with the style that was live when it happened. */
function stubContext() {
  const fills = []
  const ctx = {
    canvas: null, fillStyle: null, strokeStyle: null, globalAlpha: 1,
    lineWidth: 0, lineCap: '', lineJoin: '', font: '', textAlign: '', textBaseline: '',
    shadowColor: null, shadowBlur: 0, shadowOffsetY: 0,
    fillRect: (x, y, w, h) => fills.push({ style: ctx.fillStyle, x, y, w, h }),
    fill: () => fills.push({ style: ctx.fillStyle }),
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, quadraticCurveTo() {}, ellipse() {}, stroke() {}, clip() {},
    clearRect() {}, fillText() {}, drawImage() {}, rotate() {}, translate() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  return { ctx, fills }
}

const washes = (fills) => fills.filter((f) => f.style === COLORS.trapWash)

function boardWithTraps() {
  const grid = openGrid(6, 4)
  grid.traps = [{ x: 2, y: 1 }, { x: 4, y: 2 }]
  grid.flags = [{ x: 1, y: 3 }, { x: 5, y: 0 }]
  return createGame(grid)
}

describe('dev overlay', () => {
  it('draws nothing at all unless dev mode is on', () => {
    const game = boardWithTraps()
    expect(game.dev).toBe(false)
    const { ctx, fills } = stubContext()
    drawDevOverlay(ctx, game, 30)
    expect(fills).toHaveLength(0)
  })

  it('marks every trap cell once dev mode is on', () => {
    const game = boardWithTraps()
    game.dev = true
    const { ctx, fills } = stubContext()
    drawDevOverlay(ctx, game, 30)

    expect(washes(fills)).toHaveLength(2)
    expect(washes(fills).map((f) => [f.x, f.y])).toEqual([[60, 30], [120, 60]])
  })

  it('shows the maize still to get and not the ones already taken', () => {
    const game = boardWithTraps()
    game.dev = true

    const { ctx: before, fills: both } = stubContext()
    drawDevOverlay(before, game, 30)

    game.captured.add('1,3')
    const { ctx: after, fills: one } = stubContext()
    drawDevOverlay(after, game, 30)

    const maizeFills = (f) => f.filter((x) => x.style === COLORS.maize).length
    expect(maizeFills(both)).toBeGreaterThan(0)
    expect(maizeFills(one)).toBeLessThan(maizeFills(both))
  })

  it('is wired into the scene, not just exported', () => {
    const game = boardWithTraps()
    const { ctx: dark, fills: off } = stubContext()
    drawScene(dark, game, 30)
    expect(washes(off)).toHaveLength(0)

    game.dev = true
    const { ctx: lit, fills: on } = stubContext()
    drawScene(lit, game, 30)
    expect(washes(on)).toHaveLength(2)
  })
})
