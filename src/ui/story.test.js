// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  recordWin, bestFor, hasSeen, markSeen, maizeCollected, totals, doneCount, walkedMs,
  startSpeedrun, speedrunActive, speedrunComplete, speedrunProgress,
  parFor, isBeaten, finishSpeedrun, speedrunFinished, resetCache, hydrate,
  unlockedCount, isUnlocked, speedrunGaveUp, concedeSpeedrun, speedrunFields,
} from './progress.js'
import { isDevMode, setDevMode, initDevMode } from './devmode.js'
import {
  PROLOGUE, BARGAIN, TOO_LATE, SPEEDRUN_BRIEF, ENDING, LOST_HER, CHAPTER_BEATS,
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

  it('puts the hat in the player\'s hands before it takes it away again', () => {
    /*
     * The reveal only lands on someone who was given the piece to forget. If
     * the prologue never mentions the hat, the yellow shape is just the player
     * token, and "it is my hat" is news rather than a payoff.
     */
    const planted = PROLOGUE.lines.some((l) => /\bhat\b/.test(l.text))
    expect(planted, 'nothing plants the hat before the reveal pays it off').toBe(true)
  })

  it('reveals the hat only after the player has moved it for a while', () => {
    /*
     * The reveal lands as a payoff or not at all. Expressed as a fraction of
     * the campaign rather than an absolute level number, because the campaign
     * gets re-cut: the debt is "long enough to have stopped noticing the yellow
     * shape", which is a proportion of the walk, not a count of fields.
     *
     * A chapter beat fires after its *last* level, so that is the index that
     * decides when the player hears it.
     */
    const revealChapter = Object.entries(CHAPTER_BEATS)
      .find(([, beat]) => beat.lines.some((l) => l.text.includes('my hat')))?.[0]
    expect(revealChapter).toBeTruthy()
    const lastLevel = levels.findLastIndex((l) => l.chapter === revealChapter)
    const through = (lastLevel + 1) / levels.length
    expect(through, 'too early to be a payoff').toBeGreaterThan(0.35)
    expect(through, 'too late — most players will never hear it').toBeLessThan(0.75)
  })

  it('is shown once and then remembered', async () => {
    expect(hasSeen(PROLOGUE.id)).toBe(false)
    markSeen(PROLOGUE.id)
    expect(hasSeen(PROLOGUE.id)).toBe(true)
    resetCache()
    await hydrate()
    expect(hasSeen(PROLOGUE.id), 'progress cache should not affect dev mode').toBe(true)
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
  // act two races the last field of every chapter, not the whole campaign
  const raced = speedrunFields(levels)

  function finishCampaign(ms = 20000) {
    for (const level of levels) recordWin(level.name, { deaths: 1, ms })
  }

  it('promises act two the length act two actually is', () => {
    /*
     * The brief tells the player how many fields are left. It is prose, so
     * nothing else makes it true — and a campaign re-cut changes the number
     * without touching the sentence. Guard it.
     */
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
      'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
    const said = SPEEDRUN_BRIEF.lines
      .flatMap((line) => line.text.toLowerCase().match(/[a-z]+/g) ?? [])
      .filter((word) => words.includes(word))
      .map((word) => words.indexOf(word) + 1)
    expect(said, 'the brief should name how many fields are left').toContain(raced.length)
  })

  it('races one field per chapter, and only those', () => {
    finishCampaign()
    startSpeedrun(levels)

    const chapters = [...new Set(levels.map((l) => l.chapter))]
    expect(raced).toHaveLength(chapters.length)
    expect(raced.map((l) => l.chapter)).toEqual(chapters)

    // it is the field whose chapter beat the player just heard
    for (const level of raced) expect(parFor(level.name)).not.toBeNull()
    const rest = levels.filter((l) => !raced.includes(l))
    expect(rest.length, 'act two should be shorter than act one').toBeGreaterThan(0)
    for (const level of rest) expect(parFor(level.name)).toBeNull()
  })

  it('is not running until the bargain starts it', () => {
    finishCampaign()
    expect(speedrunActive()).toBe(false)
    startSpeedrun(levels)
    expect(speedrunActive()).toBe(true)
  })

  it('freezes the times to beat at the moment it starts', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    expect(parFor(raced[0].name)).toBe(20000)

    // improving afterwards must not drag the target down with it
    recordWin(raced[0].name, { deaths: 0, ms: 12000 })
    expect(parFor(raced[0].name), 'the target moved').toBe(20000)
    expect(bestFor(raced[0].name).ms).toBe(12000)
  })

  it('counts a level as beaten only when the run is genuinely faster', () => {
    finishCampaign(20000)
    startSpeedrun(levels)

    recordWin(raced[0].name, { deaths: 0, ms: 20000 })
    expect(isBeaten(raced[0].name), 'a tie is not faster').toBe(false)

    recordWin(raced[0].name, { deaths: 0, ms: 19999 })
    expect(isBeaten(raced[0].name)).toBe(true)
  })

  it('is only complete when every field has been beaten', () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    expect(speedrunComplete(levels)).toBe(false)

    for (const level of raced.slice(0, -1)) {
      recordWin(level.name, { deaths: 0, ms: 5000 })
    }
    expect(speedrunProgress(levels)).toEqual({ beaten: raced.length - 1, total: raced.length })
    expect(speedrunComplete(levels), 'one field short still counts as complete').toBe(false)

    recordWin(raced[raced.length - 1].name, { deaths: 0, ms: 5000 })
    expect(speedrunComplete(levels)).toBe(true)
  })

  it('does not count a level that was never finished the first time', () => {
    // no par means no race: it cannot be beaten and cannot block the ending
    recordWin(raced[0].name, { deaths: 0, ms: 9000 })
    startSpeedrun(levels)
    expect(speedrunProgress(levels).total).toBe(1)
    expect(parFor(raced[1].name)).toBeNull()
  })

  it('survives a reload mid-run', async () => {
    finishCampaign(20000)
    startSpeedrun(levels)
    recordWin(raced[0].name, { deaths: 0, ms: 8000 })

    resetCache()
    await hydrate()
    expect(speedrunActive()).toBe(true)
    expect(parFor(raced[0].name)).toBe(20000)
    expect(isBeaten(raced[0].name)).toBe(true)
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
  it('loads without the story or speedrun keys', async () => {
    window.localStorage.setItem('maizes:v1', JSON.stringify({
      done: { 'Warm Up 1': { deaths: 2, ms: 11000 } },
    }))
    resetCache()
    await hydrate()

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

  it('can be toggled for the current session', () => {
    setDevMode(true)
    expect(isDevMode()).toBe(true)
    resetCache()
    expect(isDevMode(), 'progress cache should not affect dev mode').toBe(true)
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
    url('?dev=1')
    expect(initDevMode()).toBe(true)
    window.localStorage.setItem('maizes:dev', '1')
    url('')
    expect(initDevMode(), 'normal URL must discard even a stored dev flag').toBe(false)
  })
})

describe('a chapter card is an interlude, not an exit', () => {
  /*
   * The bug this covers: finishing a chapter enqueued its beat and cleared the
   * current level, so dismissing the card dropped the player on the level list.
   * "next level" quietly meant "stop playing".
   *
   * App resumes at `index + 1` whenever beats fire on a level that is not the
   * last, so what has to hold is that such a level always exists and always
   * begins the next chapter.
   */
  const boundaries = levels
    .map((level, i) => ({ level, i }))
    .filter(({ level, i }) => levels[i + 1] && levels[i + 1].chapter !== level.chapter)

  it('every chapter that owes a beat has a level to go on to', () => {
    expect(boundaries.length).toBeGreaterThan(0)
    for (const { level, i } of boundaries) {
      const beats = beatsAfterLevel(levels, i, { active: false, complete: false })
      if (beats.length === 0) continue
      expect(levels[i + 1], `nothing after ${level.name}`).toBeTruthy()
      expect(levels[i + 1].chapter).not.toBe(level.chapter)
    }
  })

  it('only the final level has nowhere to resume to', () => {
    const last = levels.length - 1
    expect(beatsAfterLevel(levels, last, { active: false, complete: false }).length)
      .toBeGreaterThan(0)
    expect(levels[last + 1]).toBeUndefined()
  })
})

describe('a build handed to other people', () => {
  // an afterEach, not a line at the end of the test: a failing assertion would
  // otherwise leave the stub in place and take the next test down with it
  afterEach(() => { vi.unstubAllEnvs() })

  it('cannot have developer mode turned on at all', () => {
    /*
     * `?dev` unlocks all thirty levels and puts back the tags that name three
     * of the story's revelations. On a shared build a tester who idly tries it
     * should get the game, not the ending — so with VITE_NO_DEV set there is
     * nothing to turn on, including a flag left in storage from before.
     */
    vi.stubEnv('VITE_NO_DEV', '1')

    setDevMode(true)
    expect(isDevMode()).toBe(false)

    Object.defineProperty(window, 'location', {
      value: { search: '?dev=1' }, configurable: true, writable: true,
    })
    expect(initDevMode()).toBe(false)
    expect(isDevMode()).toBe(false)
  })

  it('still allows it on a normal build', () => {
    setDevMode(true)
    expect(isDevMode()).toBe(true)
    setDevMode(false)
  })
})

describe('the other ending', () => {
  function finishCampaign(ms = 20000) {
    for (const level of levels) recordWin(level.name, { deaths: 1, ms })
  }

  it('is not reached by being slow', () => {
    finishCampaign()
    startSpeedrun(levels)
    // failing every leg of the run is not conceding; nothing has happened yet
    for (const level of levels) recordWin(level.name, { deaths: 9, ms: 90000 })
    expect(speedrunGaveUp()).toBe(false)
    expect(speedrunFinished()).toBe(false)
  })

  it('is reached by choosing it', () => {
    finishCampaign()
    startSpeedrun(levels)
    concedeSpeedrun()
    expect(speedrunGaveUp()).toBe(true)
  })

  it('survives a reload', async () => {
    finishCampaign()
    startSpeedrun(levels)
    concedeSpeedrun()
    resetCache()
    await hydrate()
    expect(speedrunGaveUp()).toBe(true)
  })

  it('does not confiscate the true ending', () => {
    /*
     * Giving up records where he stopped; it does not close the road. Beat
     * every field afterwards and the rescue still lands — a player who put it
     * down for a month and came back should not be locked out of the ending by
     * a button they pressed in a bad mood.
     */
    finishCampaign(20000)
    startSpeedrun(levels)
    concedeSpeedrun()

    for (const level of levels) recordWin(level.name, { deaths: 0, ms: 5000 })
    expect(speedrunComplete(levels)).toBe(true)
    expect(beatsAfterLevel(levels, 0, { active: true, complete: true })).toEqual([ENDING])
  })

  it('has its own words, not a re-run of the good one', () => {
    expect(LOST_HER.id).not.toBe(ENDING.id)
    const said = LOST_HER.lines.map((l) => l.text).join(' ')
    expect(said).toMatch(/shawl/)
    expect(said).not.toMatch(/thank you for helping me reach my daughter/i)
  })
})

describe('the voices are people', () => {
  it('gives the big bandit a tic before he is ever seen', () => {
    /*
     * He counts — ears, steps, carts, days, miles — so that when he counts the
     * maize at the camp the player already knows whose voice that is. If this
     * ever drops below a few chapters the payoff at the bargain is unearned.
     */
    const counting = new RegExp(
      '\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|'
      + 'twenty|thirty|forty|fifty|hundred|half|first|second)\\b',
      'i'
    )
    const chapters = Object.values(CHAPTER_BEATS).filter((beat) =>
      beat.lines.some((l) => l.v === 'v' && counting.test(l.text))
    )
    expect(chapters.length).toBeGreaterThanOrEqual(4)
    // and the payoff, where the tic is finally attached to a face
    expect(TOO_LATE.lines.some((l) => l.text.includes('counts'))).toBe(true)
  })

  it('thins Maizy out as the distance grows', () => {
    // whole sentences early, fragments late: the last thing she manages is one
    // word, and at the camp there is nothing at all
    const hers = (beat) => beat.lines
      .filter((l) => l.v === 'v' && /papa/i.test(l.text))
      .map((l) => l.text.replace(/[….—]/g, '').trim().split(/\s+/).length)

    const early = hers(CHAPTER_BEATS['Two Trips'])
    const late = hers(CHAPTER_BEATS['The Lit Wood'])
    expect(early.length).toBeGreaterThan(0)
    expect(late.length).toBeGreaterThan(0)
    expect(Math.min(...late)).toBeLessThan(Math.min(...early))
  })

  it('leaves her silent at the camp', () => {
    const spoken = BARGAIN.lines.filter((l) => l.v === 'v').map((l) => l.text.trim())
    expect(spoken.every((line) => /^[—-]?$/.test(line))).toBe(true)
  })
})

// Old saves may contain fields removed from the story campaign.
describe('a shorter campaign with an existing save', () => {
  it('counts only current fields without deleting the old records', () => {
    recordWin('Warm Up 2', { deaths: 3, ms: 18000 })
    recordWin(levels[0].name, { deaths: 1, ms: 9000 })
    expect(totals(levels)).toEqual({ levels: 1, deaths: 1, ms: 9000, flawless: 0 })
    expect(doneCount(levels)).toBe(1)
    expect(walkedMs(levels)).toBe(9000)
    expect(bestFor('Warm Up 2')).toEqual({ deaths: 3, ms: 18000 })
    expect(unlockedCount(levels)).toBe(2)
  })
})

describe('campaign saves', () => {
  it('keeps the old campaign intact while the hundred-field journey starts fresh', async () => {
    window.localStorage.setItem('maizes:v1', JSON.stringify({ done: { 'Warm Up 1': { deaths: 1, ms: 9000 } }, story: { prologue: true } }))
    await hydrate('journey-v2')
    expect(hasSeen('prologue')).toBe(false)
    expect(doneCount()).toBe(0)
    recordWin('Field 001', { deaths: 0, ms: 6000 })
    markSeen('prologue')
    resetCache()
    await hydrate('journey-v2')
    expect(bestFor('Field 001')).toEqual({ deaths: 0, ms: 6000 })
    expect(hasSeen('prologue')).toBe(true)
    const legacy = JSON.parse(window.localStorage.getItem('maizes:v1'))
    expect(legacy.done['Warm Up 1'].ms).toBe(9000)
  })
})
