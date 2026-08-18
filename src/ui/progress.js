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

import { loadSave, saveSnapshot, flushNow } from './persist.js'

const STORAGE_KEY = 'maizes:v1'

const EMPTY = () => ({
  done: {},
  story: {},
  speedrun: { active: false, par: {}, beaten: {}, finished: false, gaveUp: false },
})

let cache = null

/** Fold a loaded snapshot into the shape the current build expects. */
function adopt(parsed) {
  if (!parsed || typeof parsed.done !== 'object') return EMPTY()
  // merge rather than replace, so a save written by an older build without the
  // story or speedrun keys still loads
  return {
    ...EMPTY(),
    ...parsed,
    story: parsed.story ?? {},
    speedrun: { ...EMPTY().speedrun, ...(parsed.speedrun ?? {}) },
  }
}

/**
 * Read the save into memory. Called once, before anything renders.
 *
 * On the desktop the save is a file and a file read is asynchronous, but the
 * game reads progress synchronously several times a render. Loading once up
 * front is what lets everything below stay synchronous.
 */
async function hydrate() {
  cache = adopt(await loadSave(STORAGE_KEY))
  return cache
}

function read() {
  if (cache) return cache
  // nothing hydrated yet: start empty rather than block, and let the boot
  // sequence replace this. Reading before hydrate is a bug, not a state.
  cache = EMPTY()
  return cache
}

function write() {
  saveSnapshot(STORAGE_KEY, cache)
}

/** Write anything outstanding immediately — for a window that is closing. */
const flushProgress = () => flushNow(STORAGE_KEY)

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
const speedrunGaveUp = () => read().speedrun.gaveUp === true

/**
 * Stop looking.
 *
 * Deliberately not terminal: the run stays open and beating every field
 * afterwards still lands the true ending. This records where he gave up, it
 * does not confiscate the story.
 */
function concedeSpeedrun() {
  read().speedrun.gaveUp = true
  write()
}
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
  hydrate, flushProgress,
  recordWin, isDone, bestFor, doneCount, totals, maizeCollected,
  unlockedCount, isUnlocked,
  hasSeen, markSeen,
  startSpeedrun, speedrunActive, speedrunFinished, speedrunComplete,
  speedrunGaveUp, concedeSpeedrun,
  speedrunProgress, parFor, beatenTime, isBeaten, finishSpeedrun,
  resetCache, STORAGE_KEY,
}
