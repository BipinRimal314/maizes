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
import { wakeProgress } from './hunter.js'

const COLORS = {
  bg: '#fdf6e6',
  grid: '#efe6cf',
  wall: '#33302a',
  start: '#0d656e',
  exit: '#1b8f5a',
  exitLocked: '#b3ad9c',
  flag: '#f6e7c8',          // a pale patch, so the outlined ear reads on top of it
  flagTaken: '#ded6c2',
  maize: '#f5a623',
  maizeKernel: '#1f1a14',
  maizeHusk: '#57a93f',
  maizeOutline: '#1f1a14',
  ball: '#fdd835',
  ballRim: '#ffffff',
  ballShine: 'rgba(255,255,255,0.5)',
  trapFlash: '#e53935',
  captureFlash: '#f2b01e',
  fog: '48, 45, 38',
  hunter: '#5b2333',
  hunterEye: '#fdf6e6',
  hunterAura: '229, 57, 53',
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

/**
 * A single ear of maize: one cob tilted up and to the right, two husk leaves,
 * a dark outline, and a crosshatch for the kernels.
 *
 * Drawn rather than set as an emoji so it scales with the cell and keeps the
 * same weight as the rest of the board — the emoji renders at a different size
 * and colour on every platform, which on a 10px cell reads as a smudge.
 *
 * Everything is described in a unit box and then scaled, so the whole icon is
 * one number away from being resized and the proportions cannot drift apart.
 * The crosshatch and the outline both drop out on small cells, where they stop
 * being detail and start being mud.
 */
function drawMaizeIcon(ctx, x, y, cellSize) {
  const s = cellSize
  const fine = s >= 20        // enough room for kernels and an outline
  const line = Math.max(1, s * 0.035)

  ctx.save()
  ctx.translate((x + 0.5) * s, (y + 0.5) * s)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = COLORS.maizeOutline
  ctx.lineWidth = line

  // --- husk leaves, drawn first so the cob sits on top of them
  const leaf = (toX, toY, bendX, bendY) => {
    ctx.beginPath()
    ctx.moveTo(0.02 * s, 0.30 * s)
    ctx.quadraticCurveTo(bendX * s, bendY * s, toX * s, toY * s)
    ctx.quadraticCurveTo((bendX + toX * 0.28) * s, (bendY + toY * 0.42) * s, 0.02 * s, 0.30 * s)
    ctx.closePath()
    ctx.fillStyle = COLORS.maizeHusk
    ctx.fill()
    if (fine) ctx.stroke()
  }
  leaf(-0.30, -0.26, -0.34, 0.10)     // the tall one, sweeping up the left
  leaf(0.34, 0.20, 0.14, 0.34)        // the low one, sweeping down the right

  // --- cob
  ctx.save()
  ctx.rotate(0.42)
  ctx.beginPath()
  ctx.ellipse(0, -0.04 * s, 0.145 * s, 0.30 * s, 0, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.maize
  ctx.fill()

  if (fine) {
    // kernels as a diamond crosshatch, clipped to the cob so the lines cannot
    // spill past its edge the way a plain grid would
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = COLORS.maizeKernel
    ctx.lineWidth = Math.max(0.8, s * 0.028)
    ctx.beginPath()
    for (let i = -4; i <= 4; i++) {
      const o = i * 0.115 * s
      ctx.moveTo(o - 0.4 * s, -0.4 * s); ctx.lineTo(o + 0.4 * s, 0.4 * s)
      ctx.moveTo(o - 0.4 * s, 0.4 * s); ctx.lineTo(o + 0.4 * s, -0.4 * s)
    }
    ctx.stroke()
    ctx.restore()

    ctx.strokeStyle = COLORS.maizeOutline
    ctx.lineWidth = line
    ctx.stroke()
  }
  ctx.restore()

  // --- stem
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(0.02 * s, 0.30 * s)
    ctx.lineTo(-0.02 * s, 0.38 * s)
    ctx.stroke()
  }

  ctx.restore()
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
      drawMaizeIcon(ctx, flag.x, flag.y, cellSize)
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

/**
 * The hunter, drawn as a ghost with eyes that track the ball.
 *
 * The eyes are not decoration. The hunter always walks the shortest path to
 * you, so where it is looking is exactly where it is about to go, and a player
 * who reads that can get around it. Making the pursuit legible is what keeps
 * this from being the mechanic that just kills you from off screen.
 */
function drawHunter(ctx, game, cellSize) {
  const hunter = game.hunter
  if (!hunter || !hunter.active) return

  const x = hunter.x * cellSize
  const y = hunter.y * cellSize
  const r = hunter.radius * cellSize

  // a soft aura, so it reads through fog at the edge of the lit circle
  const aura = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4)
  aura.addColorStop(0, `rgba(${COLORS.hunterAura}, 0.34)`)
  aura.addColorStop(1, `rgba(${COLORS.hunterAura}, 0)`)
  ctx.fillStyle = aura
  ctx.beginPath()
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2)
  ctx.fill()

  // body: domed head, four-lobed skirt
  const skirt = 4
  ctx.fillStyle = COLORS.hunter
  ctx.beginPath()
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0)
  ctx.lineTo(x + r, y + r * 0.62)
  for (let i = 0; i < skirt; i++) {
    const from = x + r - (i * 2 * r) / skirt
    const to = x + r - ((i + 1) * 2 * r) / skirt
    ctx.quadraticCurveTo((from + to) / 2, y + r * (i % 2 === 0 ? 1.05 : 0.2), to, y + r * 0.62)
  }
  ctx.closePath()
  ctx.fill()

  // eyes, aimed at the ball
  const dx = game.ball.x - hunter.x
  const dy = game.ball.y - hunter.y
  const distance = Math.max(Math.hypot(dx, dy), 1e-6)
  const gaze = Math.min(distance, 1) / 1
  const px = (dx / distance) * r * 0.22 * gaze
  const py = (dy / distance) * r * 0.22 * gaze

  for (const side of [-1, 1]) {
    const ex = x + side * r * 0.36
    const ey = y - r * 0.18
    ctx.fillStyle = COLORS.hunterEye
    ctx.beginPath()
    ctx.ellipse(ex, ey, r * 0.3, r * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.hunter
    ctx.beginPath()
    ctx.arc(ex + px, ey + py, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * The tell before the hunter wakes: the board's edge reddens over the last few
 * seconds. A chaser that simply appears is a gotcha; one that announces itself
 * is a deadline, which is the mechanic we actually wanted.
 */
function drawWakeWarning(ctx, game, cellSize) {
  const hunter = game.hunter
  if (!hunter || hunter.active) return

  const progress = wakeProgress(hunter, game.now)
  if (progress <= 0) return

  const width = game.grid.cols * cellSize
  const height = game.grid.rows * cellSize
  const pulse = 0.55 + 0.45 * Math.sin((game.now / 1000) * Math.PI * 4)
  const depth = Math.min(width, height) * 0.22

  ctx.save()
  ctx.globalAlpha = progress * pulse * 0.7
  for (const [x0, y0, x1, y1] of [
    [0, 0, depth, 0], [width, 0, width - depth, 0],
    [0, 0, 0, depth], [0, height, 0, height - depth],
  ]) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    gradient.addColorStop(0, `rgba(${COLORS.hunterAura}, 0.85)`)
    gradient.addColorStop(1, `rgba(${COLORS.hunterAura}, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
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
 *
 * On `memory` levels the punched holes close again with age, so the trail
 * behind you rots at the far end while you are still walking. `grid.memory` is
 * how many milliseconds a cell stays remembered; null means forever, which is
 * every level up to the chapter that takes it away.
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
  const hole = 1 - MEMORY_ALPHA
  fctx.fillStyle = `rgba(0,0,0,${hole})`

  for (const [id, seenAt] of game.visited) {
    let strength = 1
    if (grid.memory !== null) {
      const age = game.now - seenAt
      if (age >= grid.memory) continue          // forgotten completely
      // ease out, so a cell dims gently for most of its life and then goes
      strength = (1 - age / grid.memory) ** 0.65
    }
    const comma = id.indexOf(',')
    const x = +id.slice(0, comma)
    const y = +id.slice(comma + 1)
    if (grid.memory !== null) fctx.fillStyle = `rgba(0,0,0,${hole * strength})`
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

/**
 * One frame. Order matters: fog goes over the maze, and the hunter goes over
 * the fog — it is never hidden by it. Being unable to see the maze is the game;
 * being unable to see the thing chasing you is just noise.
 */
function drawScene(ctx, game, cellSize) {
  drawMaze(ctx, game, cellSize)
  drawBall(ctx, game.ball, cellSize)
  drawFog(ctx, game, cellSize)
  drawHunter(ctx, game, cellSize)
  drawWakeWarning(ctx, game, cellSize)
  drawFlash(ctx, game, cellSize)
}

export {
  COLORS, WALL_WIDTH, setupCanvas, ballDrawMetrics,
  drawScene, drawMaze, drawBall, drawFog, drawHunter, drawWakeWarning,
}
