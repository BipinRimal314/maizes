/**
 * Canvas rendering. The only module that thinks in pixels.
 *
 * The important structural change is `drawExitMarker`. The real exit, a false
 * exit and a mimic are drawn by one function with one set of coordinates, so
 * they are indistinguishable *by construction*. Previously each was drawn by
 * its own copy-pasted block and the mimic branch had drifted — it never
 * matched, and since the loader never set `cell.mimic` anyway the tile actually
 * rendered as a grey question mark. The whole point of a mimic is that you
 * cannot tell, so the three can no longer be given separate code paths.
 */

import { visibleWalls } from './levelFormat'

const COLORS = {
  bg: '#fef6e4',
  wall: '#322f23',
  wallShadow: 'rgba(50, 47, 35, 0.16)',
  grid: '#eae2cc',
  start: '#0d656e',
  exit: '#993862',
  ball: '#fed701',
  ballRim: '#ffffff',
  ballShine: 'rgba(255, 255, 255, 0.45)',
  collected: '#e5dcc6',
  collectedMark: '#b3ad9c',
  gate: 'rgba(13, 101, 110, 0.55)',
  memoryWipe: 'rgba(184, 169, 212, 0.18)',
  trapFlash: '#f74b6d',
  stalker: '50, 47, 35',
  stalkerEye: '247, 75, 109',
}

/** Sizes as a fraction of one cell, so everything scales together. */
const WALL_WIDTH = 0.07
const WALL_SHADOW_OFFSET = 0.02
const MARKER_INSET = 0.1
const MARKER_RADIUS = 0.17

/**
 * Where the ball's ink actually lands.
 *
 * The physics clamps the ball's centre to exactly one radius from a wall, so
 * any ink drawn beyond that radius reads as the ball sinking into the wall even
 * though the collision is exact. The rim used to be stroked *on* the circle,
 * which put half its width outside the collision radius; combined with the
 * wall stroke sitting astride the boundary and a shadow offset downward into
 * the cell, the ball visibly overlapped walls it was merely touching.
 *
 * `outerEdge` must never exceed the collision radius. `ballDrawMetrics` exists
 * so that relationship can be asserted in a test rather than eyeballed.
 */
