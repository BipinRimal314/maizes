/**
 * What the player has done, persisted best-effort. Private browsing and
 * disabled storage degrade to an in-memory record rather than throwing.
 *
 * Three things live here:
 *
 *   done       best run per level: fewest deaths, then fastest
 *   story      which narrative beats have been shown, so none repeats
 *   speedrun   the second run through, and the times it has to beat
 *
 * The speedrun's `par` is a **snapshot**, copied out of `done` at the moment
 * the run starts and never updated after. Reading the live bests instead would
 * move the target every time the player improved, so beating your own time
 * would be impossible by construction — you would be racing a number that
 * always equalled your best.
 */

const STORAGE_KEY = 'maizes:v1'

const EMPTY = () => ({
  done: {},
  story: {},
  speedrun: { active: false, par: {}, beaten: {}, finished: false },
})

let cache = null

function read() {
  if (cache) return cache
  cache = EMPTY()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed.done === 'object') {
      // merge rather than replace, so a save written by an older build without
      // the story or speedrun keys still loads
      cache = { ...EMPTY(), ...parsed }
      cache.story = parsed.story ?? {}
      cache.speedrun = { ...EMPTY().speedrun, ...(parsed.speedrun ?? {}) }
    }
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

  // A speedrun leg is judged against the frozen par, not against `done`.
  if (store.speedrun.active) {
    const par = store.speedrun.par[name]
    if (par != null && ms < par) {
      const best = store.speedrun.beaten[name]
      if (best == null || ms < best) store.speedrun.beaten[name] = ms
    }
  }

  write()
}

const isDone = (name) => !!read().done[name]
const bestFor = (name) => read().done[name] || null
const doneCount = () => Object.keys(read().done).length

/**
 * How far along the trail the player has been let.
 *
 * The campaign is a mystery, so a level is only offered once the one before it
 * is finished. Counted as an unbroken run from the start rather than as a total
 * — finishing level 12 in developer mode must not hand a real player levels
 * 2 through 12 they never walked.
 */
function unlockedCount(levels) {
  const store = read()
  let reached = 0
  while (reached < levels.length && store.done[levels[reached].name]) reached += 1
  return Math.min(reached + 1, levels.length)
}

const isUnlocked = (levels, index) => index < unlockedCount(levels)

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

/** Ears of maize picked, counted only from levels actually finished. */
function maizeCollected(levels) {
  const store = read()
  return levels.reduce(
    (sum, level) => sum + (store.done[level.name] ? level.f.length : 0),
    0
  )
}

// ---------------------------------------------------------------- story beats

const hasSeen = (id) => read().story[id] === true
function markSeen(id) {
  read().story[id] = true
  write()
}

// ------------------------------------------------------------------ speedrun

/** Freeze the current bests as the times to beat, and start the second run. */
function startSpeedrun(levels) {
  const store = read()
  const par = {}
  for (const level of levels) {
    const best = store.done[level.name]
    if (best) par[level.name] = best.ms
  }
  store.speedrun = { active: true, par, beaten: {}, finished: false }
  write()
  return store.speedrun
}

const speedrunActive = () => read().speedrun.active === true
const speedrunFinished = () => read().speedrun.finished === true
const parFor = (name) => read().speedrun.par[name] ?? null
const beatenTime = (name) => read().speedrun.beaten[name] ?? null
const isBeaten = (name) => read().speedrun.beaten[name] != null

function speedrunProgress(levels) {
  const store = read()
  const target = levels.filter((level) => store.speedrun.par[level.name] != null)
  return {
    beaten: target.filter((level) => store.speedrun.beaten[level.name] != null).length,
    total: target.length,
  }
}

/** True once every level with a par has been beaten. */
function speedrunComplete(levels) {
  const { beaten, total } = speedrunProgress(levels)
  return total > 0 && beaten === total
}

function finishSpeedrun() {
  read().speedrun.finished = true
  write()
}

/** Testing seam: drop the in-memory copy so the next read hits storage again. */
function resetCache() {
  cache = null
}

export {
  recordWin, isDone, bestFor, doneCount, totals, maizeCollected,
  unlockedCount, isUnlocked,
  hasSeen, markSeen,
  startSpeedrun, speedrunActive, speedrunFinished, speedrunComplete,
  speedrunProgress, parFor, beatenTime, isBeaten, finishSpeedrun,
  resetCache, STORAGE_KEY,
}
