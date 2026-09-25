import { expect, it, vi } from 'vitest'
import { createGrid, setWall, DIRECTIONS } from './grid.js'
import { createGame, stepGame, restartGame } from './game.js'
import { createHunter } from './hunter.js'
import { seesPlayer, searchTarget } from './search.js'
import { drawLandmarks } from './landmarks.js'

function field() {
  const grid = createGrid(9, 3)
  for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) {
    if (x < 8) setWall(grid, x, y, DIRECTIONS[1], false)
    if (y < 2) setWall(grid, x, y, DIRECTIONS[2], false)
  }
  grid.revision = 3
  grid.pickupMode = 'continuous'
  grid.flags = [{ x: 2, y: 0 }, { x: 5, y: 0 }]
  grid.hunter = { speed: .048, spawnMs: 18000, behavior: 'search', sight: 7 }
  return grid
}
it('normal exploration collects in place without resetting the ghost or spawning at home', () => {
  const game = createGame(field())
  game.hunter.wakesAt = 12345
  game.ball.x = 2.5
  stepGame(game)
  expect(game.captured.size).toBe(1)
  expect(game.ball.x).toBe(2.5)
  expect(game.hunter.wakesAt).toBe(12345)
  expect(game.fx.some(f => f.kind === 'spawn')).toBe(false)
})
it('return-trip fields deliberately retain the pickup reset', () => {
  const grid = field(); grid.pickupMode = 'return'
  const game = createGame(grid); game.ball.x = 2.5; stepGame(game)
  expect(game.ball.x).toBe(.5)
})
it('sight stops at walls and corners rather than tracking through the maze', () => {
  const grid = field()
  expect(seesPlayer(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, 7)).toBe(true)
  expect(seesPlayer(grid, { x: 0, y: 0 }, { x: 4, y: 1 }, 7)).toBe(false)
  setWall(grid, 2, 0, DIRECTIONS[1], true)
  expect(seesPlayer(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, 7)).toBe(false)
})
it('searches the last seen position, responds to sound, and loses sight in stationary cover', () => {
  const grid = field(); grid.shelters = [{ x: 4, y: 0 }]
  const h = createHunter(grid); h.x = .5; h.y = .5
  expect(searchTarget(h, grid, { x: 3.5, y: .5, vx: .1 }, 100)).toEqual({ x: 3, y: 0 })
  expect(h.mood).toBe('chasing')
  expect(searchTarget(h, grid, { x: 3.5, y: 1.5 }, 200)).toEqual({ x: 3, y: 0 })
  expect(h.mood).toBe('searching')
  searchTarget(h, grid, { x: 4.5, y: .5 }, 300)
  expect(h.mood).toBe('hidden')
  h.heard = { x: 6, y: 2, until: 2000 }
  expect(searchTarget(h, grid, { x: 3.5, y: 1.5 }, 500)).toMatchObject({ x: 6, y: 2 })
  expect(h.mood).toBe('investigating')
})
it('the final gate needs maize and trail markers; finds are emitted once and reset per attempt', () => {
  const grid = field()
  grid.discoveries = [{ x: 3, y: 0, id: 'last', title: 'A knot', text: 'She was here.', required: true }]
  const game = createGame(grid); game.onDiscovery = vi.fn()
  for (const x of [2.5, 5.5]) { game.ball.x = x; stepGame(game) }
  expect(game.exitOpen).toBe(false)
  game.ball.x = 3.5; stepGame(game); stepGame(game)
  expect(game.exitOpen).toBe(true)
  expect(game.onDiscovery).toHaveBeenCalledTimes(1)
  restartGame(game)
  expect(game.discoveries.size).toBe(0)
})
it('trap clues are rendered before fog, without using developer crosses', () => {
  const grid = field(); grid.traps = [{ x: 4, y: 0 }]
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillRect() {} }
  drawLandmarks(ctx, createGame(grid), 32)
  expect(ctx.stroke).toHaveBeenCalled()
  expect(ctx.strokeStyle).not.toBe('#ff5347')
})

it('shelter breaks sight but does not grant contact immunity', () => {
  const grid = field(); grid.shelters = [{ x: 0, y: 0 }]
  const game = createGame(grid)
  game.hunter.active = true; game.hunter.x = .5; game.hunter.y = .5
  stepGame(game)
  expect(game.lost).toBe(true)
})
