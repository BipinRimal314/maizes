/**
 * Journey to Maizy — the narrative laid over the campaign.
 *
 * Kept entirely separate from the engine and the generator. Not one line here
 * changes what a level is or whether it can be finished; a beat is a card shown
 * between levels and nothing more. That separation is the point — the whole
 * repo rests on levels being provably beatable, and a story that could reach
 * into the rules would be a story that could break the proof.
 *
 * Beats are keyed by the chapter they follow, so they fire when a player
 * finishes the last level of that chapter, and each is marked seen so a replay
 * does not show it twice.
 */

const PROLOGUE = {
  id: 'prologue',
  title: 'Journey to Maizy',
  lines: [
    'They came at dusk, for the corn.',
    'They took the corn. They took my daughter too.',
    'By the time I reached the field there was nothing left of either — only a trail of ears dropped into the dark, one at a time, further than any of them fell by accident.',
    'Maizy is leaving me a trail.',
    'I have been following it since.',
  ],
  action: 'follow the trail',
}

/**
 * One beat per chapter, fired when its last level is finished. Keyed by chapter
 * name rather than level number so re-cutting the campaign cannot silently
 * detach a beat from the moment it belongs to.
 */
const CHAPTER_BEATS = {
  'Warm Up': {
    id: 'ch-warm-up',
    lines: [
      'Four fields behind me. The trail keeps going.',
      'So do I.',
    ],
  },
  'Two Trips': {
    id: 'ch-two-trips',
    lines: [
      'More of it now, and further apart. She is spending what she has to keep the line unbroken.',
      'Clever girl. Her mother was clever too.',
    ],
  },
  'First Light': {
    id: 'ch-first-light',
    lines: [
      'The light went out of the sky an hour ago.',
      'I know this ground. I do not know it in the dark.',
    ],
  },
  'The Fog': {
    id: 'ch-the-fog',
    lines: [
      'I can see about as far as my own arm.',
      'The trail is still there every time I reach the place it should be. That is the only thing keeping me walking.',
    ],
  },
  // The hat. The player has been moving a small yellow shape around for
  // twenty levels by now without being told what it is.
  'Company': {
    id: 'ch-company',
    lines: [
      'Something walked behind me for the best part of an hour. It never closed. It never had to hurry.',
      'I did not look back. I kept my eyes on the little yellow shape going on ahead of me in the dark — the one you have been steering this whole time.',
      'It is my hat. I have not taken it off since the field.',
      'It is the only part of me that has kept going in a straight line.',
    ],
  },
  'No Mercy': {
    id: 'ch-no-mercy',
    lines: [
      'Fires. Smoke on the wind, and voices in it.',
      'They are close enough now that I have started walking quietly.',
    ],
  },
  'Forgetting': {
    id: 'ch-forgetting',
    lines: [
      'Two days awake.',
      'The ground closes up behind me as fast as I open it. I could not find my own way home now if I turned around.',
      'I am not turning around.',
    ],
  },
}

/** After the last chapter: the bargain. `maize` is the tally to show. */
const BARGAIN = {
  id: 'bargain',
  title: 'The bargain',
  lines: [
    'Their camp, at the end of the trail. Every ear she dropped, gathered up and carried the whole way.',
    'The big one comes out to meet me. He does not reach for anything, which frightens me more than if he had.',
    '"All of it," I tell him. "Every last one. For my daughter."',
  ],
  action: 'hand it over',
}

const TOO_LATE = {
  id: 'too-late',
  title: 'Too late',
  lines: [
    'He counts it. Then he counts it again, slower, watching me the whole time.',
    'Then he smiles.',
    '"Too late, farmer. She went out with the first cart, hours back."',
    '"If only you were faster. You could have saved her."',
  ],
  action: 'go back. be faster.',
}

const SPEEDRUN_BRIEF = {
  id: 'speedrun-brief',
  title: 'Faster, then',
  lines: [
    'Every field again. All of it again, in the dark, with the thing that follows and the ground that closes.',
    'And quicker than I walked it the first time. Every single one.',
    'She left me the trail. The least I can do is run it.',
  ],
  action: 'run',
}

const ENDING = {
  id: 'ending',
  title: 'Maizy',
  lines: [
    'The cart was slower than the man said. They always are.',
    'She hears me before she sees me — she says it was the hat.',
    '"Thank you for helping me reach my daughter."',
  ],
  action: 'levels',
}

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
  beatAfterChapter,
  beatsAfterLevel,
}
