/**
 * When each piece of the story is shown.
 *
 * The words themselves are in `src/content.js` — this file is only the
 * sequencing, so a rewrite never means reading logic and a logic change never
 * means scrolling past prose.
 *
 * Kept entirely separate from the engine and the generator. Not one line here
 * changes what a level is or whether it can be finished; a beat is a card shown
 * between levels and nothing more. That separation is the point — the whole
 * repo rests on levels being provably beatable, and a story that could reach
 * into the rules would be a story that could break the proof.
 */

import {
  PROLOGUE, CHAPTER_BEATS, BARGAIN, TOO_LATE, SPEEDRUN_BRIEF, ENDING, LOST_HER,
  WHISPERS,
} from '../content.js'

const whisperFor = (levelName) => WHISPERS[levelName] ?? null

/** The beat owed after finishing `chapter`, or null. */
const beatAfterChapter = (chapter) => CHAPTER_BEATS[chapter] ?? null

/**
 * Which beats finishing level `index` has earned, in the order they play.
 *
 * Pure, and separate from the component, because this is the fiddliest thing in
 * the story layer: it has to tell apart the last level of a chapter from the
 * last level of the game, and the end of the first run from the end of the
 * second. Testing that through a mounted component would mean actually winning
 * thirty mazes.
 *
 * @param {object[]} levels    the campaign, in order
 * @param {number}   index     the level just finished
 * @param {object}   run       { active, complete } — speedrun state
 */
function beatsAfterLevel(levels, index, run = { active: false, complete: false }) {
  const level = levels[index]
  if (!level) return []

  const isLastLevel = index === levels.length - 1
  const isLastOfChapter = isLastLevel || levels[index + 1].chapter !== level.chapter

  // The second time through, the story is already told. The only thing left to
  // say is whether every field has been beaten — and that is not decided by
  // which level happens to be last, but by whether any are still outstanding.
  if (run.active) return run.complete ? [ENDING] : []

  const beats = []
  if (isLastOfChapter) {
    const beat = beatAfterChapter(level.chapter)
    if (beat) beats.push(beat)
  }
  if (isLastLevel) beats.push(BARGAIN, TOO_LATE, SPEEDRUN_BRIEF)

  return beats
}

export {
  PROLOGUE,
  CHAPTER_BEATS,
  BARGAIN,
  TOO_LATE,
  SPEEDRUN_BRIEF,
  ENDING,
  LOST_HER,
  WHISPERS,
  whisperFor,
  beatAfterChapter,
  beatsAfterLevel,
}
