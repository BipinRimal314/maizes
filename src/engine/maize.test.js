import { describe, it, expect, afterEach } from 'vitest'
import { createGrid, setWall, DIRECTIONS } from './grid.js'
import { createGame } from './game.js'
import {
  MAIZE_SCALE, drawMaizeIcon, drawMaze, maizeReady, setMaizeImage,
} from './render.js'

/**
 * The maize sprite.
 *
 * A headless canvas reaches neither branch of `drawMaizeIcon` on its own — the
 * image never decodes, so the painted path is never taken, and nothing fails
 * loudly if it breaks. `setMaizeImage` is the seam that lets both be driven.
 */

function recordingContext() {
  const calls = { drawImage: [], ellipse: [], fillText: [], fillRect: [] }
  const ctx = {
    canvas: null,
    fillStyle: null, strokeStyle: null, lineWidth: 0, font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1, lineCap: '', lineJoin: '',
    drawImage: (...a) => calls.drawImage.push(a),
    ellipse: (...a) => calls.ellipse.push(a),
    fillText: (...a) => calls.fillText.push(a),
    fillRect: (...a) => calls.fillRect.push(a),
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    arcTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, clip() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    clearRect() {}, setTransform() {},
  }
  return { ctx, calls }
}

const decoded = { complete: true, naturalWidth: 512, naturalHeight: 512 }
const decoding = { complete: false, naturalWidth: 0, naturalHeight: 0 }

afterEach(() => { setMaizeImage(null) })

describe('when the sprite has decoded', () => {
  it('paints it, centred in the cell', () => {
    setMaizeImage(decoded)
    expect(maizeReady()).toBe(true)

    const { ctx, calls } = recordingContext()
    const cell = 40
    drawMaizeIcon(ctx, 3, 5, cell)

    expect(calls.drawImage).toHaveLength(1)
    const [image, px, py, w, h] = calls.drawImage[0]
    expect(image).toBe(decoded)
    expect(w).toBeCloseTo(cell * MAIZE_SCALE, 6)
    expect(h).toBeCloseTo(cell * MAIZE_SCALE, 6)
    // centre of the drawn box lands on the centre of cell (3, 5)
    expect(px + w / 2).toBeCloseTo(3.5 * cell, 6)
    expect(py + h / 2).toBeCloseTo(5.5 * cell, 6)
  })

  it('stays inside its cell, so it cannot bleed over a wall', () => {
    setMaizeImage(decoded)
    const { ctx, calls } = recordingContext()
    const cell = 40
    drawMaizeIcon(ctx, 0, 0, cell)

    const [, px, py, w, h] = calls.drawImage[0]
    expect(px).toBeGreaterThanOrEqual(0)
    expect(py).toBeGreaterThanOrEqual(0)
    expect(px + w).toBeLessThanOrEqual(cell)
    expect(py + h).toBeLessThanOrEqual(cell)
  })

  it('draws no fallback cob as well', () => {
    setMaizeImage(decoded)
    const { ctx, calls } = recordingContext()
    drawMaizeIcon(ctx, 1, 1, 40)
    expect(calls.ellipse).toHaveLength(0)
  })
})

describe('while the sprite is still decoding', () => {
  it('is not considered ready', () => {
    setMaizeImage(decoding)
    expect(maizeReady()).toBe(false)
  })

  it('draws a fallback cob rather than nothing', () => {
    // an empty cell reads as "nothing here", which is a lie about a cell the
    // player has to reach
    setMaizeImage(decoding)
    const { ctx, calls } = recordingContext()
    drawMaizeIcon(ctx, 2, 2, 40)

    expect(calls.drawImage).toHaveLength(0)
    expect(calls.ellipse.length).toBeGreaterThan(0)
  })

  it('never calls drawImage with an undecoded image', () => {
    // drawImage on an incomplete image throws in some browsers and paints
    // nothing in others; the board draws from the frame the level mounts
    for (const image of [decoding, null, { complete: true, naturalWidth: 0 }]) {
      setMaizeImage(image)
      const { ctx, calls } = recordingContext()
      drawMaizeIcon(ctx, 0, 0, 40)
      expect(calls.drawImage, JSON.stringify(image)).toHaveLength(0)
    }
  })
})

describe('on the board', () => {
  function boardWithMaize() {
    const grid = createGrid(6, 6)
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if (x + 1 < 6) setWall(grid, x, y, DIRECTIONS[1], false)
        if (y + 1 < 6) setWall(grid, x, y, DIRECTIONS[2], false)
      }
    }
    grid.flags = [{ x: 2, y: 2 }, { x: 4, y: 4 }]
    return grid
  }

  it('paints one sprite per uncollected ear', () => {
    setMaizeImage(decoded)
    const game = createGame(boardWithMaize())
    const { ctx, calls } = recordingContext()
    drawMaze(ctx, game, 40)
    expect(calls.drawImage).toHaveLength(2)
  })

  it('replaces a picked ear with a tick instead of a sprite', () => {
    setMaizeImage(decoded)
    const game = createGame(boardWithMaize())
    game.captured.add('2,2')

    const { ctx, calls } = recordingContext()
    drawMaze(ctx, game, 40)

    expect(calls.drawImage).toHaveLength(1)
    expect(calls.fillText.some(([text]) => text === '\u{2713}')).toBe(true)
  })
})
