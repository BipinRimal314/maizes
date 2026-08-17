import { describe, it, expect } from 'vitest'
import { createGrid, setWall, setSurface, surfaceAt, DIRECTIONS, GROUND, SAND, SNOW } from './grid.js'
import { createGame, stepGame } from './game.js'
import { SURFACES, slowestSurface, surfaceFactor, ACCEL, FRICTION, BALL_RADIUS } from './physics.js'
import { BALL_TOP_SPEED, HUNTER_SPEED_SHARE, hunterSpeedCap, createHunter } from './hunter.js'

/**
 * Ground that changes the physics.
 *
 * This is the first mechanic that is not presentation, so it is the first one
 * that can make a level unfair rather than merely ugly. The two things worth
 * proving are that it does what it says — faster on sand, slower on snow — and
 * that the hunter is still beatable on the worst ground a level contains.
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

/** Top speed reached running right along a long open row of one surface. */
function topSpeedOn(kind) {
  const grid = openGrid(40, 3)
  if (kind !== GROUND) {
    for (let x = 0; x < 40; x++) setSurface(grid, x, 0, kind)
  }
  const game = createGame(grid)
  game.ball.y = 0.5
  game.input.right = true
  let fastest = 0
  for (let i = 0; i < 400; i++) {
    stepGame(game)
    fastest = Math.max(fastest, Math.abs(game.ball.vx))
  }
  return fastest
}

describe('what the ground does', () => {
  it('runs the ball faster over sand and slower through snow', () => {
    const ground = topSpeedOn(GROUND)
    expect(topSpeedOn(SAND)).toBeGreaterThan(ground * 1.2)
    expect(topSpeedOn(SNOW)).toBeLessThan(ground * 0.9)
  })

  it('scales top speed by exactly the surface factor', () => {
    // only acceleration is scaled, and terminal velocity is linear in it, so
    // the ratio should land on the table value rather than near it
    const ground = topSpeedOn(GROUND)
    expect(topSpeedOn(SAND) / ground).toBeCloseTo(SURFACES[SAND], 2)
    expect(topSpeedOn(SNOW) / ground).toBeCloseTo(SURFACES[SNOW], 2)
  })

  it('leaves handling alone: friction and radius are untouched', () => {
    // the ball must corner the same way everywhere. If snow were sticky and
    // sand slippery the maze would steer differently rather than just take
    // longer, and the wall-overlap property would be back in play
    expect(FRICTION).toBe(0.82)
    expect(BALL_RADIUS).toBe(0.22)
    expect(ACCEL).toBe(0.036)
  })

  it('reads the ground under the ball, cell by cell', () => {
    const grid = openGrid(6, 3)
    setSurface(grid, 3, 1, SNOW)
    expect(surfaceFactor(grid, 3.5, 1.5)).toBe(SURFACES[SNOW])
    expect(surfaceFactor(grid, 2.5, 1.5)).toBe(1)
    expect(surfaceAt(grid, 3, 1)).toBe(SNOW)
  })

  it('treats anything off the board as ordinary', () => {
    const grid = openGrid(4, 4)
    expect(surfaceAt(grid, -1, 0)).toBe(GROUND)
    expect(surfaceFactor(grid, 99, 99)).toBe(1)
  })
})

describe('the hunter is sized against the worst ground', () => {
  it('reports the slowest surface on a grid', () => {
    const grid = openGrid(6, 6)
    expect(slowestSurface(grid)).toBe(1)
    setSurface(grid, 2, 2, SAND)
    expect(slowestSurface(grid), 'sand is faster, not slower').toBe(1)
    setSurface(grid, 3, 3, SNOW)
    expect(slowestSurface(grid)).toBe(SURFACES[SNOW])
  })

  it('caps lower on a grid with snow in it', () => {
    const plain = openGrid(6, 6)
    const snowy = openGrid(6, 6)
    setSurface(snowy, 2, 2, SNOW)

    expect(hunterSpeedCap(plain)).toBeCloseTo(BALL_TOP_SPEED * HUNTER_SPEED_SHARE, 9)
    expect(hunterSpeedCap(snowy)).toBeLessThan(hunterSpeedCap(plain))
  })

  it('leaves the ball faster than the hunter even in deep snow', () => {
    /*
     * The invariant the whole mechanic rests on. Being caught costs the level
     * now, so a hunter that can run down a player wading through snow is not
     * "hard", it is unwinnable — and it would pass every structural check,
     * because nothing about the maze would be wrong.
     */
    const snowy = openGrid(6, 6)
    setSurface(snowy, 1, 1, SNOW)
    const ballInSnow = BALL_TOP_SPEED * SURFACES[SNOW]
    expect(hunterSpeedCap(snowy)).toBeLessThan(ballInSnow)
  })

  it('clamps a hunter that asks for more than the snowy grid allows', () => {
    const snowy = openGrid(8, 8)
    setSurface(snowy, 1, 1, SNOW)
    snowy.hunter = { spawnMs: 0, speed: 0.095 }
    expect(createHunter(snowy).speed).toBeCloseTo(hunterSpeedCap(snowy), 9)
  })
})

describe('patches are places, not a texture', () => {
  it('a patch actually slows a crossing measurably', () => {
    const cross = (kind) => {
      const grid = openGrid(20, 3)
      for (let x = 4; x < 14; x++) setSurface(grid, x, 1, kind)
      const game = createGame(grid)
      game.ball.y = 1.5
      game.input.right = true
      let steps = 0
      while (game.ball.x < 18 && steps < 4000) { stepGame(game); steps++ }
      return steps
    }
    expect(cross(SNOW)).toBeGreaterThan(cross(GROUND))
    expect(cross(SAND)).toBeLessThan(cross(GROUND))
  })
})
