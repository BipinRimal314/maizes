/**
 * Fog of war, the memory trail, and the void.
 *
 * The fog is composited on an offscreen canvas so the visible area can be a
 * smooth radial falloff punched out with destination-out. The original filled
 * one opaque rectangle per cell with a hand-rolled alpha ramp, which gave the
 * lit area a hard, stair-stepped border — the single ugliest thing on screen
 * and, worse, it made it hard to tell a dim remembered cell from a lit one.
 *
 * Positions are in cell units. Only this module and the renderer know pixels.
 */

const FOG_COLOR = '50, 47, 35'
const MEMORY_ALPHA = 0.78   // how dark a cell you have already mapped stays

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

function drawFog(ctx, grid, cellSize, ball, fogRadius, visited) {
  if (fogRadius === null || fogRadius === undefined) return

  const width = grid.cols * cellSize
  const height = grid.rows * cellSize
  const canvas = getFogCanvas(width, height)
  const fctx = canvas.getContext('2d')

  fctx.clearRect(0, 0, width, height)

  // Blanket the maze, leaving mapped cells slightly translucent so the player
  // keeps a readable memory of where they have been.
  fctx.fillStyle = `rgba(${FOG_COLOR}, 1)`
  fctx.fillRect(0, 0, width, height)

  if (visited.size > 0) {
    fctx.globalCompositeOperation = 'destination-out'
    fctx.fillStyle = `rgba(0, 0, 0, ${1 - MEMORY_ALPHA})`
    for (const key of visited) {
      const comma = key.indexOf(',')
      const x = +key.slice(0, comma)
      const y = +key.slice(comma + 1)
      fctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    }
    fctx.globalCompositeOperation = 'source-over'
  }

  // punch the lit area, soft at the rim
  const bx = ball.x * cellSize
  const by = ball.y * cellSize
  const radius = fogRadius * cellSize
  const gradient = fctx.createRadialGradient(bx, by, 0, bx, by, radius)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
  gradient.addColorStop(0.65, 'rgba(0, 0, 0, 1)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  fctx.globalCompositeOperation = 'destination-out'
  fctx.fillStyle = gradient
  fctx.beginPath()
  fctx.arc(bx, by, radius, 0, Math.PI * 2)
  fctx.fill()
  fctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(canvas, 0, 0)
}

function drawCorruption(ctx, cellSize, corrupted, now) {
  if (corrupted.size === 0) return

  for (const key of corrupted) {
    const comma = key.indexOf(',')
    const x = +key.slice(0, comma)
    const y = +key.slice(comma + 1)
    const pulse = 0.75 + Math.sin(now / 500 + x * 0.5 + y * 0.3) * 0.15
    ctx.fillStyle = `rgba(${FOG_COLOR}, ${pulse})`
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    ctx.fillStyle = `rgba(153, 56, 98, ${pulse * 0.2})`
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
  }
}

/**
 * The void eats one ring outward per tick. The exit is never consumed, so a
 * level can always still be finished.
 */
function spreadCorruption(corrupted, frontier, grid) {
  if (frontier.length === 0) return { corruptedCells: corrupted, frontier }

  const next = new Set(corrupted)
  const newFrontier = []
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
  ]

  for (const cell of frontier) {
    for (const d of dirs) {
      const nx = cell.x + d.dx
      const ny = cell.y + d.dy
      if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) continue
      if (nx === grid.end.x && ny === grid.end.y) continue
      const key = `${nx},${ny}`
      if (next.has(key)) continue
      next.add(key)
      newFrontier.push({ x: nx, y: ny })
    }
  }

  return { corruptedCells: next, frontier: newFrontier }
}

export { drawFog, drawCorruption, spreadCorruption, FOG_COLOR }
