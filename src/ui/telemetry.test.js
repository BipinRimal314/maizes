// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  record, flush, enabled, playerId,
  isRecording, setRecording, toggleRecording,
  PLAYER_KEY, QUEUE_KEY, CONSENT_KEY,
} from './telemetry.js'

/**
 * A real in-memory Storage, installed on `window`.
 *
 * This environment gives us neither a usable one: Node ships a `localStorage`
 * global that is unavailable without `--localstorage-file`, and jsdom declares
 * `window.localStorage` but leaves it undefined. Without a working store the
 * persistence tests below would pass while proving nothing, because every write
 * would take the silent-degrade path the module is designed to survive.
 */
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    clear: () => { map.clear() },
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
  }
}

const store = () => window.localStorage

function installStorage(impl = fakeStorage()) {
  Object.defineProperty(window, 'localStorage', {
    value: impl, configurable: true, writable: true,
  })
  return impl
}

/**
 * The properties worth holding here are the ones that protect the player, not
 * the ones that protect the metric: telemetry that is off by default without
 * configuration, cannot be turned back on behind the tester's back, and cannot
 * take the game down with it when the network is gone.
 *
 * These run against an unconfigured build — no env vars — which is both the
 * default for anyone who clones this and the case where a mistake would be
 * silent, since nothing would visibly break.
 */

beforeEach(() => {
  installStorage()
  vi.restoreAllMocks()
})

afterEach(() => {
  installStorage()
})

describe('an unconfigured build', () => {
  it('is disabled', () => {
    expect(enabled()).toBe(false)
  })

  it('sends nothing, ever', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    record('level_started', { levelName: 'Warm Up 1', levelIndex: 0 })
    record('level_won', { levelName: 'Warm Up 1', levelIndex: 0, deaths: 2, ms: 9000 })
    await flush()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not even mint a player id until something needs one', () => {
    record('level_started', { levelName: 'Warm Up 1', levelIndex: 0 })
    expect(store().getItem(PLAYER_KEY)).toBeNull()
  })

  it('queues nothing, so an unconfigured build cannot fill up storage', () => {
    for (let i = 0; i < 50; i++) record('level_quit', { levelIndex: i })
    expect(store().getItem(QUEUE_KEY)).toBeNull()
  })
})

describe('the player id', () => {
  it('is a uuid, and is stable across calls', () => {
    const first = playerId()
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(playerId()).toBe(first)
  })

  it('carries nothing about the person', () => {
    // the whole privacy claim rests on this being random rather than derived
    const ids = new Set()
    for (let i = 0; i < 5; i++) {
      store().clear()
      ids.add(playerId())
    }
    expect(ids.size).toBe(5)
  })

  it('survives storage being unavailable', () => {
    // Safari in private mode, and any browser with storage blocked outright
    installStorage({
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
      clear: () => {},
    })
    expect(() => playerId()).not.toThrow()
    expect(playerId()).toBeTruthy()
  })
})

describe('opting out', () => {
  it('records by default on a playtest build', () => {
    expect(isRecording()).toBe(true)
  })

  it('remembers a refusal', () => {
    setRecording(false)
    expect(isRecording()).toBe(false)
    expect(JSON.parse(store().getItem(CONSENT_KEY))).toBe(false)
  })

  it('toggles both ways', () => {
    expect(toggleRecording()).toBe(false)
    expect(isRecording()).toBe(false)
    expect(toggleRecording()).toBe(true)
    expect(isRecording()).toBe(true)
  })

  it('sends nothing at all while opted out', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    global.fetch = fetchSpy
    setRecording(false)

    record('level_won', { levelName: 'No Mercy 1', levelIndex: 19, deaths: 4, ms: 30000 })
    await flush()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(store().getItem(QUEUE_KEY)).toBeNull()
  })
})

describe('a configured build', () => {
  const URL_ = 'https://project.supabase.co'
  const KEY = 'anon-public-key'

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', URL_)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', KEY)
    vi.stubEnv('VITE_BUILD', 'playtest-1')
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('is enabled', () => {
    expect(enabled()).toBe(true)
  })

  it('posts one row to the right table with the anon key', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    global.fetch = fetchSpy

    record('level_won', {
      levelName: 'Company 1', levelIndex: 15, deaths: 3, ms: 18400.7, restarts: 1,
    })
    await Promise.resolve()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`${URL_}/rest/v1/play_events`)
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe(KEY)
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.keepalive).toBe(true)

    const [row] = JSON.parse(init.body)
    expect(row).toMatchObject({
      event: 'level_won',
      level_name: 'Company 1',
      level_index: 15,
      deaths: 3,
      ms: 18401,            // rounded: the column is an integer
      restarts: 1,
      build: 'playtest-1',
    })
    expect(row.player_id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('sends nothing that could identify a person', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    global.fetch = fetchSpy
    record('level_started', { levelName: 'Warm Up 1', levelIndex: 0 })
    await Promise.resolve()

    const [row] = JSON.parse(fetchSpy.mock.calls[0][1].body)
    // an allowlist, so a future field cannot quietly widen what is collected
    expect(Object.keys(row).sort()).toEqual([
      'build', 'deaths', 'event', 'level_index', 'level_name',
      'ms', 'player_id', 'restarts', 'session_id', 'touch', 'viewport',
    ])
  })

  it('keeps a row that failed to send, and delivers it on the next flush', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    record('level_quit', { levelName: 'Nothing Stays 3', levelIndex: 29, deaths: 7, ms: 41000 })
    await Promise.resolve()
    await Promise.resolve()

    const queued = JSON.parse(store().getItem(QUEUE_KEY))
    expect(queued).toHaveLength(1)
    expect(queued[0].event).toBe('level_quit')

    const fetchSpy = vi.fn(async () => ({ ok: true }))
    global.fetch = fetchSpy
    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toHaveLength(1)
    expect(JSON.parse(store().getItem(QUEUE_KEY))).toEqual([])
  })

  it('puts the batch back if the flush itself fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false }))
    record('level_quit', { levelIndex: 12 })
    await Promise.resolve()
    await Promise.resolve()

    await flush()
    expect(JSON.parse(store().getItem(QUEUE_KEY)).length).toBeGreaterThan(0)
  })
})

describe('failure never reaches the player', () => {
  it('does not throw when the network is gone', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    expect(() => record('level_won', { levelIndex: 3, deaths: 1, ms: 5000 })).not.toThrow()
    await expect(flush()).resolves.toBeUndefined()
  })

  it('does not throw when storage is full', () => {
    const full = fakeStorage()
    full.setItem = () => { throw new Error('QuotaExceededError') }
    installStorage(full)
    expect(() => record('level_quit', { levelIndex: 9 })).not.toThrow()
  })

  it('flushing an empty queue is a no-op', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
