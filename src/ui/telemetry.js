/**
 * Playtest telemetry.
 *
 * Records what a tester did with each level so the difficulty ramp can be
 * argued from evidence instead of from my own runs. It posts straight to
 * Supabase's REST endpoint rather than pulling in `@supabase/supabase-js` —
 * this is one insert with no auth flow and no realtime, and the client library
 * is a large dependency to carry for that.
 *
 * Four properties, in the order they matter:
 *
 * 1. **It is off unless configured.** With no env vars — local dev, the test
 *    suite, anyone who clones this — every call here is a no-op. Telemetry that
 *    fails closed cannot break the game for the sake of a metric.
 *
 * 2. **It never blocks or breaks play.** Every send is fire-and-forget behind a
 *    try/catch. A failed insert costs a queued row, never a frame.
 *
 * 3. **It holds nothing identifying.** A random uuid in localStorage, a build
 *    string, and numbers about levels. No name, no email, no free text. See the
 *    migration for the matching constraint at the database end.
 *
 * 4. **It survives a closed tab.** Events queue in localStorage and flush on
 *    the next load, so the tester who rage-quits on level 28 — exactly the
 *    tester worth hearing from — is not the one whose data is lost.
 */

// Read on each use rather than captured once, so a test can stub the
// environment and exercise the configured path without reloading the module.
const endpoint = () => import.meta.env?.VITE_SUPABASE_URL || ''
const anonKey = () => import.meta.env?.VITE_SUPABASE_ANON_KEY || ''
const build = () => import.meta.env?.VITE_BUILD || 'dev'

const PLAYER_KEY = 'maizes:player'
const QUEUE_KEY = 'maizes:queue'
const CONSENT_KEY = 'maizes:telemetry'
const MAX_QUEUE = 200

const enabled = () => Boolean(endpoint() && anonKey())

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Resolved through `window` rather than taken as a bare global.
 *
 * In a browser the two are the same object. Under the test runner they are not:
 * Node ships its own `localStorage` global that throws unless the process was
 * started with `--localstorage-file`, and it shadows the one jsdom installs on
 * `window`. Reading the bare global there means every write silently no-ops and
 * the tests that check persistence pass without testing anything.
 */
function storage() {
  try { return globalThis.window?.localStorage ?? null } catch { return null }
}

function readStore(key, fallback) {
  try {
    const raw = storage()?.getItem(key)
    return raw === null || raw === undefined ? fallback : JSON.parse(raw)
  } catch { return fallback }
}

function writeStore(key, value) {
  try { storage()?.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

/** Stable per browser, random, and meaningless outside this table. */
function playerId() {
  let id = null
  try { id = storage()?.getItem(PLAYER_KEY) ?? null } catch { /* unavailable */ }
  if (!id) {
    id = uuid()
    try { storage()?.setItem(PLAYER_KEY, id) } catch { /* unavailable */ }
  }
  return id
}

const sessionId = uuid()

/**
 * Opt-out, remembered. Default on: a playtest build handed to someone who was
 * asked to test it is a context where recording is expected, and the level list
 * says so in plain words. Turning it off must still be one click.
 */
const isRecording = () => readStore(CONSENT_KEY, true) !== false
function setRecording(value) {
  writeStore(CONSENT_KEY, !!value)
  return !!value
}
const toggleRecording = () => setRecording(!isRecording())

function viewport() {
  try { return `${window.innerWidth}x${window.innerHeight}` } catch { return null }
}

function isTouch() {
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return null }
}

/** Post a batch. Resolves true only when the rows are definitely stored. */
async function post(rows) {
  if (!enabled() || rows.length === 0) return true
  try {
    const key = anonKey()
    const response = await fetch(`${endpoint()}/rest/v1/play_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
      keepalive: true,          // survives the tab closing, up to 64kb
    })
    return response.ok
  } catch {
    return false
  }
}

function queue(rows) {
  const pending = readStore(QUEUE_KEY, [])
  // drop oldest first: a queue that grew past this is one nobody is reading
  writeStore(QUEUE_KEY, [...pending, ...rows].slice(-MAX_QUEUE))
}

/** Send anything left over from a previous session. Safe to call repeatedly. */
async function flush() {
  if (!enabled() || !isRecording()) return
  const pending = readStore(QUEUE_KEY, [])
  if (pending.length === 0) return
  writeStore(QUEUE_KEY, [])
  if (!(await post(pending))) queue(pending)
}

/**
 * Record one event. Never throws, never awaited by a caller that is drawing.
 *
 * @param {string} event  one of the four the table's check constraint allows
 * @param {object} fields level_name, level_index, deaths, ms, restarts
 */
function record(event, fields = {}) {
  if (!enabled() || !isRecording()) return

  const row = {
    player_id: playerId(),
    session_id: sessionId,
    build: build(),
    event,
    level_name: fields.levelName ?? null,
    level_index: fields.levelIndex ?? null,
    deaths: fields.deaths ?? null,
    ms: fields.ms == null ? null : Math.round(fields.ms),
    restarts: fields.restarts ?? null,
    viewport: viewport(),
    touch: isTouch(),
  }

  post([row]).then((ok) => { if (!ok) queue([row]) }).catch(() => queue([row]))
}

export {
  record,
  flush,
  enabled,
  playerId,
  isRecording,
  setRecording,
  toggleRecording,
  build,
  PLAYER_KEY,
  QUEUE_KEY,
  CONSENT_KEY,
}
