import { useState, useCallback } from 'react'
import {
  isDone, bestFor, doneCount, unlockedCount,
  speedrunActive, speedrunProgress, parFor, isBeaten,
} from './progress.js'
import { isMuted, toggleMuted } from '../engine/sound.js'
import { enabled as telemetryOn, isRecording, toggleRecording } from './telemetry.js'
import { isDevMode, toggleDevMode } from './devmode.js'

/**
 * The trail so far.
 *
 * The campaign is a mystery, so this shows what has been walked and exactly one
 * step past it. Everything beyond is a blank marker — no name, no chapter, no
 * mechanic tags. Those tags are the spoiler: "fog", "hunted" and "fading" name
 * three of the revelations the story spends thirty levels earning, and a player
 * who reads them off a list on day one has been handed the ending. A chapter
 * that has not been reached is not drawn at all, because its name gives it away
 * as surely as the tags do.
 *
 * Developer mode puts all of it back; see devmode.js.
 */
function Levels({ levels, onPick }) {
  const [muted, setMuted] = useState(isMuted)
  const onToggleSound = useCallback(() => { setMuted(toggleMuted()) }, [])

  const [recording, setRecording] = useState(isRecording)
  const onToggleRecording = useCallback(() => { setRecording(toggleRecording()) }, [])

  const [dev, setDev] = useState(isDevMode)
  const onToggleDev = useCallback(() => { setDev(toggleDevMode()) }, [])

  const done = doneCount()
  const racing = speedrunActive()
  const run = racing ? speedrunProgress(levels) : null

  // developer mode and the second run through both open everything: by then the
  // player has walked all of it, so there is nothing left to spoil
  const reach = dev || racing ? levels.length : unlockedCount(levels)

  const chapters = []
  for (const [index, level] of levels.entries()) {
    if (index >= reach) break
    let chapter = chapters[chapters.length - 1]
    if (!chapter || chapter.name !== level.chapter) {
      chapter = { name: level.chapter, blurb: level.blurb, levels: [] }
      chapters.push(chapter)
    }
    chapter.levels.push({ ...level, index })
  }

  const remaining = levels.length - reach

  return (
    <div className="levels">
      <header className="levels__head">
        <h1 className="levels__title">maizes</h1>
        <p className="levels__tag">why is it called maizes? that&rsquo;s the puzzle.</p>
        {racing
          ? <p className="levels__progress levels__progress--racing">
              running it back &middot; {run.beaten} of {run.total} fields beaten
            </p>
          : done > 0 && <p className="levels__progress">{done} of {levels.length} escaped</p>}
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
          {chapter.blurb && <p className="chapter__blurb">{chapter.blurb}</p>}
          <div className="chapter__grid">
            {chapter.levels.map((level) => {
              const best = bestFor(level.name)
              return (
                <button
                  className={`card-level${racing && isBeaten(level.name) ? ' is-beaten' : ''}`}
                  key={level.name}
                  onClick={() => onPick(level.index)}
                >
                  <span className="card-level__top">
                    <span className="card-level__n">{level.index + 1}</span>
                    {racing
                      ? isBeaten(level.name) && <span className="card-level__done">{'\u{1F3C3}'}</span>
                      : isDone(level.name) && <span className="card-level__done">{'\u{2B50}'}</span>}
                  </span>
                  {dev && (
                    <span className="card-level__tags">
                      <span className="tag tag--flag">{level.grid.flags.length} maize</span>
                      {level.grid.traps.length > 0 && (
                        <span className="tag tag--trap">{level.grid.traps.length} traps</span>
                      )}
                      {level.grid.fog !== null && <span className="tag tag--fog">fog</span>}
                      {level.grid.hunter && <span className="tag tag--hunter">hunted</span>}
                      {level.grid.memory !== null && <span className="tag tag--fading">fading</span>}
                    </span>
                  )}
                  {racing
                    ? parFor(level.name) != null && (
                        <span className="card-level__best">
                          beat {(parFor(level.name) / 1000).toFixed(1)}s
                        </span>
                      )
                    : best && <span className="card-level__best">best: {best.deaths} deaths</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {remaining > 0 && (
        <section className="chapter chapter--unknown">
          <h2 className="chapter__name">the trail goes on</h2>
          <p className="chapter__blurb">
            {remaining} more of it, and no telling what is in them until you are standing there.
          </p>
          <div className="chapter__grid">
            {Array.from({ length: Math.min(remaining, 6) }, (_, i) => (
              <span className="card-level card-level--locked" key={i} aria-hidden="true">
                <span className="card-level__top">
                  <span className="card-level__n">{reach + i + 1}</span>
                </span>
                <span className="card-level__lock">{'\u{1F33E}'}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <footer className="levels__foot">
        {/* Only shown on a build that actually has somewhere to send it. Testers
            are told in plain words, and opting out is one click, not a menu. */}
        {telemetryOn() && (
          <>
            <p>
              {recording
                ? 'this playtest build records anonymous stats — which level you reached, how long it took, how often you died. no name, no email, nothing else.'
                : 'not recording anything. thanks for playing anyway.'}
            </p>
            <button className="levels__optout" onClick={onToggleRecording}>
              {recording ? 'stop recording my stats' : 'start recording again'}
            </button>
          </>
        )}
        {dev && (
          <p className="levels__dev">
            developer mode &middot; all {levels.length} levels unlocked{' '}
            <button className="levels__optout" onClick={onToggleDev}>turn it off</button>
          </p>
        )}
      </footer>
    </div>
  )
}

export default Levels
