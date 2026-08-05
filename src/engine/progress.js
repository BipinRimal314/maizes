/**
 * Level completion, persisted to localStorage.
 *
 * The game previously remembered nothing between sessions — close the tab and
 * every level you had beaten was unmarked. For a game whose whole loop is "die
 * a lot, eventually win", losing the record of the win removes the only reward.
 *
 * Best-effort by design: private browsing and disabled storage must degrade to
 * an in-memory record, never throw.
 */

const STORAGE_KEY = 'mazochist:progress:v1'

let cache = null

function read() {
  if (cache) return cache
  cache = { completed: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.completed === 'object') cache = parsed
    }
  } catch {
    // unreadable or unavailable storage — carry on with an empty record
  }
  return cache
}

function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // quota or privacy mode; the in-memory copy still works for this session
  }
}

/** Records a win, keeping the best result if the level was already beaten. */
function recordCompletion(levelName, { deaths, elapsedMs }) {
  if (!levelName) return
  const store = read()
  const previous = store.completed[levelName]

  if (!previous || deaths < previous.deaths) {
    store.completed[levelName] = { deaths, elapsedMs, at: Date.now() }
  }
  write()
}

function isCompleted(levelName) {
  return !!read().completed[levelName]
}

function getCompletion(levelName) {
  return read().completed[levelName] || null
}

function completedCount() {
  return Object.keys(read().completed).length
}

function resetProgress() {
  cache = { completed: {} }
  write()
}

export {
  recordCompletion,
  isCompleted,
  getCompletion,
  completedCount,
  resetProgress,
  STORAGE_KEY,
}
