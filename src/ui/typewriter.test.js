// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from './useTypewriter.js'

/**
 * The cards type themselves out. Two things must hold whatever the pacing is:
 * a player can always skip to the end, and anyone who asked for reduced motion
 * never waits at all.
 */

const lines = [
  { v: 'n', text: 'There is corn on the ground.' },
  { v: 'v', text: 'papa' },
]

function motion(reduced) {
  window.matchMedia = (query) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })
}

beforeEach(() => { vi.useRealTimers(); motion(false) })

describe('typing', () => {
  it('starts with nothing written', () => {
    const { result } = renderHook(() => useTypewriter(lines))
    expect(result.current.done).toBe(false)
    expect(result.current.shown.join('')).toBe('')
  })

  it('reveals the first line before the second', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(lines))
    await act(async () => { vi.advanceTimersByTime(600) })

    expect(result.current.shown[0].length).toBeGreaterThan(0)
    expect(result.current.shown[0].length).toBeLessThan(lines[0].text.length)
    expect(result.current.shown[1]).toBeUndefined()
    expect(lines[0].text.startsWith(result.current.shown[0])).toBe(true)
  })

  it('gets to the end on its own', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(lines))

    /*
     * Advanced in slices, not one jump. Each character schedules the next only
     * after React has re-rendered, so a single large advance fires the one
     * timer that exists and then finds nothing else pending.
     */
    for (let i = 0; i < 400 && !result.current.done; i++) {
      await act(async () => { vi.advanceTimersByTime(60) })
    }

    expect(result.current.done).toBe(true)
    expect(result.current.shown).toEqual(lines.map((l) => l.text))
  })
})

describe('skipping', () => {
  it('fills everything in at once', () => {
    const { result } = renderHook(() => useTypewriter(lines))
    act(() => { result.current.skip() })
    expect(result.current.done).toBe(true)
    expect(result.current.shown).toEqual(lines.map((l) => l.text))
  })

  it('stops the typing rather than racing it', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTypewriter(lines))
    act(() => { result.current.skip() })
    for (let i = 0; i < 50; i++) {
      await act(async () => { vi.advanceTimersByTime(60) })
    }
    // nothing half-typed came back and overwrote the skip
    expect(result.current.shown).toEqual(lines.map((l) => l.text))
  })
})

describe('reduced motion', () => {
  it('shows the whole card immediately', () => {
    motion(true)
    const { result } = renderHook(() => useTypewriter(lines))
    expect(result.current.done).toBe(true)
    expect(result.current.shown).toEqual(lines.map((l) => l.text))
  })
})

describe('an empty beat', () => {
  it('is done before it starts', () => {
    const { result } = renderHook(() => useTypewriter([]))
    expect(result.current.done).toBe(true)
    expect(result.current.shown).toEqual([])
  })
})
