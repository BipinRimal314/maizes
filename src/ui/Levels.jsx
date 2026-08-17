import { useState, useCallback } from 'react'
import { isDone, bestFor, doneCount } from './progress.js'
import { isMuted, toggleMuted } from '../engine/sound.js'
import { enabled as telemetryOn, isRecording, toggleRecording } from './telemetry.js'

/** The level list, grouped by chapter. */
function Levels({ levels, onPick }) {
  const [muted, setMuted] = useState(isMuted)
  const onToggleSound = useCallback(() => { setMuted(toggleMuted()) }, [])

  const [recording, setRecording] = useState(isRecording)
  const onToggleRecording = useCallback(() => { setRecording(toggleRecording()) }, [])

  const chapters = []
  for (const [index, level] of levels.entries()) {
    let chapter = chapters[chapters.length - 1]
    if (!chapter || chapter.name !== level.chapter) {
      chapter = { name: level.chapter, blurb: level.blurb, levels: [] }
      chapters.push(chapter)
    }
    chapter.levels.push({ ...level, index })
  }

  const done = doneCount()

  return (
    <div className="levels">
      <header className="levels__head">
        <h1 className="levels__title">maizes</h1>
        <p className="levels__tag">why is it called maizes? that&rsquo;s the puzzle.</p>
        {done > 0 && <p className="levels__progress">{done} of {levels.length} escaped</p>}
        <button
          className="levels__sound"
          onClick={onToggleSound}
          aria-label={muted ? 'turn sound on' : 'turn sound off'}
        >
          {muted ? '\u{1F507} sound off' : '\u{1F50A} sound on'}
        </button>
      </header>

      {chapters.map((chapter) => (
        <section className="chapter" key={chapter.name}>
          <h2 className="chapter__name">{chapter.name}</h2>
          <p className="chapter__blurb">{chapter.blurb}</p>
          <div className="chapter__grid">
            {chapter.levels.map((level) => {
              const best = bestFor(level.name)
              return (
                <button className="card-level" key={level.name} onClick={() => onPick(level.index)}>
                  <span className="card-level__top">
                    <span className="card-level__n">{level.index + 1}</span>
                    {isDone(level.name) && <span className="card-level__done">{'\u{2B50}'}</span>}
                  </span>
                  <span className="card-level__tags">
                    <span className="tag tag--flag">{level.grid.flags.length} maize</span>
                    {level.grid.traps.length > 0 && (
                      <span className="tag tag--trap">{level.grid.traps.length} traps</span>
                    )}
                    {level.grid.fog !== null && <span className="tag tag--fog">fog</span>}
                    {level.grid.hunter && <span className="tag tag--hunter">hunted</span>}
                    {level.grid.memory !== null && <span className="tag tag--fading">fading</span>}
                  </span>
                  {best && <span className="card-level__best">best: {best.deaths} deaths</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {/* Only shown on a build that actually has somewhere to send it. Testers
          are told in plain words, and opting out is one click, not a menu. */}
      {telemetryOn() && (
        <footer className="levels__foot">
          <p>
            {recording
              ? 'this playtest build records anonymous stats — which level you reached, how long it took, how often you died. no name, no email, nothing else.'
              : 'not recording anything. thanks for playing anyway.'}
          </p>
          <button className="levels__optout" onClick={onToggleRecording}>
            {recording ? 'stop recording my stats' : 'start recording again'}
          </button>
        </footer>
      )}
    </div>
  )
}

export default Levels
