import { describe, it, expect, vi } from 'vitest'
import { createGrid, setModifier, setGate } from './maze'
import { createGame, stepGame, restartGame, hudSnapshot, STEP_MS, countFlags } from './game'

const SECOND = Math.round(1000 / STEP_MS)

function run(game, steps, direction) {
  if (direction) game.input[direction] = true
  for (let i = 0; i < steps; i++) stepGame(game)
  if (direction) game.input[direction] = false
}

describe('deaths', () => {
  it('sends the ball back to the start and counts the death', () => {
    const grid = createGrid(6, 1)
    grid.cells[3].trap = true
    const game = createGame(grid)

    run(game, 400, 'right')

    expect(game.deaths).toBeGreaterThan(0)
    expect(Math.floor(game.ball.x)).toBe(grid.start.x)
  })

  it('reports the cause so the quip can name it', () => {
    const grid = createGrid(6, 1)
    grid.cells[2].mimic = true
    const causes = []
    const game = createGame(grid, { onDeath: (cause) => causes.push(cause) })

    run(game, 300, 'right')

    expect(causes).toContain('mimic')
    expect(game.lastQuip).toBe('that exit was lying to you.')
  })

  it('leaves the level data untouched, so a retry is the same level', () => {
    const grid = setGate(createGrid(8, 1), 3, 0, 'right')
    grid.cells[5].trap = true
    const snapshot = JSON.stringify(grid)

    const game = createGame(grid)
    run(game, 600, 'right')

    expect(JSON.stringify(grid)).toBe(snapshot)
  })
})

