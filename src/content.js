/**
 * Every word the player reads. This is the file to edit.
 *
 * All of the writing lives here so that changing a line never means opening
 * anything that has behaviour in it. Nothing in this file does anything — it is
 * data, imported by the engine for the in-level lines and by the story layer
 * for the cards between levels.
 *
 * WHAT IS WHERE
 *
 *   PROLOGUE, CHAPTER_BEATS, BARGAIN,     the story cards, in the order they
 *   TOO_LATE, SPEEDRUN_BRIEF, ENDING,     are shown
 *   LOST_HER
 *
 *   WHISPERS                              fragments heard mid-level, keyed by
 *                                         level name
 *
 *   DEATH_QUIPS, CAUGHT_QUIPS             what the farmer says when it goes
 *                                         wrong
 *
 *   PICKED_ONE, PICKED_LAST, GHOST_WOKE   the other in-level lines
 *
 * TWO VOICES
 *
 *   n('...')  the farmer. Present tense, plain language, concrete observations.
 *   v('...')  the voices — overheard or remembered fragments of other people.
 *
 * The reveal happens in the gap between them, so if you add a line, it belongs
 * to one of those two and not to a narrator explaining things.
 *
 * The only player-facing text NOT in here is the chapter names and blurbs,
 * which live in `src/scripts/buildLevels.js` because they are baked into
 * `levels.json` when the campaign is generated. Change one of those and run
 * `npm run levels` to see it.
 */

const n = (text) => ({ v: 'n', text })
const v = (text) => ({ v: 'v', text })

const PROLOGUE = {
  id: 'prologue',
  title: 'Dusk',
  lines: [
    n("Someone has broken the gate. Corn lies scattered across the field."),
    n("I pick up an ear, then spot another by the hedge."),
    v('papa'),
    n("The trail carries on through the gap."),
    n("I put on my old yellow hat and follow it before the light goes."),
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
      n("Three rows cleared. There is more corn beyond the fence."),
      n("Two ears at the turn. We used to mark our way home like that."),
      v('…she’s still got a whole armful…'),
      v('…three rows. that’s the lot of it.'),
      n("I stop to listen, but the voices have moved on."),
    ],
  },

  'Two Trips': {
    id: 'ch-two-trips',
    lines: [
      n("I reach the edge of my land. The trail keeps going."),
      v('…leave the sacks. take the girl.'),
      v('…three carts. we go when we go.'),
      n("They came for the harvest. Why did they take her?"),
      n("I should be able to hear their carts from here."),
      v('…i’m dropping them where you’ll look, papa…'),
    ],
  },

  'First Light': {
    id: 'ch-first-light',
    lines: [
      n("It is dark now. I feel along the hedge for a gap."),
      n('The corn is easier to find than the path.'),
      v('…one every twenty steps. she’ll be out before the ridge…'),
      n("I taught her to leave a mark before a turn. She has remembered."),
    ],
  },

  'The Fog': {
    id: 'ch-the-fog',
    lines: [
      n('I can see about as far as my own arm.'),
      n("I nearly step on the next ear. She has left it in the middle of the path."),
      v('maizy. sit down.'),
      v('…papa i’m here i’m here i’m—'),
      n('Maizy.'),
      n("She always answers when I call across the field. I wait without meaning to."),
    ],
  },

  // The hat. Thirteen levels of steering a small yellow shape without being
  // told what it is; this is the only place that debt gets paid.
  //
  // The debt is opened in the prologue — he puts the hat on before the player
  // has moved anything — because a reveal only lands on someone who was given
  // the piece to forget. Guarded by a test in ui/story.test.js.
  'Company': {
    id: 'ch-company',
    lines: [
      n("I hear footsteps behind me. When I stop, they stop."),
      v('…there’s nothing behind you, papa…'),
      v('…there’s nothing behind him.'),
      n("From up there, you can barely see me. Just a yellow circle moving through the dark."),
      n("That is my hat. You have been guiding me beneath it all this way."),
      n("Keep me on the path. I cannot see where to put my feet."),
    ],
  },

  'No Mercy': {
    id: 'ch-no-mercy',
    lines: [
      n("Firelight on the ridge. I crouch behind the wall and listen."),
      v('three carts. she goes on the first.'),
      v('…she’s stopped dropping them.'),
      v('good. that’s eleven miles of them wasted.'),
      n('I have started walking quietly.'),
    ],
  },

  'The Dry Reach': {
    id: 'ch-dry-reach',
    lines: [
      n("The ground is dry here. There is no shelter from the wind."),
      n("A gust catches me sideways. I have to lean into it to stay on the path."),
      v('two days he’s been walking. two.'),
      v('…he’ll be across the reach by dark.'),
      n("They know I am following."),
    ],
  },

  'The White Mile': {
    id: 'ch-white-mile',
    lines: [
      n("Snow covers the path. My boots keep slipping."),
      n("I take smaller steps near the edge."),
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
      n("I have barely slept. I keep losing track of turns I just took."),
      n('I could not find my way home now if I turned around.'),
      v('…how long has he been out there?'),
      v('…papa. wrong way. wrong—'),
      n('I am not going home.'),
    ],
  },

  'The Lit Wood': {
    id: 'ch-lit-wood',
    lines: [
      n("Something flickers between the trees."),
      n("Fireflies. In their light, I can just make out the corn."),
      v('…don’t eat anything in there…'),
      v("…keep moving. he’s getting closer."),
      v('…papa…'),
      n("She wanted to show me these lights last summer. I told her we had work to do."),
      n("At the roots, two ears point into the wood. All right, Maizy. Show me."),
    ],
  },
}

