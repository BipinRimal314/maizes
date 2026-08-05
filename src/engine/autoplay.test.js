import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeGrid } from './levelFormat'
import { LEVELS as HAND_CRAFTED } from './levels'
import { createGame, stepGame } from './game'
import { checkWin } from './physics'

/**
 * Drive every shipped level with the real engine and confirm a player can
 * physically get out.
 *
 * The invariants in levelData.test.js prove the maze *graph* has a route. This
 * proves the *ball* can walk it: collision resolution, corner clearance, gate
 * blocking and the level geometry all together. A level can be perfectly
 * solvable on paper and still have a corridor the ball cannot fit through.
 */

const curated = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/levels/curated.json', import.meta.url)), 'utf8')
)

const SIDES = [
  { name: 'top', dx: 0, dy: -1, bit: 1, opposite: 4 },
  { name: 'right', dx: 1, dy: 0, bit: 2, opposite: 8 },
  { name: 'bottom', dx: 0, dy: 1, bit: 4, opposite: 1 },
  { name: 'left', dx: -1, dy: 0, bit: 8, opposite: 2 },
]
const GATE_BLOCKS = { up: 'bottom', down: 'top', left: 'right', right: 'left' }

function wallBits(cell) {
  return (cell.walls.top ? 1 : 0) | (cell.walls.right ? 2 : 0)
    | (cell.walls.bottom ? 4 : 0) | (cell.walls.left ? 8 : 0)
}

function cellAt(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

function solve(grid) {
  const key = (x, y) => `${x},${y}`
  const previous = new Map([[key(grid.start.x, grid.start.y), null]])
  const queue = [[grid.start.x, grid.start.y]]

  while (queue.length) {
    const [x, y] = queue.shift()
    if (x === grid.end.x && y === grid.end.y) {
      const path = []
      let at = key(x, y)
      while (at !== null) {
        const [px, py] = at.split(',').map(Number)
        path.push({ x: px, y: py })
        at = previous.get(at)
      }
      return path.reverse()
    }

    const cell = cellAt(grid, x, y)
    for (const side of SIDES) {
      if (wallBits(cell) & side.bit) continue
      if (cell.gate && GATE_BLOCKS[cell.gate.direction] === side.name) continue
      const next = cellAt(grid, x + side.dx, y + side.dy)
      if (!next) continue
      if (wallBits(next) & side.opposite) continue
      const nextKey = key(x + side.dx, y + side.dy)
      if (previous.has(nextKey)) continue
      previous.set(nextKey, key(x, y))
      queue.push([x + side.dx, y + side.dy])
    }
  }

  return null
}

/**
 * A bang-bang controller that steers toward each waypoint in turn. Crude on
 * purpose — if a sloppy driver can finish the level, a person can.
 */
function autoplay(grid, path, maxSteps) {
  // The collect-all rule is game.test.js's business; here we only care whether
  // the ball can physically reach the exit tile.
  const game = createGame(grid)
  game.exitUnlocked = true

  let waypoint = 1
  let steps = 0
  let deaths = 0

  while (steps < maxSteps) {
    if (checkWin(game.ball, grid)) return { won: true, steps, deaths }

    // a death rewinds us to the start of the route
    if (game.deaths > deaths) {
      deaths = game.deaths
      waypoint = 1
    }

    const target = path[Math.min(waypoint, path.length - 1)]
    const tx = target.x + 0.5
    const ty = target.y + 0.5
    const dx = tx - game.ball.x
    const dy = ty - game.ball.y

    if (Math.hypot(dx, dy) < 0.2 && waypoint < path.length - 1) waypoint++

    const threshold = 0.05
    game.input.left = dx < -threshold
    game.input.right = dx > threshold
    game.input.up = dy < -threshold
    game.input.down = dy > threshold

    stepGame(game)
    steps++
  }

  return { won: checkWin(game.ball, grid), steps, deaths }
}

function budgetFor(path) {
  return Math.max(4000, path.length * 200)
}

describe('every curated level can actually be walked out of', () => {
  for (const level of curated) {
    it(`${level.name}`, () => {
      const grid = decodeGrid(level.maze)
      const path = solve(grid)
      expect(path, 'no route exists').not.toBeNull()

      const result = autoplay(grid, path, budgetFor(path))
      expect(result.won, `stuck after ${result.steps} steps`).toBe(true)
    })
  }
})

describe('every hand-crafted level can actually be walked out of', () => {
  for (const level of HAND_CRAFTED) {
    it(`${level.name}`, () => {
      const path = solve(level.grid)
      expect(path, 'no route exists').not.toBeNull()

      const result = autoplay(level.grid, path, budgetFor(path))
      expect(result.won, `stuck after ${result.steps} steps`).toBe(true)
    })
  }
})

describe('the driver does not cheat', () => {
  it('cannot finish a level whose exit is walled off entirely', () => {
    const grid = decodeGrid(curated[0].maze)
    const exit = cellAt(grid, grid.end.x, grid.end.y)
    exit.walls = { top: true, right: true, bottom: true, left: true }

    // seal the neighbours too, so the exit is genuinely unreachable
    for (const side of SIDES) {
      const neighbour = cellAt(grid, grid.end.x + side.dx, grid.end.y + side.dy)
      if (neighbour) {
        neighbour.walls = { ...neighbour.walls, [{ top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[side.name]]: true }
      }
    }

    expect(solve(grid)).toBeNull()
  })
})
