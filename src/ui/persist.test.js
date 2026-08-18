// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadSave, saveSnapshot, flushNow, savedWhere, onDesktop } from './persist.js'

/**
 * Where the save lives, and what happens when it cannot be written.
 *
 * The desktop path cannot be exercised here — it needs a real Tauri runtime —
 * so what is checked is the browser path and, more importantly, that every
 * failure is survivable. A save that throws on load is a game that will not
 * start, which is a far worse bug than a lost campaign.
 */

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

function install(impl = fakeStorage()) {
  Object.defineProperty(window, 'localStorage', {
    value: impl, configurable: true, writable: true,
  })
  return impl
}

beforeEach(() => { install() })
afterEach(() => { vi.restoreAllMocks() })

describe('in a browser', () => {
  it('knows it is not on the desktop', () => {
    expect(onDesktop()).toBe(false)
  })

  it('returns nothing when there is no save yet', async () => {
    await expect(loadSave('maizes:v1')).resolves.toBeNull()
  })

  it('writes and reads a snapshot back', async () => {
    saveSnapshot('maizes:v1', { done: { 'Warm Up 1': { deaths: 0, ms: 900 } } })
    await flushNow('maizes:v1')
    const back = await loadSave('maizes:v1')
    expect(back.done['Warm Up 1'].ms).toBe(900)
    expect(savedWhere()).toBe('web')
  })

  it('writes straight through rather than deferring', async () => {
    // a deferred write loses the last one when the tab closes
    saveSnapshot('maizes:v1', { done: { a: 1 } })
    expect(JSON.parse(window.localStorage.getItem('maizes:v1')).done.a).toBe(1)
  })
})

describe('when the save is unusable', () => {
  it('starts fresh on corrupt json rather than refusing to boot', async () => {
    window.localStorage.setItem('maizes:v1', '{not json at all')
    await expect(loadSave('maizes:v1')).resolves.toBeNull()
  })

  it('survives storage that throws on read', async () => {
    install({
      getItem: () => { throw new Error('blocked') },
      setItem: () => {}, removeItem: () => {}, clear: () => {},
    })
    await expect(loadSave('maizes:v1')).resolves.toBeNull()
  })

  it('survives storage that throws on write', async () => {
    install({
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
      removeItem: () => {}, clear: () => {},
    })
    expect(() => saveSnapshot('maizes:v1', { done: {} })).not.toThrow()
    await expect(flushNow('maizes:v1')).resolves.toBeUndefined()
  })

  it('survives storage being missing entirely', async () => {
    Object.defineProperty(window, 'localStorage', {
      value: undefined, configurable: true, writable: true,
    })
    await expect(loadSave('maizes:v1')).resolves.toBeNull()
    expect(() => saveSnapshot('maizes:v1', { done: {} })).not.toThrow()
  })
})
