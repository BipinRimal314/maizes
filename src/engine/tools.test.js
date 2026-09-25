import { describe, it, expect, vi } from 'vitest'
import { createGrid, setWall, DIRECTIONS, key } from './grid.js'
import { createGame, stepGame, restartGame } from './game.js'
import { CHOP_MS, REPEL_MS } from './tools.js'

function field() {
  const grid = createGrid(9, 2)
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) setWall(grid, x, y, DIRECTIONS[1], false)
  grid.start = { x: 0, y: 0 }
  grid.end = { x: 8, y: 0 }
  grid.axe = { x: 1, y: 0 }
  grid.wood = [{ x: 3, y: 0 }]
  grid.flags = [{ x: 6, y: 0 }]
  grid.hunter = { spawnMs: 100000, speed: .048 }
  return grid
}
function ticks(game, n) { for (let i = 0; i < n; i++) stepGame(game) }

describe('axe and timber', () => {
  it('requires the axe, then opens only the wooden passage using movement input', () => {
    const source = field()
    const original = [...source.walls]
    const game = createGame(source)
    game.onCapture = vi.fn()
    game.ball.x = 2.5
    game.input.right = true
    ticks(game, 120)
    expect(game.ball.x).toBeLessThan(3)
    expect(game.wood.has('3,0')).toBe(true)
    game.input.right = false
    game.ball.x = 1.5
    game.ball.vx = 0
    stepGame(game)
    expect(game.hasAxe).toBe(true)
    game.ball.x = 2.5
    game.input.right = true
    ticks(game, 100)
    expect(game.wood.size).toBe(0)
    expect(game.captured.size).toBe(1)
    expect([...source.walls]).toEqual(original)
    expect(game.onCapture).toHaveBeenCalledTimes(1)
    // The stone partition between the two rows must still block movement.
    game.ball.x = 3.5
    game.ball.y = .5
    game.ball.vx = 0
    game.input.right = false
    game.input.down = true
    ticks(game, 120)
    expect(game.ball.y).toBeLessThan(1)
    restartGame(game)
    expect(game.hasAxe).toBe(false)
    expect(game.wood.has('3,0')).toBe(true)
    expect(createGame(source).wood.size).toBe(1)
  })

  it('retains tools and opened timber after a fall, but restores them on restart', () => {
    const grid = field()
    grid.traps = [{ x: 5, y: 0 }]
    const game = createGame(grid)
    game.ball.x = 1.5
    stepGame(game)
    game.ball.x = 2.77
    game.input.right = true
    ticks(game, Math.ceil(CHOP_MS / (1000 / 60)) + 5)
    expect(game.wood.size).toBe(0)
    game.input.right = false
    game.ball.vx = 0
    game.ball.x = 5.5
    stepGame(game)
    expect(game.deaths).toBe(1)
    expect(game.hasAxe).toBe(true)
    expect(game.wood.size).toBe(0)
    restartGame(game)
    expect(game.wood.size).toBe(1)
  })

  it('does not advance a chop while paused or chop through a stone wall', () => {
    const grid = field()
    const game = createGame(grid)
    game.hasAxe = true
    game.ball.x = 3.5
    game.ball.y = 1.3
    game.input.up = true
    ticks(game, 100)
    expect(game.wood.has('3,0')).toBe(true)
    game.ball.x = 2.77
    game.ball.y = .5
    game.input.up = false
    game.input.right = true
    game.paused = true
    ticks(game, 100)
    expect(game.chopping).toBeNull()
  })
})

describe('a ward buys one escape', () => {
  it('repels contact once, cannot be farmed, and is restored on restart', () => {
    const grid = field()
    grid.charm = { x: 2, y: 0 }
    const game = createGame(grid)
    game.ball.x = 2.5
    stepGame(game)
    expect(game.charm).toBe(1)
    game.hunter.active = true
    game.hunter.x = game.ball.x
    game.hunter.y = game.ball.y
    stepGame(game)
    expect(game.lost).toBe(false)
    expect(game.charm).toBe(0)
    expect(game.hunter.wakesAt - game.now).toBe(REPEL_MS)
    stepGame(game)
    expect(game.charm).toBe(0)
    game.hunter.active = true
    game.hunter.x = game.ball.x
    game.hunter.y = game.ball.y
    stepGame(game)
    expect(game.lost).toBe(true)
    restartGame(game)
    game.ball.x = 2.5
    stepGame(game)
    expect(game.charm).toBe(1)
    expect(game.captured.has(key(6, 0))).toBe(false)
  })
})
