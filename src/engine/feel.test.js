import { describe, it, expect } from 'vitest'
import { createGrid, setWall, setSurface, DIRECTIONS, GROUND, SAND, SNOW } from './grid.js'
import { createGame, stepGame, restartGame, TRAIL_LENGTH } from './game.js'
import { drawTrail, drawScene } from './render.js'
import { FOOTFALLS, AMBIENCE } from './sound.js'
import { TERRAINS } from './render.js'

/**
 * Feel: the footfalls, the tail behind the hat, and the jolt when it goes wrong.
 *
 * The footfall is the one with a job beyond polish — sand and snow change the
 * physics, and the sound is how that is taught without writing it down. So what
 * matters is that a step reports the ground it actually landed on.
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

function stubContext() {
  const calls = { arc: [], translate: [], save: 0, restore: 0 }
  const ctx = {
    canvas: null, fillStyle: null, strokeStyle: null, globalAlpha: 1,
    lineWidth: 0, lineCap: '', lineJoin: '', font: '', textAlign: '', textBaseline: '',
    shadowColor: null, shadowBlur: 0, shadowOffsetY: 0,
    arc: (...a) => calls.arc.push(a),
    translate: (...a) => calls.translate.push(a),
    save: () => { calls.save++ }, restore: () => { calls.restore++ },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arcTo() {},
    quadraticCurveTo() {}, ellipse() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, clearRect() {}, fillText() {}, drawImage() {}, rotate() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  return { ctx, calls }
}

describe('footfalls carry the ground', () => {
  function walkAcross(kind) {
    const grid = openGrid(14, 3)
    for (let x = 4; x < 10; x++) setSurface(grid, x, 1, kind)
    const game = createGame(grid)
    game.ball.y = 1.5

    const heard = []
    game.onStep = (surface) => heard.push(surface)
    game.input.right = true
    for (let i = 0; i < 600 && game.ball.x < 13; i++) stepGame(game)
    return heard
  }

  it('reports ordinary ground on an ordinary board', () => {
    const grid = openGrid(10, 3)
    const game = createGame(grid)
    game.ball.y = 1.5
    const heard = []
    game.onStep = (surface) => heard.push(surface)
    game.input.right = true
    for (let i = 0; i < 400; i++) stepGame(game)
    expect(heard.length).toBeGreaterThan(3)
    expect(heard.every((s) => s === GROUND)).toBe(true)
  })

  it('changes underfoot when the ground changes', () => {
    for (const kind of [SAND, SNOW]) {
      const heard = walkAcross(kind)
      expect(heard, `no steps on ${kind}`).toContain(kind)
      expect(heard, `never left the patch on ${kind}`).toContain(GROUND)
    }
  })

  it('fires once per cell, not once per frame', () => {
    // sixty a second would be a buzz, not a walk
    const grid = openGrid(12, 3)
    const game = createGame(grid)
    game.ball.y = 1.5
    let steps = 0
    game.onStep = () => { steps++ }
    game.input.right = true
    for (let i = 0; i < 300; i++) stepGame(game)
    expect(steps).toBeLessThanOrEqual(12)
  })

  it('has a distinct voice for every ground', () => {
    const cutoffs = [GROUND, SAND, SNOW].map((k) => FOOTFALLS[k].cutoff)
    expect(new Set(cutoffs).size).toBe(3)
    // sand is the bright one and snow the dull one, which is the whole tell
    expect(FOOTFALLS[SAND].cutoff).toBeGreaterThan(FOOTFALLS[GROUND].cutoff)
    expect(FOOTFALLS[SNOW].cutoff).toBeLessThan(FOOTFALLS[GROUND].cutoff)
  })
})

describe('ambience', () => {
  it('has a bed for every terrain the game ships', () => {
    for (const terrain of Object.keys(TERRAINS)) {
      expect(AMBIENCE[terrain], `${terrain} has no air`).toBeTruthy()
    }
  })

  it('keeps every bed quiet enough to sit under the game', () => {
    for (const [name, air] of Object.entries(AMBIENCE)) {
      expect(air.windGain, `${name} wind`).toBeLessThan(0.03)
      expect(air.droneGain, `${name} drone`).toBeLessThan(0.03)
    }
  })
})

describe('the tail behind the hat', () => {
  it('grows as you move and stops at its limit', () => {
    const game = createGame(openGrid(20, 3))
    game.ball.y = 1.5
    game.input.right = true
    for (let i = 0; i < 60; i++) stepGame(game)
    expect(game.trail.length).toBeGreaterThan(1)
    for (let i = 0; i < 2000; i++) stepGame(game)
    expect(game.trail.length).toBeLessThanOrEqual(TRAIL_LENGTH)
  })

  it('draws nothing until there is a trail to draw', () => {
    const game = createGame(openGrid(6, 6))
    const { ctx, calls } = stubContext()
    drawTrail(ctx, game, 30)
    expect(calls.arc).toHaveLength(0)
  })

  it('fades from oldest to newest', () => {
    const game = createGame(openGrid(20, 3))
    game.ball.y = 1.5
    game.input.right = true
    for (let i = 0; i < 200; i++) stepGame(game)

    const alphas = []
    const { ctx } = stubContext()
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => 1,
      set: (v) => { alphas.push(v) },
      configurable: true,
    })
    drawTrail(ctx, game, 30)
    const drawn = alphas.filter((a) => a > 0 && a < 1)
    expect(drawn.length).toBeGreaterThan(1)
    expect(drawn.at(-1)).toBeGreaterThan(drawn[0])
  })

  it('is cleared by a restart', () => {
    const game = createGame(openGrid(20, 3))
    game.input.right = true
    for (let i = 0; i < 200; i++) stepGame(game)
    restartGame(game)
    expect(game.trail).toEqual([])
    expect(game.cell).toBeNull()
  })
})

describe('the jolt', () => {
  it('is set by a trap and runs itself down', () => {
    const grid = openGrid(10, 3)
    grid.traps = [{ x: 4, y: 1 }]
    const game = createGame(grid)
    game.ball.y = 1.5
    game.input.right = true
    for (let i = 0; i < 400 && game.deaths === 0; i++) stepGame(game)

    expect(game.shake).toBeGreaterThan(0)
    game.input.right = false
    for (let i = 0; i < 60; i++) stepGame(game)
    expect(game.shake).toBe(0)
  })

  it('is bigger for being caught than for a trap', () => {
    // losing the level should land harder than losing the walk back
    const trapped = createGame(openGrid(8, 3))
    trapped.grid.traps = [{ x: 3, y: 1 }]
    const caught = createGame(openGrid(8, 3))
    caught.grid.hunter = { spawnMs: 0, speed: 0.1 }
    const withHunter = createGame(caught.grid)

    for (let i = 0; i < 4000 && !withHunter.lost; i++) stepGame(withHunter)
    expect(withHunter.lost).toBe(true)

    const trap = createGame(trapped.grid)
    trap.ball.y = 1.5
    trap.input.right = true
    for (let i = 0; i < 400 && trap.deaths === 0; i++) stepGame(trap)

    expect(withHunter.shake).toBeGreaterThan(trap.shake)
  })

  it('offsets the whole frame and puts it back', () => {
    const game = createGame(openGrid(6, 6))
    game.shake = 300
    const { ctx, calls } = stubContext()
    drawScene(ctx, game, 30)
    expect(calls.translate.length).toBeGreaterThan(0)
    expect(calls.save).toBe(calls.restore)
  })

  it('does not offset a frame that is not shaking', () => {
    const game = createGame(openGrid(6, 6))
    const { ctx, calls } = stubContext()
    drawScene(ctx, game, 30)
    expect(calls.translate).toHaveLength(0)
  })
})
