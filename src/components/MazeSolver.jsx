/* eslint-disable react-hooks/refs --
 * The game is an imperative engine instance, not render data. It is created
 * once per level and mutated in place several hundred times a second by the
 * fixed-timestep loop, so it cannot live in useState — every mutation would be
 * a lie to React, and putting it there is exactly what made the original
 * re-render sixty times a second. This is React's documented "avoid recreating
 * the ref contents" pattern; nothing read from the ref drives rendering, which
 * is what the rule is actually guarding against. The HUD comes from
 * useGameLoop's own state instead.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { decodeFromHash } from '../utils/serialize'
import { createGame, restartGame } from '../engine/game'
import { playSound } from '../engine/sound'
import { recordCompletion } from '../engine/progress'
import {
  createSession, recordPosition, recordDeath, recordGatePass, endSession, saveSession,
} from '../engine/telemetry'
import { useCellSize } from '../hooks/useCellSize'
import { useGameInput } from '../hooks/useGameInput'
import { useGameLoop } from '../hooks/useGameLoop'
import GameHud from './GameHud'
import ResultCard from './ResultCard'

/**
 * The solver is now a shell: it owns a game object, a canvas and some buttons.
 * Simulation lives in engine/game.js, timing in engine/loop.js, drawing in
 * engine/scene.js. It went from 614 lines that re-rendered every frame to this.
 */

const ERA_REASSURANCE = {
  learning: 'you got this',
  punishing: 'careful now',
  sadistic: 'good luck',
}

function MazeSolver({
  levelGrid, levelNumber, levelName, levelEra, levelFogRadius, levelDeathMode,
  onBack, onNextLevel,
}) {
  const grid = useMemo(
    () => levelGrid || decodeFromHash(window.location.hash.slice(1)),
    [levelGrid]
  )

  const canvasRef = useRef(null)
  const boardRef = useRef(null)
  const [resolvedAt, setResolvedAt] = useState(null)

  const instanceRef = useRef(null)
  if (instanceRef.current === null) {
    const box = {
      session: createSession(levelNumber || 0, levelName || 'custom', levelEra || 'learning'),
    }

    const instance = createGame(grid, {
      era: levelEra,
      fogRadius: levelFogRadius,
      deathMode: levelDeathMode,
      onSound: playSound,
      onDeath: (cause, at) => {
        box.session = recordDeath(box.session, at ? at.x : 0, at ? at.y : 0, cause)
      },
      onGatePass: () => { box.session = recordGatePass(box.session) },
      onSample: (x, y) => { box.session = recordPosition(box.session, x, y) },
      onWin: () => {
        box.session = endSession(box.session, true)
        saveSession(box.session)
        if (levelName) {
          recordCompletion(levelName, { deaths: instance.deaths, elapsedMs: instance.now })
        }
        setResolvedAt({ deaths: instance.deaths, elapsedMs: instance.now })
      },
    })

    instanceRef.current = { game: instance, telemetry: box }
  }

  const { game, telemetry } = instanceRef.current

  const cellSize = useCellSize(grid.cols, grid.rows)
  const hud = useGameLoop(game, canvasRef, cellSize)

  const handleRestart = useCallback(() => {
    if (game.won) return
    restartGame(game)
  }, [game])

  const handleTogglePause = useCallback(() => {
    if (game.won) return
    game.paused = !game.paused
    if (game.paused) {
      game.input.up = game.input.down = game.input.left = game.input.right = false
    }
  }, [game])

  const goBack = useCallback(() => {
    if (!game.won) {
      telemetry.session = endSession(telemetry.session, false)
      saveSession(telemetry.session)
    }
    if (onBack) {
      onBack()
    } else {
      window.location.hash = ''
      window.location.reload()
    }
  }, [game, telemetry, onBack])

  useGameInput(game, boardRef, {
    onRestart: handleRestart,
    onTogglePause: handleTogglePause,
    onBack: goBack,
  })

  // pause rather than silently simulate on while the player is elsewhere
  useEffect(() => {
    const onVisibility = () => {
      if (game.won || !document.hidden) return
      game.paused = true
      game.input.up = game.input.down = game.input.left = game.input.right = false
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [game])

  if (resolvedAt) {
    return (
      <ResultCard
        deaths={resolvedAt.deaths}
        elapsedMs={resolvedAt.elapsedMs}
        hiddenWord={grid.hiddenWord}
        onNextLevel={onNextLevel}
        onBack={goBack}
        backLabel={onBack ? 'levels' : 'build your own'}
      />
    )
  }

  const era = levelEra || 'learning'
  const boardWidth = grid.cols * cellSize

  return (
    <div className="solver" data-era={era} style={{ '--board-width': `${boardWidth}px` }}>
      {levelNumber != null && (
        <div className="solver__title">
          <div className="solver__level">
            level {levelNumber + 1}{levelName ? `: ${levelName}` : ''}
          </div>
          <div className="solver__reassurance">
            {ERA_REASSURANCE[era] || ERA_REASSURANCE.learning} {'\u{1F496}'}
          </div>
        </div>
      )}

      <GameHud hud={hud} />

      <div className="board" ref={boardRef}>
        <canvas ref={canvasRef} className="board__canvas" />

        {hud.psycheActive && <div className="board__psyche">psyche!</div>}

        {hud.paused && (
          <div className="board__overlay">
            paused
            <br />
            <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>press P to continue</span>
          </div>
        )}
      </div>

      <p className="solver__quip">{hud.deaths > 0 ? hud.lastQuip : ''}</p>

      <div className="solver__controls">
        <span className="solver__hint">wasd / arrows · R restart · P pause</span>
        <button className="btn btn--ghost btn--sm" onClick={handleRestart}>restart</button>
        <button className="btn btn--ghost btn--sm" onClick={goBack}>
          just give up already?
        </button>
      </div>
    </div>
  )
}

export default MazeSolver
