import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startLoop, MAX_STEPS_PER_FRAME } from './loop'
import { STEP_MS } from './game'

/**
 * The regression these guard is the original game loop calling physics once per
 * requestAnimationFrame with no delta time. That made simulation speed a
 * function of refresh rate: on a 120Hz display the ball accelerated twice as
 * fast and friction was applied twice as often, so the game was measurably
 * harder on better hardware.
 */

let frameCallbacks
let nextHandle

function installFakeRaf() {
  frameCallbacks = new Map()
  nextHandle = 1

  globalThis.requestAnimationFrame = (cb) => {
    const handle = nextHandle++
    frameCallbacks.set(handle, cb)
    return handle
  }
  globalThis.cancelAnimationFrame = (handle) => {
    frameCallbacks.delete(handle)
  }
}

/** Deliver one frame at `timestamp` to whatever callback is pending. */
function deliverFrame(timestamp) {
  const pending = [...frameCallbacks.entries()]
  frameCallbacks.clear()
  for (const [, cb] of pending) cb(timestamp)
}

/** Run `durationMs` of wall clock at a given refresh rate. */
function runAtHz(hz, durationMs) {
  let steps = 0
  let renders = 0

  const stop = startLoop({
    step: () => { steps++ },
    render: () => { renders++ },
  })

  const frameInterval = 1000 / hz
  for (let t = 0; t <= durationMs; t += frameInterval) {
    deliverFrame(t)
  }
  stop()

  return { steps, renders }
}

beforeEach(installFakeRaf)
afterEach(() => {
  vi.restoreAllMocks()
  frameCallbacks.clear()
})

describe('fixed timestep', () => {
  it('simulates the same number of steps per second at 60Hz and 120Hz', () => {
    const sixty = runAtHz(60, 1000)
    const oneTwenty = runAtHz(120, 1000)

    // one second of game time is one second of steps, whatever the monitor does
    expect(sixty.steps).toBeGreaterThan(55)
    expect(Math.abs(sixty.steps - oneTwenty.steps)).toBeLessThanOrEqual(1)
  })

  it('holds at 144Hz and 30Hz too', () => {
    const rates = [30, 60, 90, 120, 144].map((hz) => runAtHz(hz, 1000).steps)
    const min = Math.min(...rates)
    const max = Math.max(...rates)
    expect(max - min).toBeLessThanOrEqual(2)
  })

  it('renders once per frame, not once per step', () => {
    const sixty = runAtHz(60, 1000)
    const oneTwenty = runAtHz(120, 1000)

    // rendering follows the display; simulation does not
    expect(oneTwenty.renders).toBeGreaterThan(sixty.renders * 1.8)
  })

  it('advances game time in exact STEP_MS units', () => {
    const { steps } = runAtHz(60, 1000)
    const simulatedMs = steps * STEP_MS
    expect(simulatedMs).toBeGreaterThan(900)
    expect(simulatedMs).toBeLessThan(1100)
  })
})

describe('frame hitches', () => {
  it('caps catch-up so a long stall cannot spiral', () => {
    let steps = 0
    const stop = startLoop({ step: () => { steps++ }, render: () => {} })

    deliverFrame(0)
    deliverFrame(16)
    const before = steps
    // a two-second stall, well past MAX_FRAME_MS
    deliverFrame(2016)
    stop()

    expect(steps - before).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME)
  })

  it('treats a backgrounded tab as a pause rather than simulating through it', () => {
    let steps = 0
    const stop = startLoop({ step: () => { steps++ }, render: () => {} })

    deliverFrame(0)
    deliverFrame(16)
    const before = steps
    deliverFrame(60_000) // a minute in another tab
    stop()

    // one step, not 3600
    expect(steps - before).toBeLessThanOrEqual(1)
  })

  it('stops stepping once cancelled', () => {
    let steps = 0
    const stop = startLoop({ step: () => { steps++ }, render: () => {} })

    deliverFrame(0)
    deliverFrame(100)
    const after = steps
    stop()
    deliverFrame(200)

    expect(steps).toBe(after)
  })
})
