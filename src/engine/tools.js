import { DIRECTIONS, key, setWall, wallsAt } from './grid.js'

export const CHOP_MS = 450
export const REPEL_MS = 10000

// Each attempt owns its collision map. Never mutate the shipped level data.
export function toolGrid(grid) {
  if (!grid.wood?.length) return grid
  const copy = { ...grid, walls: Uint8Array.from(grid.walls) }
  applyWood(copy, grid.walls, new Set(grid.wood.map(p => key(p.x, p.y))))
  return copy
}

function applyWood(grid, original, remaining) {
  grid.walls.set(original)
  for (const id of remaining) {
    const [x, y] = id.split(',').map(Number)
    for (const direction of DIRECTIONS) setWall(grid, x, y, direction, true)
  }
}

export function resetTools(game) {
  game.hasAxe = false
  game.charm = 0
  game.charmPicked = false
  game.wood = new Set((game.originalGrid.wood ?? []).map(p => key(p.x, p.y)))
  game.chopping = null
  if (game.wood.size) applyWood(game.grid, game.originalGrid.walls, game.wood)
}

export function stepTools(game, dt) {
  const { ball, grid } = game
  const x = Math.floor(ball.x), y = Math.floor(ball.y)
  if (grid.axe && !game.hasAxe && x === grid.axe.x && y === grid.axe.y) {
    game.hasAxe = true
    game.quip = 'An axe. Hold toward the timber to cut a way through.'
    game.onSound?.('capture')
  }
  if (grid.charm && !game.charmPicked && x === grid.charm.x && y === grid.charm.y) {
    game.charmPicked = true
    game.charm = 1
    game.quip = 'A ward. It will drive the ghost away once.'
    game.onSound?.('capture')
  }
  let target = null
  for (const d of DIRECTIONS) {
    const input = { top: 'up', bottom: 'down', left: 'left', right: 'right' }[d.name]
    if (!game.input[input]) continue
    const nx = x + d.dx, ny = y + d.dy
    const id = key(nx, ny)
    // Only a real open passage may be chopped. Stone stays stone.
    if (!game.wood.has(id) || (wallsAt(game.originalGrid, x, y) & d.bit)) continue
    const gap = d.dx ? Math.abs(nx + .5 - ball.x) : Math.abs(ny + .5 - ball.y)
    if (gap > .5 + ball.radius + .08) continue
    target = id
    break
  }
  if (!target || !game.hasAxe) {
    game.chopping = null
    if (target) game.quip = 'Blocked by timber. Find the axe first.'
    return
  }
  if (game.chopping?.id !== target) game.chopping = { id: target, ms: 0, sounded: false }
  if (!game.chopping.sounded && dt > 0) {
    game.onSound?.('chop')
    game.chopping.sounded = true
    if (game.hunter) game.hunter.heard = { x, y, until: game.now + 5000 }
  }
  game.chopping.ms += dt
  if (game.chopping.ms < CHOP_MS) return
  game.wood.delete(target)
  applyWood(grid, game.originalGrid.walls, game.wood)
  if (game.hunter) { game.hunter.field = null; game.hunter.fieldFrom = null }
  game.chopping = null
  const [fx, fy] = target.split(',').map(Number)
  game.flash = { x: fx, y: fy, until: game.now + 300, kind: 'wood' }
  game.quip = game.hunter?.active ? 'The timber broke. It heard that.' : 'That opens the path.'
  game.onSound?.('timber')
}
