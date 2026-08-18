import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

/**
 * Reveal a beat one character at a time.
 *
 * The cards used to arrive whole, which reads as a wall of text to be got past
 * rather than someone talking. Typed out, the farmer has a pace — and the
 * pauses between his lines and the voices are where the counterpoint lands.
 *
 * Three things it has to get right:
 *
 * - **Skippable, always.** One press fills everything in. Nobody should be held
 *   at reading speed on their second time through.
 * - **Instant for anyone who asked for that.** `prefers-reduced-motion` shows
 *   the whole card immediately rather than typing it more slowly.
 * - **Deterministic.** The visible text is *derived* from a cursor rather than
 *   accumulated into an array. The first version appended to state as it went
 *   and, when React double-invoked the effect, produced `['T', undefined,
 *   'papa']` — two overlapping writers interleaving into one array. A cursor
 *   cannot interleave: whatever order the writes land in, the text rendered is
 *   a pure function of where it points.
 */

const CHAR_MS = { n: 26, v: 42 }     // the voices are slower; they are not sure
const LINE_PAUSE_MS = { n: 320, v: 480 }
const OPENING_PAUSE_MS = 260

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * @param {Array<{v: 'n'|'v', text: string}>} lines
 * @returns {{ shown: string[], done: boolean, skip: () => void }}
 *          `shown[i]` is however much of line `i` is visible so far.
 */
function useTypewriter(lines) {
  // state, not a ref: it is read during render, and a ref read at render time
  // is a bug waiting for a concurrent re-render to find it
  const [instant] = useState(prefersReducedMotion)

  // the cursor. `line === lines.length` means finished.
  const [at, setAt] = useState(() =>
    (instant || lines.length === 0 ? { line: lines.length, char: 0 } : { line: 0, char: 0 })
  )
  const timer = useRef(null)

  const done = at.line >= lines.length

  const shown = useMemo(() => (
    lines.slice(0, at.line + 1).map((line, i) => (
      i < at.line ? line.text : line.text.slice(0, at.char)
    ))
  ), [lines, at])

  const skip = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setAt({ line: lines.length, char: 0 })
  }, [lines])

  useEffect(() => {
    if (done) return undefined

    const current = lines[at.line]
    const finishedLine = at.char >= current.text.length

    const wait = at.line === 0 && at.char === 0
      ? OPENING_PAUSE_MS                                  // a beat before he starts
      : finishedLine
        ? (LINE_PAUSE_MS[lines[at.line + 1]?.v] ?? LINE_PAUSE_MS.n)
        : (CHAR_MS[current.v] ?? CHAR_MS.n)

    timer.current = setTimeout(() => {
      timer.current = null
      setAt((prev) => {
        const line = lines[prev.line]
        if (!line) return prev
        return prev.char >= line.text.length
          ? { line: prev.line + 1, char: 0 }
          : { line: prev.line, char: prev.char + 1 }
      })
    }, wait)

    return () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
    }
  }, [lines, at, done])

  return { shown, done, skip }
}

export { useTypewriter, CHAR_MS, LINE_PAUSE_MS, OPENING_PAUSE_MS }
