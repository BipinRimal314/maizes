import { useState, useEffect, useCallback } from 'react'
import { fromJSON } from './generate/generate.js'
import Levels from './ui/Levels.jsx'
import Play from './ui/Play.jsx'

const BASE = import.meta.env?.BASE_URL || '/'

function App() {
  const [levels, setLevels] = useState(null)
  const [current, setCurrent] = useState(null)
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

  useEffect(() => {
    document.body.classList.toggle('is-playing', current !== null)
    return () => document.body.classList.remove('is-playing')
  }, [current])

  const next = useCallback(() => {
    setCurrent((i) => (i !== null && i < levels.length - 1 ? i + 1 : null))
  }, [levels])

  if (error) return <div className="loading"><p>could not load levels: {error}</p></div>
  if (!levels) return <div className="loading"><h1 className="levels__title">mazochist</h1><p>loading…</p></div>

  if (current !== null) {
    return (
      <Play
        key={current}
        level={levels[current]}
        index={current}
        total={levels.length}
        onBack={() => setCurrent(null)}
        onNext={current < levels.length - 1 ? next : null}
      />
    )
  }

  return <Levels levels={levels} onPick={setCurrent} />
}

export default App
