import { useRef, useState, useCallback, useEffect } from 'react'
import { createGame, restartGame } from '../engine/game.js'
import { recordWin } from './progress.js'
import { playSound, isMuted, toggleMuted } from '../engine/sound.js'
import { record } from './telemetry.js'
import { useCellSize } from './useCellSize.js'
import { useGameInput } from './useGameInput.js'
import { useGameLoop } from './useGameLoop.js'

/* eslint-disable react-hooks/refs --
 * The game is an imperative engine instance, not render data. It is created
 * once per level and mutated in place several hundred times a second, so it
 * cannot live in useState — every mutation would be a lie to React. Nothing
 * read from the ref drives rendering; the HUD comes from useGameLoop's state.
 */

function clock(ms) {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function Play({ level, index, total, isLast = false, onBack, onNext }) {
  const canvasRef = useRef(null)
  const boardRef = useRef(null)
  const [result, setResult] = useState(null)

  const restartsRef = useRef(0)
  const wonRef = useRef(false)

  const gameRef = useRef(null)
  if (gameRef.current === null) {
    const game = createGame(level.grid)
    game.onSound = playSound
    game.onWin = () => {
      wonRef.current = true
      recordWin(level.name, { deaths: game.deaths, ms: game.now })
      record('level_won', {
        levelName: level.name,
        levelIndex: index,
        deaths: game.deaths,
        ms: game.now,
        restarts: restartsRef.current,
      })
      setResult({ deaths: game.deaths, ms: game.now })
    }
    gameRef.current = game
  }
  const game = gameRef.current

  const cellSize = useCellSize(level.grid.cols, level.grid.rows)
  const hud = useGameLoop(game, canvasRef, cellSize)

  const [muted, setMuted] = useState(isMuted)

  /*
   * Pause is React state that writes through to `game.paused`, rather than
   * being read back off the HUD snapshot. The snapshot is published ten times a
   * second, so driving the menu from it opened it up to 100ms after the tap —
   * fine for a number that ticks, wrong for a menu, which should appear on the
   * press that asked for it.
   */
  const [paused, setPaused] = useState(false)

  const pause = useCallback((next) => {
    if (game.won) return
    game.paused = next
    if (next) game.input.up = game.input.down = game.input.left = game.input.right = false
    setPaused(next)
  }, [game])

  const restart = useCallback(() => {
    if (game.won) return
    restartsRef.current += 1
    restartGame(game)
    pause(false)
  }, [game, pause])

  const togglePause = useCallback(() => { pause(!game.paused) }, [game, pause])

  const onToggleSound = useCallback(() => { setMuted(toggleMuted()) }, [])

  useGameInput(game, boardRef, { onRestart: restart, onTogglePause: togglePause, onBack })

  useEffect(() => {
    const onHide = () => {
      if (game.won || !document.hidden) return
      pause(true)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [game, pause])

  /*
   * Playtest telemetry: one event on arrival, one on the way out.
   *
   * The quit event is the one worth having. A tester who gives up on level 28
   * tells you far more than one who finishes level 3, and they are exactly the
   * tester who never files feedback — so it is recorded on unmount, which
   * covers leaving by menu, by key, and by closing the tab.
   */
  useEffect(() => {
    record('level_started', { levelName: level.name, levelIndex: index })
    return () => {
      if (wonRef.current) return
      record('level_quit', {
        levelName: level.name,
        levelIndex: index,
        deaths: game.deaths,
        ms: game.now,
        restarts: restartsRef.current,
      })
    }
  }, [game, level.name, index])

  if (result) {
    const seconds = Math.floor(result.ms / 1000)
    return (
      <div className="result">
        <div className="card">
          <div className="card__emoji">{result.deaths === 0 ? '\u{1F3C6}' : result.deaths < 6 ? '\u{1F389}' : '\u{1F605}'}</div>
          <h2 className="card__title">
            {result.deaths === 0 ? 'clean run.' : 'you got out.'}
          </h2>
          <p className="card__sub">
            {result.deaths === 0 ? 'not one mistake. suspicious.' : 'eventually.'}
          </p>
          <div className="card__stats">
            <div className="stat"><span className="stat__label">time</span><span className="stat__value">{clock(result.ms)}</span></div>
            <div className="stat"><span className="stat__label">deaths</span><span className="stat__value">{result.deaths}</span></div>
          </div>
          <div className="card__actions">
            {onNext && (
              <button className="btn btn--primary" onClick={onNext}>
                {isLast ? 'finish' : 'next level'}
              </button>
            )}
            <button className="btn" onClick={onBack}>levels</button>
          </div>
          <p className="card__meta">{level.name} · {seconds}s</p>
        </div>
      </div>
    )
  }

  return (
    <div className="play">
      <header className="play__head">
        <button className="play__back" onClick={onBack}>&larr; levels</button>
        <span className="play__title">{level.name}</span>
        <span className="play__count">{index + 1}/{total}</span>
        <button
          className="play__menu"
          onClick={togglePause}
          aria-label={paused ? 'resume' : 'pause and open the menu'}
        >
          {paused ? '▶' : '⏸'}
        </button>
      </header>

      <div className="hud">
        <div className="hud__tile">
          <span className="hud__label">time</span>
          <span className="hud__value">{clock(hud.now)}</span>
        </div>
        <div className={`hud__tile hud__tile--flags${hud.exitOpen ? ' is-complete' : ''}`}>
          <span className="hud__label">maize</span>
          <span className="hud__value">{hud.captured}<span className="hud__of">/{hud.flagsTotal}</span></span>
        </div>
        <div className="hud__tile">
          <span className="hud__label">deaths</span>
          <span className="hud__value hud__value--deaths">{hud.deaths}</span>
        </div>
        {hud.hasHunter && (
          <div className={`hud__tile hud__tile--hunter${hud.hunterAwake ? ' is-awake' : ''}`}>
            <span className="hud__label">{hud.hunterAwake ? 'ghost' : 'ghost in'}</span>
            <span className="hud__value">{hud.hunterAwake ? '\u{1F47B}' : `${hud.hunterIn}s`}</span>
          </div>
        )}
      </div>

      <div className="board" ref={boardRef}>
        <canvas ref={canvasRef} className="board__canvas" />
        {paused && (
          <div className="board__overlay">
            <span className="menu__title">paused</span>
            <div className="menu">
              <button className="btn btn--primary" onClick={togglePause}>resume</button>
              <button className="btn" onClick={restart}>restart level</button>
              <button className="btn" onClick={onToggleSound}>
                sound: {muted ? 'off' : 'on'}
              </button>
              <button className="btn" onClick={onBack}>back to levels</button>
            </div>
            <span className="board__hint">P resume · R restart · Esc levels</span>
          </div>
        )}
      </div>

      <p className="play__quip">{hud.quip}</p>

      <div className="play__controls">
        <span className="play__keys">wasd / arrows · R restart · P menu</span>
        <button className="btn btn--sm" onClick={restart}>restart</button>
      </div>
    </div>
  )
}

export default Play
