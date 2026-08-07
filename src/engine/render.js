/**
 * Canvas rendering. The only module that thinks in pixels.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * `ballDrawMetrics` keeps the ball's ink inside its collision radius. The
 * physics clamps the centre to exactly one radius from a wall, so a rim stroked
 * *on* that radius puts half its width into the wall and the ball looks like it
 * is clipping through when the collision is exact to 1e-9. It is a function so a
 * test can assert the relationship instead of someone eyeballing a screenshot.
 *
 * Walls are drawn thin and without a downward shadow offset for the same
 * reason: ink that leans into the player's cell reads as penetration.
 */

import { TOP, RIGHT, BOTTOM, LEFT, wallsAt, key } from './grid.js'

const COLORS = {
  bg: '#fdf6e6',
  grid: '#efe6cf',
  wall: '#33302a',
  start: '#0d656e',
  exit: '#1b8f5a',
  exitLocked: '#b3ad9c',
  flag: '#c2185b',
  flagTaken: '#ded6c2',
  ball: '#fdd835',
  ballRim: '#ffffff',
  ballShine: 'rgba(255,255,255,0.5)',
  trapFlash: '#e53935',
  captureFlash: '#c2185b',
  fog: '48, 45, 38',
}

const WALL_WIDTH = 0.07
const MARKER_INSET = 0.14
const MEMORY_ALPHA = 0.76

/** Ink geometry for the ball. `outerEdge` must never exceed the collision radius. */
function ballDrawMetrics(radius, cellSize) {
  const r = radius * cellSize
  const rimWidth = Math.max(1.25, cellSize * 0.06)
  const rimRadius = Math.max(r * 0.4, r - rimWidth / 2)
  return { fillRadius: r, rimRadius, rimWidth, outerEdge: rimRadius + rimWidth / 2 }
}

function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const w = Math.round(cssWidth * dpr)
  const h = Math.round(cssHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function marker(ctx, x, y, cellSize, color) {
  const inset = cellSize * MARKER_INSET
  ctx.fillStyle = color
  roundRect(ctx, x * cellSize + inset, y * cellSize + inset,
    cellSize - inset * 2, cellSize - inset * 2, cellSize * 0.2)
  ctx.fill()
}

function drawFlagIcon(ctx, x, y, cellSize, color) {
  const px = x * cellSize + cellSize * 0.38
  const py = y * cellSize + cellSize * 0.26
  const pole = Math.max(1.5, cellSize * 0.055)
  ctx.fillStyle = color
  ctx.fillRect(px, py, pole, cellSize * 0.48)
  ctx.beginPath()
  ctx.moveTo(px + pole, py)
  ctx.lineTo(px + cellSize * 0.3, py + cellSize * 0.11)
  ctx.lineTo(px + pole, py + cellSize * 0.22)
  ctx.closePath()
  ctx.fill()
}

function drawMaze(ctx, game, cellSize) {
  const { grid } = game
  const width = grid.cols * cellSize
  const height = grid.rows * cellSize

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (let x = 0; x <= grid.cols; x++) { ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, height) }
  for (let y = 0; y <= grid.rows; y++) { ctx.moveTo(0, y * cellSize); ctx.lineTo(width, y * cellSize) }
  ctx.stroke()

  // start
  marker(ctx, grid.start.x, grid.start.y, cellSize, COLORS.start)
  ctx.fillStyle = '#fff'
  const sx = grid.start.x * cellSize + cellSize * 0.42
  const sy = grid.start.y * cellSize + cellSize * 0.32
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + cellSize * 0.26, sy + cellSize * 0.18)
  ctx.lineTo(sx, sy + cellSize * 0.36)
  ctx.closePath()
  ctx.fill()

  // exit — visibly locked until every flag is captured, so the player is never
  // wondering whether they have missed something
  marker(ctx, grid.end.x, grid.end.y, cellSize, game.exitOpen ? COLORS.exit : COLORS.exitLocked)
  ctx.fillStyle = game.exitOpen ? '#fff' : 'rgba(255,255,255,0.75)'
  ctx.font = `600 ${cellSize * 0.42}px 'Plus Jakarta Sans', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(game.exitOpen ? '\u{2691}' : '\u{1F512}',
    (grid.end.x + 0.5) * cellSize, (grid.end.y + 0.55) * cellSize)

  // flags
  for (const flag of grid.flags) {
    const taken = game.captured.has(key(flag.x, flag.y))
    marker(ctx, flag.x, flag.y, cellSize, taken ? COLORS.flagTaken : COLORS.flag)
    if (taken) {
      ctx.fillStyle = '#b0a892'
      ctx.font = `600 ${cellSize * 0.4}px 'Plus Jakarta Sans', sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u{2713}', (flag.x + 0.5) * cellSize, (flag.y + 0.5) * cellSize)
    } else {
      drawFlagIcon(ctx, flag.x, flag.y, cellSize, '#fff')
    }
  }

  // walls
  ctx.strokeStyle = COLORS.wall
  ctx.lineWidth = Math.max(2, cellSize * WALL_WIDTH)
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const w = wallsAt(grid, x, y)
      const px = x * cellSize
      const py = y * cellSize
      if (w & TOP) { ctx.moveTo(px, py); ctx.lineTo(px + cellSize, py) }
      if (w & LEFT) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellSize) }
      if (w & RIGHT) { ctx.moveTo(px + cellSize, py); ctx.lineTo(px + cellSize, py + cellSize) }
      if (w & BOTTOM) { ctx.moveTo(px, py + cellSize); ctx.lineTo(px + cellSize, py + cellSize) }
    }
  }
  ctx.stroke()
}

