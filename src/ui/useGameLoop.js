import { useEffect, useRef, useState } from 'react'
import { startLoop } from '../engine/loop.js'
import { stepGame, snapshot } from '../engine/game.js'
import { setupCanvas, drawScene } from '../engine/render.js'

/**
 * Drives simulation and drawing, and publishes a HUD snapshot to React about
 * ten times a second rather than sixty.
 *
 * Simulation lives outside React entirely. The previous version called setState
 * from inside requestAnimationFrame with an object full of Sets, so it
 * re-rendered the whole tree every frame and allocated new collections on each.
 */

const HUD_INTERVAL_MS = 100

function useGameLoop(game, canvasRef, cellSize) {
  const [hud, setHud] = useState(() => snapshot(game))
  const lastRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = setupCanvas(canvas, game.grid.cols * cellSize, game.grid.rows * cellSize)

    return startLoop({
      step: () => stepGame(game),
      render: () => drawScene(ctx, game, cellSize),
      onFrame: () => {
        const now = performance.now()
        if (now - lastRef.current < HUD_INTERVAL_MS) return
        lastRef.current = now
        setHud(snapshot(game))
      },
    })
  }, [game, canvasRef, cellSize])

  return hud
}

export { useGameLoop, HUD_INTERVAL_MS }
