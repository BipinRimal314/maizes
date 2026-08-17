import { useState, useEffect, useCallback } from 'react'
import { fromJSON } from './generate/generate.js'
import Levels from './ui/Levels.jsx'
import Play from './ui/Play.jsx'
import Finale from './ui/Finale.jsx'
import { record, flush } from './ui/telemetry.js'
import { loadMaize } from './engine/render.js'

const BASE = import.meta.env?.BASE_URL || '/'

function App() {
  const [levels, setLevels] = useState(null)
  const [current, setCurrent] = useState(null)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${BASE}levels.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        if (cancelled) return
        setLevels(data.map((d) => ({ ...d, grid: fromJSON(d) })))
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  // send anything a previous session could not deliver
  useEffect(() => { flush() }, [])

  // start decoding the maize sprite while the player is still reading the level
  // list, so the first board it appears on is not the one that waits for it
  useEffect(() => { loadMaize() }, [])

  useEffect(() => {
    document.body.classList.toggle('is-playing', current !== null)
    return () => document.body.classList.remove('is-playing')
  }, [current])

  // The last level leads to the finale rather than silently dumping you back on
  // the list, which is what a campaign with an ending owes you.
  const next = useCallback(() => {
    setCurrent((i) => {
      if (i === null) return null
      if (i < levels.length - 1) return i + 1
      record('campaign_finished', { levelIndex: i })
      setFinished(true)
      return null
    })
  }, [levels])

  const backToLevels = useCallback(() => {
    setCurrent(null)
    setFinished(false)
  }, [])

  if (error) return <div className="loading"><p>could not load levels: {error}</p></div>
  if (!levels) return <div className="loading"><h1 className="levels__title">maizes</h1><p>loading…</p></div>

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

  if (finished) return <Finale total={levels.length} onBack={backToLevels} />

  return <Levels levels={levels} onPick={setCurrent} />
}

export default App
