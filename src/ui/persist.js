/**
 * Where the save actually lives.
 *
 * In a browser that is localStorage, which is fine — it is the only option and
 * the stakes are a maze game. On the desktop it is a real file in the OS's
 * app-data directory, because a packaged app's localStorage is still tied to a
 * webview origin and can be cleared out from under the player by the webview,
 * an update, or the operating system tidying up. Losing thirty-nine levels of
 * progress to a housekeeping job is not a thing to shrug at.
 *
 * The awkward part is that the game reads progress *synchronously*, several
 * times a render, while a file read is asynchronous. So the file is read once
 * at boot into memory and every write is a fire-and-forget flush of the whole
 * snapshot, debounced. Small saves make this reasonable: the entire record of a
 * finished campaign is a couple of kilobytes.
 */

const SAVE_FILE = 'save.json'
const FLUSH_MS = 400

/** Tauri v2 puts this on the window; nothing else does. */
const onDesktop = () => {
  try { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window } catch { return false }
}

function webStorage() {
  try { return globalThis.window?.localStorage ?? null } catch { return null }
}

let backend = 'web'
let pending = null
let timer = null

/**
 * Read the save. Called once, before anything renders.
 *
 * Any failure returns null and the game starts fresh rather than refusing to
 * start — a corrupt save is a bad evening, a save that blocks the boot is a
 * bug report.
 */
async function loadSave(key) {
  if (!onDesktop()) {
    backend = 'web'
    try {
      const raw = webStorage()?.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  backend = 'desktop'
  try {
    const { readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const there = await exists(SAVE_FILE, { baseDir: BaseDirectory.AppData })
    if (!there) return null
    const raw = await readTextFile(SAVE_FILE, { baseDir: BaseDirectory.AppData })
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function flush(key) {
  const snapshot = pending
  pending = null
  if (snapshot === null) return

  if (backend === 'web') {
    try { webStorage()?.setItem(key, JSON.stringify(snapshot)) } catch { /* quota, privacy */ }
    return
  }

  try {
    const { writeTextFile, mkdir, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    // the app-data directory does not exist until something writes to it
    if (!(await exists('', { baseDir: BaseDirectory.AppData }))) {
      await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true })
    }
    await writeTextFile(SAVE_FILE, JSON.stringify(snapshot), { baseDir: BaseDirectory.AppData })
  } catch { /* a save that cannot be written must not take the game down */ }
}

/**
 * Queue the whole snapshot to be written.
 *
 * Debounced, because finishing a level writes several times in a row — the win,
 * the best time, the beat marked seen — and three file writes for one event is
 * three chances to be interrupted mid-write.
 */
function saveSnapshot(key, snapshot) {
  pending = snapshot
  if (backend === 'web') {
    // no reason to defer a synchronous write, and deferring it risks losing the
    // last one when the tab closes
    flush(key)
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; flush(key) }, FLUSH_MS)
}

/** Write anything outstanding right now. For when the window is closing. */
function flushNow(key) {
  if (timer) { clearTimeout(timer); timer = null }
  return flush(key)
}

const savedWhere = () => backend

export { loadSave, saveSnapshot, flushNow, savedWhere, onDesktop, SAVE_FILE }
