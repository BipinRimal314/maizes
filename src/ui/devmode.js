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
 * remembered after that so the flag does not have to be carried around. It is
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

function storage() {
  try { return globalThis.window?.localStorage ?? null } catch { return null }
}

function readFlag() {
  if (!devAllowed()) return false
  try { return storage()?.getItem(DEV_KEY) === '1' } catch { return false }
}

function setDevMode(on) {
  if (!devAllowed()) return false
  try { storage()?.setItem(DEV_KEY, on ? '1' : '0') } catch { /* private mode */ }
  return !!on
}

/**
 * Apply `?dev` from the URL, if present, and return the resulting state.
 * Called once at boot; the query string wins over what was stored.
 */
function initDevMode() {
  if (!devAllowed()) return false
  try {
    const params = new URLSearchParams(globalThis.window?.location?.search ?? '')
    if (!params.has('dev')) return readFlag()
    const value = params.get('dev')
    return setDevMode(value !== '0' && value !== 'false')
  } catch {
    return readFlag()
  }
}

const isDevMode = () => readFlag()
const toggleDevMode = () => setDevMode(!readFlag())

export { initDevMode, isDevMode, setDevMode, toggleDevMode, DEV_KEY }
