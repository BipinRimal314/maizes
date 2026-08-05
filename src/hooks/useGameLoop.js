import { useEffect, useRef, useState } from 'react'
import { startLoop } from '../engine/loop'
import { stepGame, hudSnapshot } from '../engine/game'
import { setupCanvas } from '../engine/renderer'
import { drawScene } from '../engine/scene'

/**
 * Drives simulation and rendering, and publishes a HUD snapshot to React at a
 * human rate rather than a monitor rate.
 *
 * The whole point: React renders about ten times a second here. The original
 * called setState from inside requestAnimationFrame with an object containing
 * several Sets and Maps, so it re-rendered the entire solver sixty-plus times a
 * second and allocated new collections on every one of those frames. It then
 * drew the canvas from a useEffect keyed on the ball object, which meant
 * painting was scheduled by React's commit cycle instead of by the frame.
 */

const HUD_INTERVAL_MS = 90

function useGameLoop(game, canvasRef, cellSize) {
  const [hud, setHud] = useState(() => hudSnapshot(game))
  const lastHudRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = setupCanvas(canvas, game.grid.cols * cellSize, game.grid.rows * cellSize)

    const step = () => stepGame(game)
    const render = () => drawScene(ctx, game, cellSize)

    const onFrame = () => {
      const now = performance.now()
      if (now - lastHudRef.current < HUD_INTERVAL_MS) return
      lastHudRef.current = now
      setHud(hudSnapshot(game))
    }

    return startLoop({ step, render, onFrame })
  }, [game, canvasRef, cellSize])

  return hud
}

export { useGameLoop, HUD_INTERVAL_MS }
