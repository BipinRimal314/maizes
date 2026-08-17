// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordWin, bestFor, hasSeen, markSeen, maizeCollected,
  startSpeedrun, speedrunActive, speedrunComplete, speedrunProgress,
  parFor, isBeaten, finishSpeedrun, speedrunFinished, resetCache,
  unlockedCount, isUnlocked,
} from './progress.js'
import { isDevMode, setDevMode, initDevMode } from './devmode.js'
import {
  PROLOGUE, BARGAIN, TOO_LATE, SPEEDRUN_BRIEF, ENDING, CHAPTER_BEATS,
  beatAfterChapter, beatsAfterLevel,
} from './story.js'
import levelData from '../../public/levels.json'

/**
 * The story is a layer over the campaign, and the only part of it with real
 * mechanics is the speedrun. What is worth pinning down is that its target is a
 * frozen snapshot: read the live bests instead and beating your own time
 * becomes impossible by construction, because the number you are racing would
 * move every time you improved.
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

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage(), configurable: true, writable: true,
  })
  resetCache()
})

const levels = levelData

describe('story beats', () => {
  it('has one for every chapter except the last', () => {
    const chapters = [...new Set(levels.map((l) => l.chapter))]
    for (const chapter of chapters.slice(0, -1)) {
      expect(beatAfterChapter(chapter), `no beat after "${chapter}"`).toBeTruthy()
    }
  })

  it('names chapters that actually exist, so no beat is orphaned', () => {
    const chapters = new Set(levels.map((l) => l.chapter))
    for (const name of Object.keys(CHAPTER_BEATS)) {
      expect(chapters.has(name), `beat keyed to missing chapter "${name}"`).toBe(true)
    }
  })

  it('gives every beat a unique id', () => {
    const ids = [
      PROLOGUE.id, BARGAIN.id, TOO_LATE.id, SPEEDRUN_BRIEF.id, ENDING.id,
      ...Object.values(CHAPTER_BEATS).map((b) => b.id),
    ]
    expect(new Set(ids).size, 'duplicate beat id would swallow a beat').toBe(ids.length)
  })

  it('reveals the hat only after the player has moved it for a while', () => {
    // the reveal lands as a payoff or not at all; it must not be in chapter one
    const revealChapter = Object.entries(CHAPTER_BEATS)
      .find(([, beat]) => beat.lines.some((l) => l.text.includes('my hat')))?.[0]
    expect(revealChapter).toBeTruthy()
    const firstLevel = levels.findIndex((l) => l.chapter === revealChapter)
    expect(firstLevel).toBeGreaterThan(10)
  })

  it('is shown once and then remembered', () => {
    expect(hasSeen(PROLOGUE.id)).toBe(false)
    markSeen(PROLOGUE.id)
    expect(hasSeen(PROLOGUE.id)).toBe(true)
    resetCache()
    expect(hasSeen(PROLOGUE.id), 'did not survive a reload').toBe(true)
  })
})

describe('which beats a level earns', () => {
  const firstRun = { active: false, complete: false }
  const lastIndex = levels.length - 1

  it('gives nothing for a level in the middle of a chapter', () => {
    const midChapter = levels.findIndex(
      (l, i) => i > 0 && levels[i + 1] && levels[i + 1].chapter === l.chapter
    )
    expect(beatsAfterLevel(levels, midChapter, firstRun)).toEqual([])
  })

  it('gives the chapter beat on the last level of a chapter', () => {
    const boundary = levels.findIndex(
      (l, i) => levels[i + 1] && levels[i + 1].chapter !== l.chapter
    )
    const beats = beatsAfterLevel(levels, boundary, firstRun)
    expect(beats).toHaveLength(1)
    expect(beats[0]).toBe(beatAfterChapter(levels[boundary].chapter))
  })

  it('runs the whole ending sequence after the last level, in order', () => {
    const beats = beatsAfterLevel(levels, lastIndex, firstRun)
    const ids = beats.map((b) => b.id)
    // the last chapter has no beat of its own, so it goes straight to the camp
    expect(ids.slice(-3)).toEqual([BARGAIN.id, TOO_LATE.id, SPEEDRUN_BRIEF.id])
  })

  it('tells no story at all on the second run through', () => {
    for (let i = 0; i < levels.length; i++) {
      expect(beatsAfterLevel(levels, i, { active: true, complete: false })).toEqual([])
    }
  })

  it('ends the speedrun on whichever level completes it, not on the last one', () => {
    // the field that finishes the run is whichever one the player leaves until
    // last, and that is rarely level thirty
    const middle = Math.floor(levels.length / 2)
    expect(beatsAfterLevel(levels, middle, { active: true, complete: true })).toEqual([ENDING])
  })

  it('shrugs at an index that is not a level', () => {
    expect(beatsAfterLevel(levels, 999, firstRun)).toEqual([])
    expect(beatsAfterLevel([], 0, firstRun)).toEqual([])
  })
})

describe('the maize tally', () => {
  it('counts ears only from levels actually finished', () => {
    expect(maizeCollected(levels)).toBe(0)
    recordWin(levels[0].name, { deaths: 0, ms: 9000 })
    expect(maizeCollected(levels)).toBe(levels[0].f.length)
  })

  it('adds up to every ear in the game once all are done', () => {
    for (const level of levels) recordWin(level.name, { deaths: 1, ms: 10000 })
    const everything = levels.reduce((sum, l) => sum + l.f.length, 0)
    expect(maizeCollected(levels)).toBe(everything)
  })
})

describe('the speedrun', () => {
  function finishCampaign(ms = 20000) {
    for (const level of levels) recordWin(level.name, { deaths: 1, ms })
  }

  it('is not running until the bargain starts it', () => {
    finishCampaign()
    expect(speedrunActive()).toBe(false)
    startSpeedrun(levels)
    expect(speedrunActive()).toBe(true)
  })

  it('freezes the times to beat at the moment it starts', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    expect(parFor(levels[0].name)).toBe(20000)

    // improving afterwards must not drag the target down with it
    recordWin(levels[0].name, { deaths: 0, ms: 12000 })
    expect(parFor(levels[0].name), 'the target moved').toBe(20000)
    expect(bestFor(levels[0].name).ms).toBe(12000)
  })

  it('counts a level as beaten only when the run is genuinely faster', () => {
    finishCampaign(20000)
    startSpeedrun(levels)

    recordWin(levels[0].name, { deaths: 0, ms: 20000 })
    expect(isBeaten(levels[0].name), 'a tie is not faster').toBe(false)

    recordWin(levels[0].name, { deaths: 0, ms: 19999 })
    expect(isBeaten(levels[0].name)).toBe(true)
  })

  it('is only complete when every field has been beaten', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    expect(speedrunComplete(levels)).toBe(false)

    for (const level of levels.slice(0, -1)) {
      recordWin(level.name, { deaths: 0, ms: 5000 })
    }
    expect(speedrunProgress(levels)).toEqual({ beaten: levels.length - 1, total: levels.length })
    expect(speedrunComplete(levels), 'one field short still counts as complete').toBe(false)

    recordWin(levels[levels.length - 1].name, { deaths: 0, ms: 5000 })
    expect(speedrunComplete(levels)).toBe(true)
  })

  it('does not count a level that was never finished the first time', () => {
    // no par means no race: it cannot be beaten and cannot block the ending
    recordWin(levels[0].name, { deaths: 0, ms: 9000 })
    startSpeedrun(levels)
    expect(speedrunProgress(levels).total).toBe(1)
    expect(parFor(levels[1].name)).toBeNull()
  })

  it('survives a reload mid-run', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    recordWin(levels[0].name, { deaths: 0, ms: 8000 })

    resetCache()
    expect(speedrunActive()).toBe(true)
    expect(parFor(levels[0].name)).toBe(20000)
    expect(isBeaten(levels[0].name)).toBe(true)
  })

  it('records the rescue at the end', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    expect(speedrunFinished()).toBe(false)
    finishSpeedrun()
    expect(speedrunFinished()).toBe(true)
  })
})

describe('an older save', () => {
  it('loads without the story or speedrun keys', () => {
    window.localStorage.setItem('maizes:v1', JSON.stringify({
      done: { 'Warm Up 1': { deaths: 2, ms: 11000 } },
    }))
    resetCache()

    expect(bestFor('Warm Up 1')).toEqual({ deaths: 2, ms: 11000 })
    expect(speedrunActive()).toBe(false)
    expect(hasSeen(PROLOGUE.id)).toBe(false)
    expect(() => startSpeedrun(levels)).not.toThrow()
  })
})

describe('the trail is walked, not browsed', () => {
  it('offers only the first level on a fresh save', () => {
    expect(unlockedCount(levels)).toBe(1)
    expect(isUnlocked(levels, 0)).toBe(true)
    expect(isUnlocked(levels, 1)).toBe(false)
  })

  it('opens exactly one more each time one is finished', () => {
    recordWin(levels[0].name, { deaths: 0, ms: 9000 })
    expect(unlockedCount(levels)).toBe(2)
    recordWin(levels[1].name, { deaths: 0, ms: 9000 })
    expect(unlockedCount(levels)).toBe(3)
  })

  it('does not hand over levels that were skipped past', () => {
    // finishing level 12 in developer mode must not unlock 2 through 12 for a
    // player who never walked them
    recordWin(levels[11].name, { deaths: 0, ms: 9000 })
    expect(unlockedCount(levels)).toBe(1)
  })

  it('never runs past the end of the campaign', () => {
    for (const level of levels) recordWin(level.name, { deaths: 0, ms: 9000 })
    expect(unlockedCount(levels)).toBe(levels.length)
    expect(isUnlocked(levels, levels.length - 1)).toBe(true)
    expect(isUnlocked(levels, levels.length)).toBe(false)
  })
})

describe('developer mode', () => {
  beforeEach(() => { setDevMode(false) })

  it('is off unless asked for', () => {
    expect(isDevMode()).toBe(false)
  })

  it('turns on and stays on', () => {
    setDevMode(true)
    expect(isDevMode()).toBe(true)
    resetCache()
    expect(isDevMode(), 'did not survive a reload').toBe(true)
  })

  it('is switched by ?dev in the url', () => {
    const url = (search) => {
      Object.defineProperty(window, 'location', {
        value: { search }, configurable: true, writable: true,
      })
    }
    url('?dev')
    expect(initDevMode()).toBe(true)
    url('?dev=0')
    expect(initDevMode()).toBe(false)
    url('')
    expect(initDevMode(), 'no param should leave it alone').toBe(false)
  })
})
