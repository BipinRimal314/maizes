/**
 * Level completion, persisted best-effort. Private browsing and disabled
 * storage degrade to an in-memory record rather than throwing.
 */

const STORAGE_KEY = 'mazochist:v2'
let cache = null

function read() {
  if (cache) return cache
  cache = { done: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed.done === 'object') cache = parsed
  } catch { /* unavailable storage is not an error worth surfacing */ }
  return cache
}

function write() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)) } catch { /* quota or privacy mode */ }
}

function recordWin(name, { deaths, ms }) {
  const store = read()
  const previous = store.done[name]
  if (!previous || deaths < previous.deaths || (deaths === previous.deaths && ms < previous.ms)) {
    store.done[name] = { deaths, ms }
  }
  write()
}

const isDone = (name) => !!read().done[name]
const bestFor = (name) => read().done[name] || null
const doneCount = () => Object.keys(read().done).length

export { recordWin, isDone, bestFor, doneCount, STORAGE_KEY }
