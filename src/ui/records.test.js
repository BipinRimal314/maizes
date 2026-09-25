// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { setProgressProfile, recordWin, bestFor, isDone, resetCache, hydrate, recordDiscovery, journalEntries, startSpeedrun, parFor } from './progress.js'
beforeEach(() => {
  const data = new Map()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) } })
  resetCache()
})
it('shares unlocks but isolates easy, difficult, and dev performance', () => {
  setProgressProfile('easy'); recordWin('Field 001', { ms: 10000, deaths: 0 })
  setProgressProfile('difficult'); expect(isDone('Field 001')).toBe(true); expect(bestFor('Field 001')).toBeNull()
  recordWin('Field 001', { ms: 12000, deaths: 1 })
  setProgressProfile('easy', true); expect(bestFor('Field 001')).toBeNull()
  recordWin('Field 002', { ms: 100, deaths: 0 }); expect(isDone('Field 002')).toBe(false)
  setProgressProfile('easy'); expect(bestFor('Field 001').ms).toBe(10000)
  setProgressProfile('difficult'); expect(bestFor('Field 001').ms).toBe(12000)
})
it('preserves old completion history without claiming its times under new rules', async () => {
  window.localStorage.setItem('maizes:journey-v2', JSON.stringify({ done: { 'Field 100': { ms: 123, deaths: 0 } } }))
  await hydrate('journey-v2'); setProgressProfile('easy')
  expect(isDone('Field 100')).toBe(true); expect(bestFor('Field 100')).toBeNull()
})
it('persists discoveries and keeps pursuit targets within their ruleset', async () => {
  await hydrate('journey-v2'); setProgressProfile('easy')
  recordDiscovery({ id: 'ribbon', text: 'Two knots.' })
  recordWin('one', { ms: 9000, deaths: 0 }); startSpeedrun([{ name: 'one', chapter: 'first' }])
  setProgressProfile('difficult'); expect(parFor('one')).toBeNull()
  resetCache(); await hydrate('journey-v2'); setProgressProfile('easy')
  expect(journalEntries()).toEqual([{ id: 'ribbon', text: 'Two knots.' }]); expect(parFor('one')).toBe(9000)
})
