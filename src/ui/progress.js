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
let activeKey = STORAGE_KEY
let activeProfile = null

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
async function hydrate(campaign = null) {
  activeKey = campaign ? `maizes:${campaign}` : STORAGE_KEY
  cache = adopt(await loadSave(activeKey))
  return cache
}

function read() {
  if (cache) return cache
  // nothing hydrated yet: start empty rather than block, and let the boot
  // sequence replace this. Reading before hydrate is a bug, not a state.
  cache = EMPTY()
  return cache
}

/** Unlocks survive revisions; competitive records never cross rulesets. */
function setProgressProfile(difficulty, dev = false) {
  activeProfile = `revamp3:${dev ? 'dev:' : ''}${difficulty}`
}
function recordStore() {
  const store = read()
  if (!activeProfile) return store
  store.profiles ??= {}
  store.profiles[activeProfile] ??= { done: {}, speedrun: EMPTY().speedrun }
  return store.profiles[activeProfile]
}

function recordDiscovery(found) {
  const store = recordStore()
  store.journal ??= {}
  store.journal[found.id] = found
  write()
}
const journalEntries = () => Object.values(recordStore().journal ?? {})

function write() {
  saveSnapshot(activeKey, cache)
}

/** Write anything outstanding immediately — for a window that is closing. */
const flushProgress = () => flushNow(activeKey)

function recordWin(name, { deaths, ms }) {
  const store = recordStore()
  const previous = store.done[name]
  if (!previous || deaths < previous.deaths || (deaths === previous.deaths && ms < previous.ms)) {
    store.done[name] = { deaths, ms }
  }

  if (activeProfile && !activeProfile.includes(':dev:')) {
    // Aggregate entries are completion history, not comparable leaderboard times.
    read().done[name] ??= { deaths, ms }
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
const bestFor = (name) => recordStore().done[name] || null
const doneCount = (levels) => levels ? levels.filter(level => isDone(level.name)).length : Object.keys(read().done).length

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
function totals(levels) {
  const runs = levels
    ? levels.map((level) => recordStore().done[level.name]).filter(Boolean)
    : Object.values(recordStore().done)
  return {
    levels: runs.length,
    deaths: runs.reduce((sum, run) => sum + run.deaths, 0),
    ms: runs.reduce((sum, run) => sum + run.ms, 0),
    flawless: runs.filter((run) => run.deaths === 0).length,
  }
}

/**
 * How long he has been walking: the sum of the player's best time on every
 * field cleared so far.
 *
 * On screen from the first field onward, on purpose. Act two turns on the
 * player having been slow, and a game may only judge a number it showed you.
 * This is that number, and it is the one act two freezes as par.
 */
function walkedMs(levels) {
  return totals(levels).ms
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

/**
 * The fields act two actually races: the last one of every chapter.
 *
 * Act two used to demand all of them again. That is the moment the game is most
 * likely to lose a player — they have just been told they were too slow, and
 * the reply is another full campaign. One field per chapter keeps the shape of
 * the walk (every stretch of the trail is run again, in order, and the last
 * field of a chapter is the one whose beat the player just heard) while making
 * the run something a person will actually finish.
 *
 * Derived from the level list rather than named, so re-cutting the campaign
 * cannot leave this pointing at fields that no longer exist.
 */
function speedrunFields(levels) {
  return levels.filter(
    (level, i) => i === levels.length - 1 || levels[i + 1].chapter !== level.chapter
  )
}

/** Freeze the current bests as the times to beat, and start the second run. */
function startSpeedrun(levels) {
  const store = recordStore()
  const par = {}
  for (const level of speedrunFields(levels)) {
    const best = store.done[level.name]
    if (best) par[level.name] = best.ms
    else if (activeProfile && level.difficulty?.perfectSeconds) par[level.name] = Math.ceil(level.difficulty.perfectSeconds * 1.8) * 1000
  }
  store.speedrun = { active: true, par, beaten: {}, finished: false }
  write()
  return store.speedrun
}

const speedrunActive = () => recordStore().speedrun.active === true
const speedrunFinished = () => recordStore().speedrun.finished === true
const speedrunGaveUp = () => recordStore().speedrun.gaveUp === true

/**
 * Stop looking.
 *
 * Deliberately not terminal: the run stays open and beating every field
 * afterwards still lands the true ending. This records where he gave up, it
 * does not confiscate the story.
 */
function concedeSpeedrun() {
  recordStore().speedrun.gaveUp = true
  write()
}
const parFor = (name) => recordStore().speedrun.par[name] ?? null
const beatenTime = (name) => recordStore().speedrun.beaten[name] ?? null
const isBeaten = (name) => recordStore().speedrun.beaten[name] != null

function speedrunProgress(levels) {
  const store = recordStore()
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
  recordStore().speedrun.finished = true
  write()
}

/** Testing seam: drop the in-memory copy so the next read hits storage again. */
function resetCache() {
  activeKey = STORAGE_KEY
  activeProfile = null
  cache = null
}

export {
  hydrate, flushProgress, setProgressProfile, recordDiscovery, journalEntries,
  recordWin, isDone, bestFor, doneCount, totals, maizeCollected, walkedMs,
  unlockedCount, isUnlocked,
  hasSeen, markSeen,
  startSpeedrun, speedrunFields, speedrunActive, speedrunFinished, speedrunComplete,
  speedrunGaveUp, concedeSpeedrun,
  speedrunProgress, parFor, beatenTime, isBeaten, finishSpeedrun,
  resetCache, STORAGE_KEY,
}
