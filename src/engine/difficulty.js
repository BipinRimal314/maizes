import { DIRECTIONS, isOpen, key } from './grid.js'

export const DIFFICULTIES = {
  easy: { label: 'Easy', description: 'Fewer traps, a slow ghost, and falls keep your maize.', ghostPace: 0.7 },
  difficult: { label: 'Difficult', description: 'More traps, a faster ghost, and falls reset your maize.', ghostPace: 1.5 },
}
const STORAGE_KEY = 'maizes:difficulty'
export function getDifficulty() {
  try { return localStorage.getItem(STORAGE_KEY) === 'difficult' ? 'difficult' : 'easy' } catch { return 'easy' }
}
export function saveDifficulty(value) {
  const mode = value === 'difficult' ? 'difficult' : 'easy'
  try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* session only */ }
  return mode
}

/** Only empty dead ends gain traps: no new trap can cut a required route. */
export function difficultyGrid(grid, mode) {
  if (!DIFFICULTIES[mode]) return grid
  let traps = [...grid.traps]
  if (mode === 'easy') traps = traps.filter((_, i) => i % 2 === 0)
  else if (traps.length) {
    const reserved = new Set([grid.start, grid.end, ...grid.flags, ...grid.traps,
      ...(grid.wood ?? []), ...(grid.shelters ?? []), ...(grid.discoveries ?? []), grid.axe, grid.charm].filter(Boolean).map(p => key(p.x, p.y)))
    const extra = []
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) {
      if (reserved.has(key(x, y)) || Math.abs(x - grid.start.x) + Math.abs(y - grid.start.y) < 3) continue
      if (DIRECTIONS.filter(d => isOpen(grid, x, y, d)).length === 1) extra.push({ x, y })
    }
    traps.push(...extra.slice(0, Math.max(2, traps.length)))
  }
  return { ...grid, traps,
    hunter: grid.hunter ? { ...grid.hunter, speed: grid.hunter.speed * DIFFICULTIES[mode].ghostPace, sight: mode === 'easy' ? 5 : 9 } : null,
  }
}
