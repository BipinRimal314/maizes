import { useState, useEffect, useCallback } from 'react'
import { fromJSON } from './generate/generate.js'
import Levels from './ui/Levels.jsx'
import Play from './ui/Play.jsx'
import Story from './ui/Story.jsx'
import Finale from './ui/Finale.jsx'
import { record, flush } from './ui/telemetry.js'
import { loadMaize } from './engine/render.js'
import { initDevMode } from './ui/devmode.js'
import {
  PROLOGUE, BARGAIN, SPEEDRUN_BRIEF, ENDING, beatsAfterLevel,
} from './ui/story.js'
import {
  hasSeen, markSeen, maizeCollected, startSpeedrun,
  speedrunActive, speedrunComplete, finishSpeedrun,
} from './ui/progress.js'

const BASE = import.meta.env?.BASE_URL || '/'

/**
 * The shell, and the one place that decides what the player sees next.
 *
 * Story sequencing lives here rather than inside the screens: a beat is a card
 * that reports it has been read, and this decides what follows. Letting a card
 * pick its own successor is how you end up with two of them both convinced they
 * are the ending.
 *
 * The queue is a plain array of beats. Finishing a level can enqueue several —
 * the last chapter enqueues the bargain, the refusal and the speedrun brief in
 * one go — and they play out in order before the level list comes back.
 */
function App() {
  const [levels, setLevels] = useState(null)
  const [current, setCurrent] = useState(null)
  const [queue, setQueue] = useState([])
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}levels.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        if (cancelled) return
        setLevels(data.map((d) => ({ ...d, grid: fromJSON(d) })))
        // queued here rather than in an effect on `levels`: this is the moment
        // it becomes true, and an effect that sets state on its own dependency
        // is a render loop waiting to happen
        if (!hasSeen(PROLOGUE.id)) setQueue([PROLOGUE])
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  // send anything a previous session could not deliver
  useEffect(() => { flush() }, [])

  // ?dev in the url flips developer mode before anything renders
  useEffect(() => { initDevMode() }, [])

  // start decoding the maize sprite while the player is still reading the level
  // list, so the first board it appears on is not the one that waits for it
  useEffect(() => { loadMaize() }, [])

  useEffect(() => {
    document.body.classList.toggle('is-playing', current !== null)
    return () => document.body.classList.remove('is-playing')
  }, [current])

  const enqueue = useCallback((beats) => {
    const unseen = beats.filter((beat) => !hasSeen(beat.id))
    if (unseen.length > 0) setQueue((q) => [...q, ...unseen])
    return unseen.length > 0
  }, [])

  /**
   * Leaving a level. Works out what the player has earned the right to see:
   * the chapter's beat, the end of the campaign, or the end of the speedrun.
   */
  const next = useCallback(() => {
    setCurrent((i) => {
      if (i === null) return null
      const isLastLevel = i === levels.length - 1
      if (isLastLevel) record('campaign_finished', { levelIndex: i })

      const beats = beatsAfterLevel(levels, i, {
        active: speedrunActive(),
        complete: speedrunComplete(levels),
      })

      if (enqueue(beats)) return null
      if (isLastLevel) { setFinished(true); return null }
      return i + 1
    })
  }, [levels, enqueue])

  /** A beat has been read: mark it, run its side effect, show the next one. */
  const advance = useCallback(() => {
    setQueue((q) => {
      const [beat, ...rest] = q
      if (!beat) return []
      markSeen(beat.id)

      if (beat.id === SPEEDRUN_BRIEF.id) {
        startSpeedrun(levels)
        record('speedrun_started', { levelIndex: levels.length - 1 })
      }
      if (beat.id === ENDING.id) {
        finishSpeedrun()
        record('speedrun_finished', { levelIndex: levels.length - 1 })
        setFinished(true)
      }

      return rest
    })
  }, [levels])

  const backToLevels = useCallback(() => {
    setCurrent(null)
    setFinished(false)
  }, [])

  if (error) return <div className="loading"><p>could not load levels: {error}</p></div>
  if (!levels) return <div className="loading"><h1 className="levels__title">maizes</h1><p>loading…</p></div>

  if (queue.length > 0) {
    const beat = queue[0]
    return (
      <Story
        beat={beat}
        maize={beat.id === BARGAIN.id ? maizeCollected(levels) : null}
        onDone={advance}
      />
    )
  }

  if (current !== null) {
    return (
      <Play
        key={current}
        level={levels[current]}
        index={current}
        total={levels.length}
        isLast={current === levels.length - 1}
        onBack={backToLevels}
        onNext={next}
      />
    )
  }

  if (finished) return <Finale levels={levels} total={levels.length} onBack={backToLevels} />

  return <Levels levels={levels} onPick={setCurrent} />
}

export default App
