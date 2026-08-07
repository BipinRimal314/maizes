/**
 * Fixed-timestep game loop.
 *
 * The original ran physics once per requestAnimationFrame with no delta time,
 * so a 120Hz display simulated twice as many steps per second as a 60Hz one.
 * The ball moved twice as fast, friction was applied twice as often, and the
 * stalker's 10-second head start was the only thing in the game that stayed
 * constant. The game was measurably harder on better hardware.
 *
 * Here the simulation always advances in STEP_MS chunks no matter how often the
 * browser paints. Rendering happens once per frame, after the steps.
 */

import { STEP_MS } from './game.js'

// Enough to absorb a hitch without the "spiral of death" where catching up
// costs more time than it recovers.
const MAX_STEPS_PER_FRAME = 5

// A tab restored from the background reports an enormous delta; treat anything
// past this as a pause rather than trying to simulate through it.
const MAX_FRAME_MS = 250

function startLoop({ step, render, onFrame }) {
  let rafId = null
  let last = null
  let accumulator = 0
  let running = true

  const frame = (timestamp) => {
    if (!running) return

    if (last === null) last = timestamp
    let delta = timestamp - last
    last = timestamp

    if (delta > MAX_FRAME_MS) delta = STEP_MS
    accumulator += delta

    let steps = 0
    while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      step()
      accumulator -= STEP_MS
      steps++
    }
    // fell too far behind to catch up; drop the debt instead of compounding it
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    render()
    if (onFrame) onFrame()

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)

  return () => {
    running = false
    if (rafId !== null) cancelAnimationFrame(rafId)
  }
}

export { startLoop, MAX_STEPS_PER_FRAME, MAX_FRAME_MS }
