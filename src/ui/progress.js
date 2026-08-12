/**
 * Level completion, persisted best-effort. Private browsing and disabled
 * storage degrade to an in-memory record rather than throwing.
 */

const STORAGE_KEY = 'puzzles:v1'
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

/** Best-run totals across every level cleared so far, for the finale card. */
function totals() {
  const runs = Object.values(read().done)
  return {
    levels: runs.length,
    deaths: runs.reduce((sum, run) => sum + run.deaths, 0),
    ms: runs.reduce((sum, run) => sum + run.ms, 0),
    flawless: runs.filter((run) => run.deaths === 0).length,
  }
}

export { recordWin, isDone, bestFor, doneCount, totals, STORAGE_KEY }
