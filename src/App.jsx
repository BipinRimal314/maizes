import { useState, useEffect, useCallback } from 'react'
import LevelSelect from './components/LevelSelect'
import MazeBuilder from './components/MazeBuilder'
import MazeSolver from './components/MazeSolver'
import { loadAllLevels } from './engine/levelLoader'

/** A maze shared by URL bypasses the level list entirely. */
const isSharedMaze = () => !!window.location.hash.slice(1)

function App() {
  // Derived at mount rather than corrected inside an effect, which used to
  // render the level list for one frame before swapping to the shared maze.
  const [mode, setMode] = useState(() => (isSharedMaze() ? 'shared' : 'levels'))
  const [currentLevel, setCurrentLevel] = useState(null)
  const [allLevels, setAllLevels] = useState([])
  const [loading, setLoading] = useState(() => !isSharedMaze())

  useEffect(() => {
    if (isSharedMaze()) return

    let cancelled = false
    loadAllLevels().then((levels) => {
      if (cancelled) return
      setAllLevels(levels)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const playing = mode === 'playing' || mode === 'shared'
    document.body.classList.toggle('playing', playing)
    return () => document.body.classList.remove('playing')
  }, [mode])

  const handleSelectLevel = useCallback((index) => {
    setCurrentLevel(index)
    setMode('playing')
  }, [])

  // MazeSolver is keyed on the level index, so changing the index remounts it
  // with a fresh game. The original bounced through 'levels' and back inside a
  // setTimeout to force that remount, which flashed the level list on every
  // "next level".
  const handleNextLevel = useCallback(() => {
    setCurrentLevel((index) => {
      if (index != null && index < allLevels.length - 1) return index + 1
      setMode('levels')
      return null
    })
  }, [allLevels.length])

  const handleBack = useCallback(() => {
    setCurrentLevel(null)
    setMode('levels')
  }, [])

  const level = currentLevel != null ? allLevels[currentLevel] : null
  const hasNext = currentLevel != null && currentLevel < allLevels.length - 1

  return (
    <>
      {mode === 'levels' && (
        <LevelSelect
          onSelectLevel={handleSelectLevel}
          onBuild={() => setMode('build')}
          allLevels={allLevels}
          loading={loading}
        />
      )}
      {mode === 'build' && <MazeBuilder onBack={handleBack} />}
      {mode === 'shared' && <MazeSolver />}
      {mode === 'playing' && level && (
        <MazeSolver
          key={currentLevel}
          levelGrid={level.grid}
          levelNumber={currentLevel}
          levelName={level.name}
          levelEra={level.era}
          levelFogRadius={level.fogRadius}
          levelDeathMode={level.deathMode}
          levelApparition={level.apparition}
          onBack={handleBack}
          onNextLevel={hasNext ? handleNextLevel : null}
        />
      )}
    </>
  )
}

export default App
