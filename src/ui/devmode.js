/**
 * Developer mode.
 *
 * The campaign is a mystery: a player is shown the level they have earned and
 * nothing beyond it, because the chapter names, the mechanic tags and the board
 * sizes are all spoilers for a story that is meant to arrive a piece at a time.
 * That is exactly the wrong shape for building the thing, so this unlocks
 * everything and puts the detail back.
 *
 * Turned on by visiting with `?dev` (or `?dev=1`), off with `?dev=0`, and
 * limited to that URL; visiting the ordinary URL always turns it off. It is
 * deliberately not a keyboard easter egg — a tester who stumbles onto a secret
 * that reveals the whole campaign has had the game spoiled by an accident.
 */

const DEV_KEY = 'maizes:dev'

/**
 * Build-time kill switch.
 *
 * `?dev` is a convenience for whoever is building this, and a spoiler for
 * everyone else: it unlocks all thirty levels and puts back the mechanic tags
 * that name three of the revelations the story spends the campaign earning. A
 * build handed to testers sets `VITE_NO_DEV=1`, and then no query string, no
 * stored flag and no console poking can turn it on — there is nothing to turn
 * on, because every entry point below reports false.
 *
 * A client-side flag is not a security boundary and is not pretending to be
 * one. It is here so that a tester who idly tries `?dev` gets the game rather
 * than the ending.
 */
const devAllowed = () => import.meta.env?.VITE_NO_DEV !== '1'

let active = false

function setDevMode(on) {
  active = devAllowed() && !!on
  return active
}

/** Explicit URL opt-in on every page load; never inherit a stored dev flag. */
function initDevMode() {
  try {
    const params = new URLSearchParams(globalThis.window?.location?.search ?? '')
    const value = params.get('dev')
    return setDevMode(params.has('dev') && (value === '' || value === '1' || value === 'true'))
  } catch { return setDevMode(false) }
}

const isDevMode = () => devAllowed() && active
const toggleDevMode = () => setDevMode(!isDevMode())

export { initDevMode, isDevMode, setDevMode, toggleDevMode, DEV_KEY }
