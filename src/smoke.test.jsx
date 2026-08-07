// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Play from './ui/Play.jsx'
import { fromJSON } from './generate/generate.js'
import levelData from '../public/levels.json'

/**
 * Mounts the real component tree in jsdom: hook order, effect wiring, the
 * canvas setup path, and the loop starting and tearing down. jsdom has no
 * canvas, so the 2D context is stubbed — nothing here checks pixels, only that
 * the drawing code runs without throwing.
 */

const CTX = new Proxy({ canvas: null }, {
  get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {})),
  set: () => true,
})

let errors

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  HTMLCanvasElement.prototype.getContext = () => CTX
  global.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return CTX }
  }
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')))

  let frames = 0
  global.requestAnimationFrame = (cb) => (frames++ > 0 ? 0 : setTimeout(() => cb(performance.now()), 0))
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
  await act(async () => { await new Promise((r) => setTimeout(r, 15)) })
  return {
    container,
    text: container.textContent,
    unmount: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

const level = { ...levelData[0], grid: fromJSON(levelData[0]) }
const foggy = (() => {
  const d = levelData.find((l) => l.fog !== null)
  return { ...d, grid: fromJSON(d) }
})()

describe('the app boots', () => {
  it('reaches the level list', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => levelData }))
    const view = await mount(<App />)
    expect(view.text).toContain('mazochist')
    expect(view.text).toContain('Warm Up')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('reports a failed level fetch instead of hanging', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') })
    const view = await mount(<App />)
    expect(view.text).toContain('could not load levels')
    await view.unmount()
  })
})

describe('a level mounts and runs', () => {
  it('shows the HUD and a canvas', async () => {
    const view = await mount(
      <Play level={level} index={0} total={20} onBack={() => {}} onNext={() => {}} />
    )
    expect(view.text).toContain(level.name)
    expect(view.text).toContain('flags')
    expect(view.text).toContain('deaths')
    expect(view.container.querySelector('canvas')).not.toBeNull()
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('mounts a foggy level, exercising the fog compositor', async () => {
    const view = await mount(
      <Play level={foggy} index={10} total={20} onBack={() => {}} onNext={() => {}} />
    )
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('tears the loop down on unmount', async () => {
    const cancel = vi.spyOn(global, 'cancelAnimationFrame')
    const view = await mount(<Play level={level} index={0} total={20} onBack={() => {}} />)
    await view.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})
