/**
 * Composes one frame. Draw order matters and is the whole reason this lives in
 * one place instead of being scattered through a component effect:
 *
 *   maze -> ball -> fog -> void -> apparition -> death flash
 *
 * The apparition is drawn *above* the fog on purpose. You are always allowed to
 * see it coming; the difficulty is meant to be the route you chose, not a
 * jump scare.
 */

import { drawMaze, drawBall, drawStalker, drawTrapFlash } from './renderer'
import { drawFog, drawCorruption } from './fog'

function drawScene(ctx, game, cellSize) {
  const { grid, ball } = game

  drawMaze(ctx, grid, cellSize, {
    collectedFakeExits: game.fakeExitsCollected,
  })

  drawBall(ctx, ball, cellSize)

  if (game.fogRadius !== null && game.fogRadius !== undefined) {
    drawFog(ctx, grid, cellSize, ball, game.fogRadius, game.visited)
  }

  drawCorruption(ctx, cellSize, game.corrupted, game.now)
  drawStalker(ctx, game.stalker, cellSize, game.now)

  if (game.trapFlash && game.now < game.trapFlash.until) {
    drawTrapFlash(ctx, game.trapFlash, cellSize)
  }
}

export { drawScene }
