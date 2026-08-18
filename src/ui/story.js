/**
 * Journey to Maizy — the narrative laid over the campaign.
 *
 * Kept entirely separate from the engine and the generator. Not one line here
 * changes what a level is or whether it can be finished; a beat is a card shown
 * between levels and nothing more. That separation is the point — the whole
 * repo rests on levels being provably beatable, and a story that could reach
 * into the rules would be a story that could break the proof.
 *
 * ## Two voices
 *
 * Every beat is a conversation between someone who will not say what happened
 * and someone who keeps saying it anyway.
 *
 *   `n()` the farmer, telling you what he is doing. Present tense, flat,
 *         and consistently not mentioning the thing that matters. He is not
 *         lying to you; he is not letting himself finish the sentence.
 *
 *   `v()` the voices — overheard, remembered, or not really there. They come
 *         in fragments and they say the part he skips.
 *
 * The reveal is what happens in the gap between them. The player is told
 * almost nothing directly: the first card is a man picking up corn and a child
 * saying one word, and everything after it is earned a chapter at a time. Front
 * loading this was the original mistake — a prologue that explains the bandits,
 * the daughter and the trail leaves the next twenty-nine levels with nothing to
 * find out.
 *
 * Two people are audible in the fragments, and both are meant to be
 * recognisable before they are named. The big bandit counts — ears, steps,
 * carts, days, miles — every time he speaks, so that when he counts the maize
 * at the camp you already know whose voice that is. Maizy thins out as the
 * distance grows: whole sentences at the gate, fragments by the marsh, one word
 * in the wood, and nothing at all when you finally reach the fires.
 *
 * The ladder, deliberately slow:
 *
 *   prologue      something is wrong with the ground. a voice.
 *   Warm Up       corn does not walk. someone said "she".
 *   Two Trips     a girl was taken. the trail is on purpose.
 *   First Light   someone is counting it. it will run out.
 *   The Fog       her name.
 *   Company       the hat, and the yellow shape you have been steering.
 *   No Mercy      the camp, the cart, and she has stopped dropping them.
 *   Dry Reach     they discuss him like weather.
 *   White Mile    her shawl, which he has been carrying the whole way.
 *   Forgetting    how long he has been out here.
 *   The Lit Wood  the one place he would never have gone. her trail goes in.
 *   -> the bargain
 */

const n = (text) => ({ v: 'n', text })
const v = (text) => ({ v: 'v', text })

const PROLOGUE = {
  id: 'prologue',
  title: 'Dusk',
  lines: [
    n('There is corn on the ground that should be on the stalk.'),
    n('I am picking it up.'),
    v('papa'),
    n('That is all I am doing.'),
  ],
  action: 'pick it up',
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
      n('Four rows cleared, and the ground keeps dropping them ahead of me.'),
      n('Corn does not walk. I know that much.'),
      v('…she’s still got a whole armful…'),
      v('…four rows. that’s the lot of it.'),
      n('I did not hear that.'),
    ],
  },

  'Two Trips': {
    id: 'ch-two-trips',
    lines: [
      n('Further out than my land goes, now. I have not stopped to think about that.'),
      v('…leave the sacks. take the girl.'),
      n('I am gathering what fell. That is all this is.'),
      v('…i’m dropping them where you’ll look, papa…'),
    ],
  },

  'First Light': {
    id: 'ch-first-light',
    lines: [
      n('The light went. I have walked this ground my whole life and I cannot find it in the dark.'),
      n('The corn is easier to find than the path.'),
      v('…one every twenty steps. she’ll be out before the ridge…'),
      n('Someone has thought about this more carefully than I have.'),
    ],
  },

  'The Fog': {
    id: 'ch-the-fog',
    lines: [
      n('I can see about as far as my own arm.'),
      n('Every time I reach the place the next one should be, it is there.'),
      v('maizy. sit down.'),
      v('…papa i’m here i’m here i’m—'),
      n('Maizy.'),
      n('I have not said her name out loud since the field.'),
    ],
  },

  // The hat. Twenty levels of steering a small yellow shape without being told
  // what it is; this is the only place that debt gets paid.
  'Company': {
    id: 'ch-company',
    lines: [
      n('Something has walked behind me for an hour. It never closes. It never needs to.'),
      v('…there’s nothing behind you, papa…'),
      v('…there’s nothing behind him.'),
      n('I did not look back. I kept my eyes on the small yellow thing going on ahead of me in the dark — the one you have been steering this whole time.'),
      n('It is my hat. I have not taken it off since the field.'),
      n('It is the only part of me that has kept going in a straight line.'),
    ],
  },

  'No Mercy': {
    id: 'ch-no-mercy',
    lines: [
      n('Fires. Smoke, and voices in it, and this time they are outside my head.'),
      v('three carts. she goes on the first.'),
      v('…she’s stopped dropping them.'),
      v('good. that’s eleven miles of them wasted.'),
      n('I have started walking quietly.'),
    ],
  },

  'The Dry Reach': {
    id: 'ch-dry-reach',
    lines: [
      n('Out of the wet and onto flat hard ground that runs further than I can see.'),
      n('It throws you along. Twice now I have been running without having decided to.'),
      v('two days he’s been walking. two.'),
      v('…he’ll be across the reach by dark.'),
      n('They talk about me the way you talk about weather.'),
    ],
  },

  'The White Mile': {
    id: 'ch-white-mile',
    lines: [
      n('Snow, and enough of it to wade rather than walk.'),
      n('Every step out here costs three of the ones behind it.'),
      v('a mile and a half of this. she’ll not walk it twice.'),
      v('…she wasn’t dressed for this…'),
      n('I have her shawl inside my coat. I have had it since the field.'),
      v('…papa. cold.'),
      n('I know. I know. I am coming.'),
    ],
  },

  'Forgetting': {
    id: 'ch-forgetting',
    lines: [
      n('Two days awake. The ground closes behind me as fast as I open it.'),
      n('I could not find my way home now if I turned around.'),
      v('…how long has he been out there?'),
      v('…papa. wrong way. wrong—'),
      n('I am not going home.'),
    ],
  },

  'The Lit Wood': {
    id: 'ch-lit-wood',
    lines: [
      n('There is no moon under those trees and I could still see my hands.'),
      n('The wood gives off its own light. Green, and cold, and coming from the trunks rather than falling on them.'),
      v('…don’t eat anything in there…'),
      v('…he won’t. he’s not hungry, he’s a father.'),
      v('…papa…'),
      n('I have farmed beside this wood my whole life and never once walked into it.'),
      n('Her trail goes in.'),
    ],
  },
}

