import { it, expect } from 'vitest'
import { starsFor, targetMs } from './rewards.js'
it('rewards a finish independently of optional clean and time goals', () => {
  const level = { difficulty: { perfectSeconds: 10 } }
  expect(targetMs(level)).toBe(18000)
  expect(starsFor(level, null)).toBe(0)
  expect(starsFor(level, { deaths: 5, ms: 30000 })).toBe(1)
  expect(starsFor(level, { deaths: 0, ms: 30000 })).toBe(2)
  expect(starsFor(level, { deaths: 0, ms: 18000 })).toBe(3)
})
