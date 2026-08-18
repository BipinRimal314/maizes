import { useEffect } from 'react'

/**
 * A controller, for the desktop builds.
 *
 * Polled rather than evented, because that is the only thing the Gamepad API
 * offers — there is no "axis moved" event. Polling happens on the animation
 * frame the loop is already running, so this costs one array read per frame and
 * adds no timer of its own.
 *
 * Writes into the same `game.input` the keyboard and the touch stick write
 * into, so nothing downstream knows or cares which one moved the hat.
 */

const DEADZONE = 0.35          // sticks rest anywhere but centre
const BUTTON = {
  0: 'confirm',                // A / cross
  1: 'back',                   // B / circle
  9: 'pause',                  // start
  8: 'restart',                // select
}

function readPad(pad, input) {
  const [x = 0, y = 0] = pad.axes
  const dpadLeft = pad.buttons[14]?.pressed
  const dpadRight = pad.buttons[15]?.pressed
  const dpadUp = pad.buttons[12]?.pressed
  const dpadDown = pad.buttons[13]?.pressed

  input.left = dpadLeft || x < -DEADZONE
  input.right = dpadRight || x > DEADZONE
  input.up = dpadUp || y < -DEADZONE
  input.down = dpadDown || y > DEADZONE
}

function useGamepad(game, actions = {}) {
  const { onRestart, onTogglePause, onBack } = actions

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return undefined

    let frame = 0
    let held = new Set()
    let touched = false

    const poll = () => {
      frame = requestAnimationFrame(poll)

      const pads = navigator.getGamepads?.() ?? []
      const pad = Array.from(pads).find((p) => p && p.connected)
      if (!pad) {
        // release anything the pad was holding when it was unplugged, or the
        // hat keeps walking into a wall forever
        if (touched) {
          game.input.up = game.input.down = game.input.left = game.input.right = false
          touched = false
        }
        return
      }
      touched = true
      readPad(pad, game.input)

      const pressed = new Set()
      for (const [index, action] of Object.entries(BUTTON)) {
        if (!pad.buttons[index]?.pressed) continue
        pressed.add(action)
        if (held.has(action)) continue      // edge, not level: no key repeat
        if (action === 'pause' || action === 'confirm') onTogglePause?.()
        if (action === 'restart') onRestart?.()
        if (action === 'back') onBack?.()
      }
      held = pressed
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [game, onRestart, onTogglePause, onBack])
}

export { useGamepad, DEADZONE, BUTTON, readPad }
