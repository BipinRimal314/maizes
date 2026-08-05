// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MazeSolver from './components/MazeSolver'
import MazeBuilder from './components/MazeBuilder'
import { LEVELS } from './engine/levels'
import curated from '../public/levels/curated.json'

/**
 * Mounts the real component tree in jsdom.
 *
 * The engine tests prove the simulation is correct; this proves the thing
 * actually boots — hook order, effect wiring, the canvas setup path, and the
 * loop starting and stopping cleanly. jsdom has no canvas implementation, so
 * the 2D context is stubbed: nothing here checks pixels, only that the drawing
 * code runs without throwing.
 */

const CONTEXT_STUB = new Proxy(
  {
    canvas: null,
    setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    quadraticCurveTo() {}, fill() {}, stroke() {}, save() {}, restore() {},
    fillText() {}, createRadialGradient: () => ({ addColorStop() {} }),
  },
  {
    get(target, key) {
      if (key in target) return target[key]
      // swallow every style property assignment and unknown method
      return typeof key === 'string' ? () => {} : undefined
    },
    set() { return true },
  }
)

let errors

beforeEach(() => {
  // tells React it is inside a test and act() is available
  global.IS_REACT_ACT_ENVIRONMENT = true
  HTMLCanvasElement.prototype.getContext = () => CONTEXT_STUB
  global.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return CONTEXT_STUB }
  }

  // capture anything React logs so a caught render error still fails the test
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')) })

  let frame = 0
  global.requestAnimationFrame = (cb) => {
    // one frame, then stop, so mounting does not spin forever
    if (frame++ > 0) return 0
    return setTimeout(() => cb(performance.now()), 0)
  }
  global.cancelAnimationFrame = (id) => clearTimeout(id)
})

afterEach(() => {
  vi.restoreAllMocks()
  delete global.OffscreenCanvas
})

async function mount(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => { root.render(element) })
  await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

  return {
    container,
    text: container.textContent,
    unmount: async () => {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

describe('the app boots', () => {
  it('mounts and reaches the level list', async () => {
    // loadAllLevels fetches the curated JSON
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => curated }))

    const view = await mount(<App />)

    expect(view.text).toContain('mazochist')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('survives the curated levels failing to load', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const view = await mount(<App />)

    // the three hand-crafted levels still render
    expect(view.text).toContain('The Basics')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })
})

describe('the solver mounts and runs', () => {
  it('renders the HUD and starts the loop', async () => {
    const view = await mount(
      <MazeSolver
        levelGrid={LEVELS[0].grid}
        levelNumber={0}
        levelName={LEVELS[0].name}
        levelEra="learning"
        levelFogRadius={null}
        levelDeathMode="progress"
        onBack={() => {}}
        onNextLevel={null}
      />
    )

    expect(view.text).toContain('Baby Steps')
    expect(view.text).toContain('suffering duration')
    expect(view.text).toContain('setbacks')
    expect(view.container.querySelector('canvas')).not.toBeNull()
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('mounts a foggy sadistic level, which exercises fog and the apparition', async () => {
    const view = await mount(
      <MazeSolver
        levelGrid={LEVELS[2].grid}
        levelNumber={12}
        levelName="No Mercy"
        levelEra="sadistic"
        levelFogRadius={3.5}
        levelDeathMode="cumulative"
        levelApparition
        onBack={() => {}}
        onNextLevel={() => {}}
      />
    )

    expect(view.text).toContain('fog')
    expect(view.text).toContain('apparition')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('tears the loop down on unmount', async () => {
    const cancel = vi.spyOn(global, 'cancelAnimationFrame')
    const view = await mount(
      <MazeSolver levelGrid={LEVELS[0].grid} levelNumber={0} onBack={() => {}} />
    )
    await view.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})

describe('the builder mounts', () => {
  it('offers the obstacles the engine implements, and none it does not', async () => {
    const view = await mount(<MazeBuilder onBack={() => {}} />)

    for (const label of ['liar wall', 'mimic', 'trap', 'memory wipe', 'flag']) {
      expect(view.text, `builder is missing "${label}"`).toContain(label)
    }
    for (const retired of ['ice', 'gravity', 'spinner', 'fart', 'teleporter']) {
      expect(view.text.toLowerCase()).not.toContain(retired)
    }

    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })
})
