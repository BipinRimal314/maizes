import { describe, it, expect } from 'vitest'
import { readPad, DEADZONE, BUTTON } from './useGamepad.js'

/**
 * The stick, without a controller plugged in.
 *
 * `readPad` is pulled out of the hook precisely so this is testable — the hook
 * itself is a requestAnimationFrame loop reading a browser API no test harness
 * provides.
 */

const pad = (axes = [0, 0], pressed = []) => ({
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
})

const fresh = () => ({ up: false, down: false, left: false, right: false })

describe('the stick', () => {
  it('stays still inside the deadzone', () => {
    // a resting stick never sits exactly at zero
    const input = fresh()
    readPad(pad([DEADZONE * 0.9, -DEADZONE * 0.9]), input)
    expect(input).toEqual(fresh())
  })

  it('moves once it is pushed past it', () => {
    const input = fresh()
    readPad(pad([0.9, 0]), input)
    expect(input.right).toBe(true)
    expect(input.left).toBe(false)
  })

  it('reads both axes at once, so diagonals work', () => {
    const input = fresh()
    readPad(pad([-0.8, 0.8]), input)
    expect(input.left).toBe(true)
    expect(input.down).toBe(true)
  })

  it('releases when the stick comes back to centre', () => {
    const input = fresh()
    readPad(pad([0.9, 0]), input)
    readPad(pad([0, 0]), input)
    expect(input).toEqual(fresh())
  })
})

describe('the d-pad', () => {
  it('works regardless of the stick', () => {
    const input = fresh()
    readPad(pad([0, 0], [14]), input)      // left
    expect(input.left).toBe(true)
  })

  it('is honoured alongside a pushed stick', () => {
    const input = fresh()
    readPad(pad([0.9, 0], [12]), input)    // stick right, d-pad up
    expect(input.right).toBe(true)
    expect(input.up).toBe(true)
  })
})

describe('the buttons', () => {
  it('maps the four a player will reach for', () => {
    expect(Object.values(BUTTON).sort()).toEqual(['back', 'confirm', 'pause', 'restart'])
  })

  it('copes with a pad reporting no axes at all', () => {
    const input = fresh()
    expect(() => readPad({ axes: [], buttons: [] }, input)).not.toThrow()
    expect(input).toEqual(fresh())
  })
})