// The last three chapters are the same dark getting bigger. The story goes
// quiet with him: fewer lines, and the voices thinning to almost nothing.
CHAPTER_BEATS['Nothing Stays'] = {
  id: 'ch-nothing-stays',
  lines: [
    n("Ash and wheel ruts. I check each fire, but they are all cold."),
    n('It was not the camp. It was where they stopped for a night.'),
    v('…'),
    n("On the far side of the camp, I find another ear."),
  ],
}

CHAPTER_BEATS['The Long Dark'] = {
  id: 'ch-long-dark',
  lines: [
    n("The sack is heavy. I shift it to my other shoulder."),
    n("I follow the wall until my hand is scraped raw."),
    v('…papa…'),
    n("I stop to listen. Nothing. I keep walking."),
  ],
}

/** After the last chapter: the bargain. `maize` is the tally shown alongside. */
const BARGAIN = {
  id: 'bargain',
  title: 'The camp',
  lines: [
    n("The trail ends at a camp. A man stands beside the fire."),
    n("I set the sack at his feet. Everything she left me is in there."),
    n("He opens it and looks inside."),
    n('"All of it," I tell him. "Every last one. For my daughter."'),
    v('—'),
    n("I wait for him to bring her out."),
  ],
  action: 'hand it over',
}

/** The bargain fails, but fresh tracks give the pursuit a concrete destination. */
const TOO_LATE = {
  id: 'too-late',
  title: 'Too late',
  lines: [
    n("He counts the corn into a sack of his own. I recognise his voice from the ridge."),
    n("He ties the sack shut. Then he looks at me."),
    v('"First light, farmer. The first cart went at first light."'),
    v("\"You’re too late. She’s gone.\""),
    n("Beyond the fire, fresh wheel tracks lead out of camp."),
    n("I leave the corn with him and follow the tracks."),
  ],
  action: "follow the cart",
}

const SPEEDRUN_BRIEF = {
  id: 'speedrun-brief',
  title: 'Faster, then',
  lines: [
    n("The road bends around the fields I crossed. I can cut through and catch the cart."),
    n("Thirteen fields. I need to beat my first time in each one."),
    n("I know the turns now. Help me get through them."),
    v('papa'),
    n("I can still reach her."),
  ],
  action: 'run',
}

const ENDING = {
  id: 'ending',
  title: 'Maizy',
  lines: [
    n("I reach the road as the cart comes around the bend."),
    n("She spots my yellow hat and calls out. When I reach her, she asks if I found her marks."),
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
    n("I sit down beside the road. I cannot make myself get up."),
    n('The carts went on. I did not.'),
    v('…'),
    n("By morning I am home. The gate is still broken."),
    n('I keep her shawl in my coat.'),
    n("I should have kept going."),
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
 * Keyed by level name, at most one per level, with gaps between appearances.
 */
const WHISPERS = {
  'Warm Up 3': '…where did she go…',
  'Two Trips 1': '…they came up the west track…',
  'Two Trips 2': '…he’s coming. of course he’s coming…',
  'First Light 3': '…count them. count them, papa…',
  'The Fog 2': '…she’s still dropping them…',
  'Company 3': '…don’t look back…',
  'No Mercy 2': '…she goes on the first cart…',
  'Forgetting 2': '…he’s still out there?…',
  'The Dry Reach 2': '…faster here. careful…',
  'The White Mile 2': '…she left the path…',
  'The Lit Wood 2': "…remember the lights, papa?…",
  'Nothing Stays 3': '…almost, papa…',
  'The Long Dark 2': '…it goes on and on out here…',
  'The Fires 2': '…papa. i can see you…',
}


// ------------------------------------------------------- what he says out loud

/* Short reactions to a fall. Avoid jokes that undermine the search. */
const DEATH_QUIPS = [
  "Didn’t see that hole.",
  "Watch your feet.",
  "All right. Back up.",
  "Missed my footing.",
  "Too close to the edge.",
  "Try the other side.",
  "Still in one piece.",
  "Should have slowed down there.",
  "Come on. Get up.",
  "Careful on the next try.",
  "That hurt.",
  "Back to the start.",
]

/*
 * A fall on a hunted field, where a fall costs every ear picked so far. He
 * knows what it cost; he does not make a joke of it.
 */
const LOST_MAIZE_QUIPS = [
  "Dropped the lot. I’ll have to collect it again.",
  "Lost the corn. Back I go.",
  "Empty sack. Start again.",
  "I need to pick it all up again.",
]

const CAUGHT_QUIPS = [
  "It caught up.",
  "I waited too long.",
  "It found me again.",
  "Keep moving.",
  "I can hear it getting closer.",
  "It cut me off.",
]

/* Repeated falls shorten his reactions further. */
const WEARY_QUIPS = [
  'Up.',
  "Again.",
  "Take a breath.",
  'Nothing broken. Up.',
  "She is still out there.",
  'Get up, old man. Get up.',
]

/** Falls in one field before the oaths give out. */
const QUIPS_BEFORE_WEARY = 4

const PICKED_ONE = "Another one. Back to the gate with it."
const PICKED_LAST = "Got them all. The way out is open."
const GHOST_WOKE = "Footsteps. Keep moving."

export {
  n, v,
  PROLOGUE, CHAPTER_BEATS, BARGAIN, TOO_LATE, SPEEDRUN_BRIEF, ENDING, LOST_HER,
  WHISPERS,
  DEATH_QUIPS, WEARY_QUIPS, QUIPS_BEFORE_WEARY,
  CAUGHT_QUIPS, LOST_MAIZE_QUIPS, PICKED_ONE, PICKED_LAST, GHOST_WOKE,
}