function ballDrawMetrics(radius, cellSize) {
  const r = radius * cellSize
  const rimWidth = Math.max(1.5, cellSize * 0.07)
  // stroke centred on a path inset by half the rim, so the rim's outer edge
  // lands exactly on the collision radius
  const rimRadius = Math.max(r * 0.35, r - rimWidth / 2)
  return {
    fillRadius: r,
    rimRadius,
    rimWidth,
    outerEdge: rimRadius + rimWidth / 2,
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Size a canvas for the device pixel ratio and return the scaled context.
 * Without this the whole game is soft on every retina display.
 */
function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const pixelWidth = Math.round(cssWidth * dpr)
  const pixelHeight = Math.round(cssHeight * dpr)

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/**
 * The one true way to draw an exit-shaped tile. Real exit, false exit and
 * mimic all come through here. Do not add a `kind` parameter that changes the
 * pixels — that is the bug this function exists to prevent.
 */
function drawExitMarker(ctx, cellX, cellY, cellSize) {
  const inset = cellSize * MARKER_INSET
  const size = cellSize - inset * 2
  const x = cellX * cellSize + inset
  const y = cellY * cellSize + inset

  ctx.fillStyle = COLORS.exit
  roundRect(ctx, x, y, size, size, cellSize * MARKER_RADIUS)
  ctx.fill()

  // flag
  ctx.fillStyle = '#ffffff'
  const fx = cellX * cellSize + cellSize * 0.35
  const fy = cellY * cellSize + cellSize * 0.25
  const poleWidth = Math.max(1.5, cellSize * 0.06)
  ctx.fillRect(fx, fy, poleWidth, cellSize * 0.5)
  ctx.beginPath()
  ctx.moveTo(fx + poleWidth, fy)
  ctx.lineTo(fx + cellSize * 0.34, fy + cellSize * 0.12)
  ctx.lineTo(fx + poleWidth, fy + cellSize * 0.25)
  ctx.closePath()
  ctx.fill()
}

function drawStartMarker(ctx, cellX, cellY, cellSize) {
  const inset = cellSize * MARKER_INSET
  const size = cellSize - inset * 2
  ctx.fillStyle = COLORS.start
  roundRect(ctx, cellX * cellSize + inset, cellY * cellSize + inset, size, size, cellSize * MARKER_RADIUS)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  const sx = cellX * cellSize + cellSize * 0.4
  const sy = cellY * cellSize + cellSize * 0.3
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + cellSize * 0.3, sy + cellSize * 0.2)
  ctx.lineTo(sx, sy + cellSize * 0.4)
  ctx.closePath()
  ctx.fill()
}

function drawCollectedMarker(ctx, cellX, cellY, cellSize) {
  const inset = cellSize * MARKER_INSET
  const size = cellSize - inset * 2
  ctx.fillStyle = COLORS.collected
  roundRect(ctx, cellX * cellSize + inset, cellY * cellSize + inset, size, size, cellSize * MARKER_RADIUS)
  ctx.fill()

  ctx.font = `600 ${cellSize * 0.4}px 'Plus Jakarta Sans', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.collectedMark
  ctx.fillText('\u{2713}', (cellX + 0.5) * cellSize, (cellY + 0.5) * cellSize)
}

function drawGateArrow(ctx, cell, cellSize) {
  const cx = (cell.x + 0.5) * cellSize
  const cy = (cell.y + 0.5) * cellSize
  const s = cellSize * 0.2
  ctx.fillStyle = COLORS.gate
  ctx.beginPath()
  switch (cell.gate.direction) {
    case 'right': ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx - s, cy + s); break
    case 'left': ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy); ctx.lineTo(cx + s, cy + s); break
    case 'down': ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx, cy + s); ctx.lineTo(cx + s, cy - s); break
    case 'up': ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s, cy + s); break
    default: break
  }
  ctx.closePath()
  ctx.fill()
}

function drawWalls(ctx, grid, cellSize) {
  const width = cellSize * WALL_WIDTH
  ctx.lineWidth = Math.max(2, width)
  ctx.lineCap = 'round'

  // Two passes: a soft dropped copy, then the solid wall on top. Reads as
  // chunky and hand-drawn rather than as hairlines.
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? COLORS.wallShadow : COLORS.wall
    const dy = pass === 0 ? Math.max(1, cellSize * WALL_SHADOW_OFFSET) : 0

    for (const cell of grid.cells) {
      // liar walls invert the visual on the sides that lie
      const walls = visibleWalls(cell)
      const x = cell.x * cellSize
      const y = cell.y * cellSize + dy

      if (walls.top) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); ctx.stroke()
      }
      if (walls.right) {
        ctx.beginPath(); ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke()
      }
      if (walls.bottom) {
        ctx.beginPath(); ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); ctx.stroke()
      }
      if (walls.left) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); ctx.stroke()
      }
    }
  }
}

function drawMaze(ctx, grid, cellSize, options = {}) {
  const { collectedFakeExits = new Set(), showGrid = true } = options
  const width = grid.cols * cellSize
  const height = grid.rows * cellSize

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, width, height)

  if (showGrid) {
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = 0; x <= grid.cols; x++) {
      ctx.moveTo(x * cellSize, 0)
      ctx.lineTo(x * cellSize, height)
    }
    for (let y = 0; y <= grid.rows; y++) {
      ctx.moveTo(0, y * cellSize)
      ctx.lineTo(width, y * cellSize)
    }
    ctx.stroke()
  }

  // memory-wipe zones sit under everything as a faint shimmer
  for (const cell of grid.cells) {
    if (!cell.memoryWipe) continue
    ctx.fillStyle = COLORS.memoryWipe
    roundRect(ctx, cell.x * cellSize + 1, cell.y * cellSize + 1, cellSize - 2, cellSize - 2, cellSize * 0.13)
    ctx.fill()
  }

  drawStartMarker(ctx, grid.start.x, grid.start.y, cellSize)
  drawExitMarker(ctx, grid.end.x, grid.end.y, cellSize)

  // Every tile that claims to be an exit, drawn by the same function as the
  // real one. A collected false exit is the only one that may look different,
  // because at that point the player has already learned what it is.
  for (const cell of grid.cells) {
    if (cell.mimic) {
      drawExitMarker(ctx, cell.x, cell.y, cellSize)
    } else if (cell.modifier === 'fakeExit') {
      if (collectedFakeExits.has(`${cell.x},${cell.y}`)) {
        drawCollectedMarker(ctx, cell.x, cell.y, cellSize)
      } else {
        drawExitMarker(ctx, cell.x, cell.y, cellSize)
      }
    }
  }

  for (const cell of grid.cells) {
    if (cell.gate) drawGateArrow(ctx, cell, cellSize)
  }

  drawWalls(ctx, grid, cellSize)
}

function drawBall(ctx, ball, cellSize) {
  const x = ball.x * cellSize
  const y = ball.y * cellSize
  const { fillRadius, rimRadius, rimWidth } = ballDrawMetrics(ball.radius, cellSize)

  ctx.save()
  ctx.shadowColor = 'rgba(45, 51, 74, 0.18)'
  ctx.shadowBlur = cellSize * 0.35
  ctx.shadowOffsetY = cellSize * 0.08
  ctx.fillStyle = COLORS.ball
  ctx.beginPath()
  ctx.arc(x, y, fillRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // rim inset so its outer edge is the collision radius, not beyond it
  ctx.strokeStyle = COLORS.ballRim
  ctx.lineWidth = rimWidth
  ctx.beginPath()
  ctx.arc(x, y, rimRadius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = COLORS.ballShine
  ctx.beginPath()
  ctx.arc(x - fillRadius * 0.25, y - fillRadius * 0.25, fillRadius * 0.34, 0, Math.PI * 2)
  ctx.fill()
}

function drawStalker(ctx, stalker, cellSize, now) {
  if (!stalker.enabled || !stalker.active || stalker.x === null) return

  const x = stalker.x * cellSize
  const y = stalker.y * cellSize
  const radius = cellSize * 0.4
  const pulse = 0.6 + Math.sin(now / 300) * 0.2

  const trailStart = Math.max(0, stalker.index - 8)
  for (let i = trailStart; i < stalker.index; i++) {
    const pos = stalker.path[i]
    if (!pos) continue
    const alpha = 0.05 + ((i - trailStart) / 8) * 0.15
    ctx.fillStyle = `rgba(${COLORS.stalker}, ${alpha})`
    ctx.beginPath()
    ctx.arc(pos.x * cellSize, pos.y * cellSize, radius * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.shadowColor = 'rgba(153, 56, 98, 0.5)'
  ctx.shadowBlur = cellSize * 0.5
  ctx.fillStyle = `rgba(${COLORS.stalker}, ${pulse})`
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = `rgba(${COLORS.stalkerEye}, ${pulse})`
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(x + side * radius * 0.25, y - radius * 0.1, radius * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawTrapFlash(ctx, flash, cellSize) {
  const inset = cellSize * MARKER_INSET
  ctx.fillStyle = COLORS.trapFlash
  roundRect(
    ctx,
    flash.x * cellSize + inset, flash.y * cellSize + inset,
    cellSize - inset * 2, cellSize - inset * 2,
    cellSize * MARKER_RADIUS
  )
  ctx.fill()
}

export {
  COLORS,
  WALL_WIDTH,
  WALL_SHADOW_OFFSET,
  ballDrawMetrics,
  setupCanvas,
  drawMaze,
  drawBall,
  drawStalker,
  drawTrapFlash,
  drawExitMarker,
  drawStartMarker,
  roundRect,
}
