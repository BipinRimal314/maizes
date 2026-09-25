import Difficulty from './Difficulty.jsx'
import { useState, useCallback } from 'react'
import {
  journalEntries, setProgressProfile, isDone, bestFor, doneCount, unlockedCount, walkedMs,
  speedrunActive, speedrunProgress, parFor, isBeaten,
} from './progress.js'
import { isMuted, toggleMuted } from '../engine/sound.js'
import { enabled as telemetryOn, isRecording, toggleRecording } from './telemetry.js'
import Landscape from './Landscape.jsx'
import { starsFor } from './rewards.js'
import { isDevMode, toggleDevMode } from './devmode.js'

/**
 * The trail so far.
 *
 * The campaign is a mystery, so this shows what has been walked and exactly one
 * step past it. Everything beyond is a blank marker — no name, no chapter, no
 * mechanic tags. Those tags are the spoiler: "fog", "hunted" and "fading" name
 * three of the revelations the story spends the whole campaign earning, and a player
 * who reads them off a list on day one has been handed the ending. A chapter
 * that has not been reached is not drawn at all, because its name gives it away
 * as surely as the tags do.
 *
 * During the second run it shows something else again: only the fields act two
 * actually races, one per chapter. Offering the rest of them as well would be
 * offering levels with no target on them.
 *
 * Developer mode puts all of it back; see devmode.js.
 */
function walked(ms) {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
function Levels({ levels, onPick, difficulty = 'easy', onDifficulty }) {
  const [muted, setMuted] = useState(isMuted)
  const onToggleSound = useCallback(() => { setMuted(toggleMuted()) }, [])

  const [recording, setRecording] = useState(isRecording)
  const onToggleRecording = useCallback(() => { setRecording(toggleRecording()) }, [])

  const [dev, setDev] = useState(isDevMode)
  const onToggleDev = useCallback(() => {
    const next = toggleDevMode()
    setProgressProfile(difficulty, next)
    setDev(next)
  }, [difficulty])

  const done = doneCount(levels)
  const stars = levels.reduce((sum, level) => sum + starsFor(level, bestFor(level.name)), 0)
  const racing = speedrunActive()
  const run = racing ? speedrunProgress(levels) : null

  // developer mode and the second run through both open everything: by then the
  // player has walked all of it, so there is nothing left to spoil
  const reach = dev || racing ? levels.length : unlockedCount(levels)

  const chapters = []
  for (const [index, level] of levels.entries()) {
    if (index >= reach) break
    // in the race, a field with no par is a field with nothing to beat
    if (racing && !dev && parFor(level.name) == null) continue
    let chapter = chapters[chapters.length - 1]
    if (!chapter || chapter.name !== level.chapter) {
      chapter = { name: level.chapter, blurb: level.blurb, levels: [] }
      chapters.push(chapter)
    }
    chapter.levels.push({ ...level, index })
  }

  const remaining = racing ? 0 : levels.length - reach
  const nextIndex = racing
    ? levels.findIndex((l) => parFor(l.name) != null && !isBeaten(l.name))
    : Math.min(unlockedCount(levels) - 1, levels.length - 1)
  const destinationIndex = nextIndex < 0
    ? Math.max(0, levels.findIndex((l) => parFor(l.name) != null))
    : nextIndex
  const destination = levels[destinationIndex]

  return (
    <div className="levels">
      <header className="journey-nav">
        <span className="journey-nav__brand">M<span aria-hidden="true"> / </span><span>Journey to Maizy</span></span>
        <button className="levels__sound" onClick={onToggleSound} aria-label={muted ? 'turn sound on' : 'turn sound off'}>
          Sound {muted ? 'off' : 'on'}
        </button>
      </header>
      <section className="journey-hero">
        <Landscape />
        <div className="journey-hero__copy">
          <span className="eyebrow">{racing ? 'The pursuit' : 'An ordinary father. An unfamiliar road.'}</span>
          <h1 className="levels__title">Follow the<br /><em>little things.</em></h1>
          <p>Someone left a trail. Keep going.</p>
          <button className="btn btn--primary journey-continue" onClick={() => onPick(destinationIndex)}>
            {racing ? (nextIndex < 0 ? 'Revisit the trail' : 'Catch the cart') : done ? 'Continue the journey' : 'Take the first step'} <span aria-hidden="true">↗</span>
          </button>
          <span className="journey-hero__destination">{destination.chapter} · Field {destinationIndex + 1}</span>
        </div>
        <div className="journey-hero__foot">
          <span>{racing ? `${run.beaten} / ${run.total} crossings beaten` : `${done} / ${levels.length} fields crossed`}</span>
          <span>{walked(walkedMs(levels))} on the trail</span>
          <span>{stars} / {levels.length * 3} {dev ? 'dev' : difficulty} stars</span>
        </div>
      </section>
      <Difficulty value={difficulty} onChange={onDifficulty} />
      {journalEntries().length > 0 && <details className="field-journal"><summary>Maizy’s trail · {journalEntries().length} discoveries</summary>{journalEntries().map(p => <p key={p.id}><strong>{p.title}</strong><br />{p.text}</p>)}</details>}
      <div className="journey-section-title"><h2>Your trail</h2><span>{racing ? 'Find a faster way through' : 'Every field brings you closer'}</span></div>

      {chapters.map((chapter) => (
        <section className="chapter" key={chapter.name}>
          <h2 className="chapter__name">{chapter.name}</h2>
          {chapter.blurb && <p className="chapter__blurb">{chapter.blurb}</p>}
          <div className="chapter__grid">
            {chapter.levels.map((level) => {
              const best = bestFor(level.name)
              return (
                <button
                  aria-label={`Play ${level.name}`}
                  className={`card-level${level.index === nextIndex ? ' is-current' : ''}${racing && isBeaten(level.name) ? ' is-beaten' : ''}`}
                  key={level.name}
                  onClick={() => onPick(level.index)}
                >
                  <span className="card-level__top">
                    <span className="card-level__n">{level.index + 1}</span>
                    {racing
                      ? isBeaten(level.name) && <span className="card-level__done">✓</span>
                      : isDone(level.name) && <span className="card-level__done">✓</span>}
                  </span>
                  <span className="level-stars" aria-label={`${starsFor(level, best)} of 3 stars`}>{'★'.repeat(starsFor(level, best))}<span aria-hidden="true">{'☆'.repeat(3 - starsFor(level, best))}</span></span>
                  <span className="card-level__name">{level.challenge || level.name}{level.milestone ? ' · Milestone' : ''}</span>
                  <span className="card-level__status">{isDone(level.name) ? 'Crossed' : level.challenge || 'Follow the trail'} <span aria-hidden="true">↗</span></span>
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
                    : best && (
                        <span className="card-level__best">
                          {best.deaths === 0 ? 'clean · ' : ''}{walked(best.ms)}
                        </span>
                      )}
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
            {remaining} fields beyond this point. One step at a time.
          </p>
          <div className="unknown-trail" aria-hidden="true">· · · · · · ·</div>
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
