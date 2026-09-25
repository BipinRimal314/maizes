import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { difficultyGrid, getDifficulty, saveDifficulty } from './difficulty.js'
import { createGame, stepGame, restartGame } from './game.js'
import { createGrid, setWall, DIRECTIONS, key } from './grid.js'
import { hunterSpeedCap } from './hunter.js'
import { fromJSON } from '../generate/generate.js'
import { playPerfectly } from '../generate/solvers.js'
import { distancesFrom } from '../generate/analysis.js'
const levels = JSON.parse(readFileSync(new URL('../../public/campaign-v2.json', import.meta.url)))

afterEach(() => vi.unstubAllGlobals())
it('remembers difficulty, defaults safely, and keeps progress storage untouched', () => {
  const saved = new Map([['maizes:journey-v2', 'existing progress']])
  vi.stubGlobal('localStorage', { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) })
  expect(getDifficulty()).toBe('easy')
  saveDifficulty('difficult')
  expect(getDifficulty()).toBe('difficult')
  expect(saved.get('maizes:journey-v2')).toBe('existing progress')
})

for (const mode of ['easy', 'difficult']) {
  describe(mode, () => {
    it('applies the maize penalty on a trap and keeps its rules after restart', () => {
      const grid = createGrid(8, 1)
      for (let x = 0; x < 7; x++) setWall(grid, x, 0, DIRECTIONS[1], false)
      grid.flags = [{ x: 2, y: 0 }]
      grid.traps = [{ x: 4, y: 0 }]
      grid.hunter = { spawnMs: 50000, speed: .048 }
      const game = createGame(grid, undefined, mode)
      game.ball.x = 2.5
      stepGame(game)
      expect(game.captured.size).toBe(1)
      game.ball.x = 4.5
      stepGame(game)
      expect(game.deaths).toBe(1)
      expect(game.captured.size).toBe(mode === 'easy' ? 1 : 0)
      expect(game.exitOpen).toBe(mode === 'easy')
      const pace = game.hunter.speed
      restartGame(game)
      expect(game.hunter.speed).toBe(pace)
      expect(game.difficulty).toBe(mode)
      expect(game.dev).toBe(false)
    })
    for (const level of levels) {
      it(`${level.name}: retains safe tool routes and can be completed without a death`, () => {
        const original = fromJSON(level)
        const before = JSON.stringify(original)
        const grid = difficultyGrid(original, mode)
        expect(JSON.stringify(original)).toBe(before)
        const game = createGame(original, undefined, mode)
        if (game.hunter) expect(game.hunter.speed).toBeLessThanOrEqual(hunterSpeedCap(grid))
        if (grid.axe) {
          const safe = distancesFrom(grid, grid.start, new Set([...grid.traps, ...grid.wood].map(p => key(p.x, p.y))))
          expect(safe.has(key(grid.axe.x, grid.axe.y))).toBe(true)
        }
        const result = playPerfectly(grid)
        expect(result.solved, result.reason).toBe(true)
        expect(result.deaths).toBe(0)
      })
    }
  })
}

it('Difficult increases hazards while keeping the introductory and relief fields quiet', () => {
  let extra = 0
  for (const level of levels) {
    const grid = fromJSON(level)
    const easy = createGame(grid, undefined, 'easy')
    const hard = createGame(grid, undefined, 'difficult')
    expect(hard.traps.size).toBeGreaterThanOrEqual(easy.traps.size)
    extra += hard.traps.size - grid.traps.length
    if (!grid.traps.length) expect(hard.traps.size).toBe(0)
    if (grid.hunter) expect(hard.hunter.speed).toBeGreaterThan(easy.hunter.speed)
  }
  expect(extra).toBeGreaterThan(0)
})