describe('flags', () => {
  it('counts them up front', () => {
    let grid = createGrid(5, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    grid = setModifier(grid, 3, 0, 'fakeExit')
    expect(countFlags(grid)).toBe(2)
  })

  it('keeps the exit locked until every one is found', () => {
    let grid = createGrid(6, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    grid = setModifier(grid, 4, 0, 'fakeExit')
    grid.end = { x: 5, y: 0 }

    const game = createGame(grid)
    expect(game.exitUnlocked).toBe(false)

    run(game, 900, 'right')

    expect(game.flagsCaptured.size).toBe(2)
    expect(game.exitUnlocked).toBe(true)
  })

  it('unlocks immediately when a level has none', () => {
    expect(createGame(createGrid(4, 4)).exitUnlocked).toBe(true)
  })

  it('sends you home but does not count as a death', () => {
    let grid = createGrid(6, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    const game = createGame(grid)

    run(game, 300, 'right')

    expect(game.flagsCaptured.size).toBe(1)
    // capturing a flag is the objective, not a failure
    expect(game.deaths).toBe(0)
  })

  it('does not re-trigger on a flag already captured', () => {
    let grid = createGrid(6, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    const game = createGame(grid)

    run(game, 300, 'right')
    run(game, 300, 'right')

    expect(game.flagsCaptured.size).toBe(1)
    expect(game.deaths).toBe(0)
  })

  // These two place the ball on the tile rather than driving it there, so the
  // assertion lands on the step after the death and not after the ball has had
  // time to wander back and re-collect.
  it('makes you redo them when the death mode is harsher than "progress"', () => {
    let grid = createGrid(8, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    grid.cells[4].trap = true

    const game = createGame(grid, { deathMode: 'full' })

    game.ball.x = 2.5
    stepGame(game)
    expect(game.flagsCaptured.size).toBe(1)

    game.ball.x = 4.5
    stepGame(game)
    expect(game.flagsCaptured.size).toBe(0)
    expect(game.exitUnlocked).toBe(false)
  })

  it('keeps them on death when the mode is "progress"', () => {
    let grid = createGrid(8, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    grid.cells[4].trap = true

    const game = createGame(grid, { deathMode: 'progress' })

    game.ball.x = 2.5
    stepGame(game)
    expect(game.flagsCaptured.size).toBe(1)

    game.ball.x = 4.5
    stepGame(game)
    expect(game.flagsCaptured.size).toBe(1)
  })
})

describe('one-way gates', () => {
  it('closes behind the ball exactly once', () => {
    const grid = setGate(createGrid(6, 1), 2, 0, 'right')
    const onGatePass = vi.fn()
    const game = createGame(grid, { onGatePass })

    run(game, 500, 'right')

    expect(game.closedGates.has('2,0')).toBe(true)
    expect(onGatePass).toHaveBeenCalledTimes(1)
  })
})

describe('memory wipe', () => {
  it('erases the mapped trail on entry', () => {
    const grid = createGrid(8, 1)
    grid.cells[3].memoryWipe = true
    const game = createGame(grid, { fogRadius: 3 })

    game.visited.add('0,0')
    game.visited.add('1,0')
    game.visited.add('2,0')

    game.ball.x = 3.5
    stepGame(game)

    // everything mapped is gone; only the cell being stood on is known
    expect(game.visited.has('1,0')).toBe(false)
    expect(game.visited.has('3,0')).toBe(true)
    expect(game.lastWipeCell).toBe('3,0')
  })

  it('does not keep wiping while the ball sits on the tile', () => {
    const grid = createGrid(8, 1)
    grid.cells[3].memoryWipe = true
    const game = createGame(grid, { fogRadius: 3 })

    game.ball.x = 3.5
    stepGame(game)

    game.visited.add('marker')
    for (let i = 0; i < 30; i++) stepGame(game)

    expect(game.visited.has('marker')).toBe(true)
  })

  it('arms again once the ball leaves and returns', () => {
    const grid = createGrid(8, 1)
    grid.cells[3].memoryWipe = true
    const game = createGame(grid, { fogRadius: 3 })

    game.ball.x = 3.5
    stepGame(game)
    expect(game.lastWipeCell).toBe('3,0')

    game.ball.x = 5.5
    stepGame(game)
    expect(game.lastWipeCell).toBeNull()

    game.visited.add('marker')
    game.ball.x = 3.5
    stepGame(game)
    expect(game.visited.has('marker')).toBe(false)
  })
})

describe('winning', () => {
  it('requires the exit to be unlocked', () => {
    let grid = createGrid(4, 1)
    grid = setModifier(grid, 1, 0, 'fakeExit')
    grid.end = { x: 3, y: 0 }

    const onWin = vi.fn()
    const game = createGame(grid, { onWin })
    game.exitUnlocked = false
    game.ball.x = 3.5

    stepGame(game)
    expect(game.won).toBe(false)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('fires once and then stops simulating', () => {
    const grid = createGrid(4, 1)
    grid.end = { x: 3, y: 0 }
    const onWin = vi.fn()
    const game = createGame(grid, { onWin })

    run(game, 600, 'right')
    expect(game.won).toBe(true)
    expect(onWin).toHaveBeenCalledTimes(1)

    const timeAtWin = game.now
    for (let i = 0; i < 60; i++) stepGame(game)
    expect(game.now).toBe(timeAtWin)
  })
})

describe('the clock', () => {
  it('advances only while running', () => {
    const game = createGame(createGrid(6, 6))

    for (let i = 0; i < SECOND; i++) stepGame(game)
    expect(game.now).toBeCloseTo(1000, 0)

    game.paused = true
    for (let i = 0; i < SECOND; i++) stepGame(game)
    expect(game.now).toBeCloseTo(1000, 0)
  })
})

describe('escalation', () => {
  it('tightens the fog on a sadistic level once deaths pile up', () => {
    const grid = createGrid(8, 1)
    grid.cells[3].trap = true
    const game = createGame(grid, { era: 'sadistic', fogRadius: 4 })

    expect(game.fogRadius).toBe(4)
    for (let i = 0; i < 8; i++) run(game, 300, 'right')

    expect(game.fogRadius).toBeLessThan(4)
    expect(game.fogRadius).toBeGreaterThanOrEqual(1)
  })

  it('leaves the fog on a learning level alone no matter how badly it goes', () => {
    const grid = createGrid(8, 1)
    grid.cells[3].trap = true
    const game = createGame(grid, { era: 'learning', fogRadius: 4 })

    for (let i = 0; i < 8; i++) run(game, 300, 'right')
    expect(game.fogRadius).toBe(4)
  })

  it('arms the apparition from level design, not from the era', () => {
    // it used to be switched on by era, which put it on 23 of 25 levels
    expect(createGame(createGrid(4, 4), { era: 'sadistic' }).stalker.enabled).toBe(false)
    expect(createGame(createGrid(4, 4), { era: 'punishing' }).stalker.enabled).toBe(false)
    expect(createGame(createGrid(4, 4), { era: 'learning', apparition: true }).stalker.enabled).toBe(true)
  })
})

describe('restart', () => {
  it('resets the attempt without touching the level', () => {
    let grid = createGrid(8, 1)
    grid = setModifier(grid, 2, 0, 'fakeExit')
    grid.cells[5].trap = true
    const snapshot = JSON.stringify(grid)

    const game = createGame(grid)
    run(game, 700, 'right')
    expect(game.deaths).toBeGreaterThan(0)

    restartGame(game)

    expect(game.deaths).toBe(0)
    expect(game.now).toBe(0)
    expect(game.visited.size).toBe(0)
    expect(game.closedGates.size).toBe(0)
    expect(game.flagsCaptured.size).toBe(0)
    expect(JSON.stringify(grid)).toBe(snapshot)
  })
})

describe('hud snapshot', () => {
  it('is flat primitives so React can skip identical updates', () => {
    const game = createGame(createGrid(5, 5), { era: 'sadistic', fogRadius: 3, apparition: true })
    const hud = hudSnapshot(game)

    for (const value of Object.values(hud)) {
      expect(['number', 'boolean', 'string', 'object']).toContain(typeof value)
      expect(value instanceof Set).toBe(false)
      expect(value instanceof Map).toBe(false)
    }
    expect(hud.deaths).toBe(0)
    expect(hud.stalkerEnabled).toBe(true)
  })
})
