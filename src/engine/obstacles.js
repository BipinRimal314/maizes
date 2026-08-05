/**
 * The obstacle registry.
 *
 * DESIGN.md states the rule this file enforces:
 *
 *   "if a modifier can be overcome by 'just being more careful with the
 *    controls', it's motor difficulty. Kill it."
 *
 * The v2 roadmap listed the motor modifiers for deletion and they were never
 * deleted — ice, gravity, reverse, spinner, slideWall, fatCursor, fart and
 * teleporter all remained live in physics.js and modifiers.js, and the
 * hand-crafted intro still taught ice as the third thing a player ever sees.
 * They are gone now. Nothing here changes how the ball handles; everything
 * here changes what the player knows.
 *
 * Every surviving obstacle does one of three things:
 *   HIDE       — denies information the player needs
 *   DECEIVE    — supplies information that is false
 *   COMMIT     — makes a choice irreversible
 */

/** Cell-level modifiers, stored in `cell.modifier`. */
const MODIFIERS = {
  fakeExit: {
    label: '\u{1F3C6}',
    kind: 'DECEIVE',
    name: 'false exit',
    blurb: 'Looks like the way out. Sends you back to the start.',
  },
}

/** Cell-level boolean flags, stored as their own fields. */
const FLAGS = {
  trap: {
    kind: 'HIDE',
    name: 'trap',
    blurb: 'Invisible until it kills you. Then you have to remember it.',
  },
  mimic: {
    kind: 'DECEIVE',
    name: 'mimic',
    blurb: 'Drawn exactly like the real exit. Touching it is death.',
  },
  memoryWipe: {
    kind: 'HIDE',
    name: 'memory wipe',
    blurb: 'Erases everything you have mapped so far.',
  },
}

/** Per-cell structures. */
const STRUCTURES = {
  liarWalls: {
    kind: 'DECEIVE',
    name: 'liar wall',
    blurb: 'The wall you see is not the wall that is there.',
  },
  gate: {
    kind: 'COMMIT',
    name: 'one-way gate',
    blurb: 'Closes behind you. No going back.',
  },
}

/** Level-scope systems. */
const SYSTEMS = {
  fog: { kind: 'HIDE', name: 'fog', blurb: 'You only see what is near you.' },
  stalker: { kind: 'COMMIT', name: 'the apparition', blurb: 'Retraces your path. Punishes hesitation.' },
  corruption: { kind: 'COMMIT', name: 'the void', blurb: 'Eats the maze from the start outward.' },
}

const MODIFIER_TYPES = Object.keys(MODIFIERS)

/**
 * Modifiers that used to exist and must never silently come back. Level data
 * and the builder are validated against this list.
 */
const RETIRED_MODIFIERS = [
  'ice', 'gravity', 'reverse', 'spinner',
  'slideWall', 'fatCursor', 'fart', 'teleporter', 'blackout',
]

function isRetired(modifier) {
  return RETIRED_MODIFIERS.includes(modifier)
}

export {
  MODIFIERS,
  FLAGS,
  STRUCTURES,
  SYSTEMS,
  MODIFIER_TYPES,
  RETIRED_MODIFIERS,
  isRetired,
}