function drawBall(ctx, ball, cellSize) {
  const x = ball.x * cellSize
  const y = ball.y * cellSize
  const { fillRadius, rimRadius, rimWidth } = ballDrawMetrics(ball.radius, cellSize)

  ctx.save()
  ctx.shadowColor = 'rgba(45,51,74,0.2)'
  ctx.shadowBlur = cellSize * 0.3
  ctx.shadowOffsetY = cellSize * 0.06
  ctx.fillStyle = COLORS.ball
  ctx.beginPath()
  ctx.arc(x, y, fillRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = COLORS.ballRim
  ctx.lineWidth = rimWidth
  ctx.beginPath()
  ctx.arc(x, y, rimRadius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = COLORS.ballShine
  ctx.beginPath()
  ctx.arc(x - fillRadius * 0.28, y - fillRadius * 0.28, fillRadius * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

let fogCanvas = null

function getFogCanvas(width, height) {
  if (!fogCanvas) {
    fogCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas')
  }
  if (fogCanvas.width !== width || fogCanvas.height !== height) {
    fogCanvas.width = width
    fogCanvas.height = height
  }
  return fogCanvas
}

/**
 * Fog as a composited mask: a dark sheet, holes punched where the player has
 * been, and a soft radial hole around them. Filling one opaque rectangle per
 * cell gives the lit area a hard stair-stepped border and makes a remembered
 * cell hard to tell from a lit one.
 */
function drawFog(ctx, game, cellSize) {
  const { grid, ball } = game
  if (grid.fog === null) return

  const width = grid.cols * cellSize
  const height = grid.rows * cellSize
  const canvas = getFogCanvas(width, height)
  const fctx = canvas.getContext('2d')

  fctx.clearRect(0, 0, width, height)
  fctx.fillStyle = `rgba(${COLORS.fog}, 1)`
  fctx.fillRect(0, 0, width, height)

  fctx.globalCompositeOperation = 'destination-out'
  fctx.fillStyle = `rgba(0,0,0,${1 - MEMORY_ALPHA})`
  for (const id of game.visited) {
    const comma = id.indexOf(',')
    const x = +id.slice(0, comma)
    const y = +id.slice(comma + 1)
    fctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
  }

  const bx = ball.x * cellSize
  const by = ball.y * cellSize
  const radius = grid.fog * cellSize
  const gradient = fctx.createRadialGradient(bx, by, 0, bx, by, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.62, 'rgba(0,0,0,1)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  fctx.fillStyle = gradient
  fctx.beginPath()
  fctx.arc(bx, by, radius, 0, Math.PI * 2)
  fctx.fill()
  fctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(canvas, 0, 0)
}

function drawFlash(ctx, game, cellSize) {
  const flash = game.flash
  if (!flash || game.now >= flash.until) return

  const remaining = (flash.until - game.now) / 450
  const alpha = Math.max(0, Math.min(1, remaining))
  const inset = cellSize * MARKER_INSET

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = flash.kind === 'trap' ? COLORS.trapFlash : COLORS.captureFlash
  roundRect(ctx, flash.x * cellSize + inset, flash.y * cellSize + inset,
    cellSize - inset * 2, cellSize - inset * 2, cellSize * 0.2)
  ctx.fill()
  ctx.restore()
}

/** One frame. Order matters: fog goes over the maze, flashes over the fog. */
function drawScene(ctx, game, cellSize) {
  drawMaze(ctx, game, cellSize)
  drawBall(ctx, game.ball, cellSize)
  drawFog(ctx, game, cellSize)
  drawFlash(ctx, game, cellSize)
}

export { COLORS, WALL_WIDTH, setupCanvas, ballDrawMetrics, drawScene, drawMaze, drawBall, drawFog }