/** After the last chapter: the bargain. `maize` is the tally shown alongside. */
const BARGAIN = {
  id: 'bargain',
  title: 'The camp',
  lines: [
    n('The end of the trail, and their fires at the end of it.'),
    n('Every ear she dropped, gathered up and carried the whole way.'),
    n('The big one comes out to meet me. He does not reach for anything, which frightens me more than if he had.'),
    n('"All of it," I tell him. "Every last one. For my daughter."'),
    v('—'),
    n('Nothing. For the first time in three days, nothing at all.'),
  ],
  action: 'hand it over',
}

const TOO_LATE = {
  id: 'too-late',
  title: 'Too late',
  lines: [
    n('He counts it. Of course he does. He has been counting the whole way — I have been hearing him count since the ridge.'),
    n('Then he counts it again, slower, watching me the whole time. Then he smiles.'),
    v('"Too late, farmer. She went out with the first cart, hours back."'),
    v('"If only you were faster. You could have saved her."'),
  ],
  action: 'go back. be faster.',
}

const SPEEDRUN_BRIEF = {
  id: 'speedrun-brief',
  title: 'Faster, then',
  lines: [
    n('Every field again. All of it again, in the dark, with the thing that follows and the ground that closes.'),
    n('And quicker than I walked it the first time. Every single one.'),
    v('papa'),
    n('Ahead of me, this time.'),
  ],
  action: 'run',
}

const ENDING = {
  id: 'ending',
  title: 'Maizy',
  lines: [
    n('The cart was slower than he said. They always are.'),
    n('She hears me before she sees me. She says it was the hat — that she would know it anywhere, going on ahead in the dark.'),
    v('papa.'),
    n('Thank you for helping me reach my daughter.'),
  ],
  action: 'levels',
}

/**
 * The other ending.
 *
 * Chosen, never stumbled into — the player has to decide to stop looking, from
 * the finale screen, while the run is still winnable. A game that cannot be
 * failed has no stakes, and a game that fails you by accident has no respect.
 *
 * It is not a dead end either. Beat every field afterwards and the true ending
 * still lands; this is where he gave up, not where the story is confiscated.
 */
const LOST_HER = {
  id: 'lost-her',
  title: 'The road back',
  lines: [
    n('There is a point where a man stops walking, and I would rather tell you I reached it than pretend I did not.'),
    n('The carts went on. I did not.'),
    v('…'),
    n('I go home in the morning and the field is still there, and the gate, and the gap in the hedge where they came through.'),
    n('I keep her shawl in my coat.'),
    n('Thank you for walking it with me. I am sorry it was not far enough.'),
  ],
  action: 'levels',
}

/**
 * Fragments heard *during* a level, a few seconds in.
 *
 * The chapter cards are where the story moves; these are where it leaks. They
 * arrive while the player is busy and cannot stop to study them, which is the
 * right way to deliver a thing that is supposed to feel half-heard — and it
 * puts a hint inside the game rather than only between the levels of it.
 *
 * Keyed by level name, at most one per level, and deliberately sparse: eight
 * across thirty levels, so hearing one stays an event.
 */
const WHISPERS = {
  'Warm Up 2': '…where did she go…',
  'Two Trips 1': '…they came up the west track…',
  'First Light 2': '…count them. count them, papa…',
  'The Fog 1': '…she’s still dropping them…',
  'Company 2': '…don’t look back…',
  'No Mercy 2': '…first light. the cart at first light…',
  'Forgetting 2': '…he’s still out there?…',
  'The Dry Reach 2': '…faster here. careful…',
  'The White Mile 2': '…she left the path…',
  'The Lit Wood 2': '…the lights aren’t trees…',
  'Nothing Stays 2': '…almost, papa…',
}

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
