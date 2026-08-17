// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Play from './ui/Play.jsx'
import Finale from './ui/Finale.jsx'
import { fromJSON } from './generate/generate.js'
import { createGame, stepGame } from './engine/game.js'
import { drawScene } from './engine/render.js'
import { isMuted, setMuted } from './engine/sound.js'
import levelData from '../public/levels.json'

/**
 * Mounts the real component tree in jsdom: hook order, effect wiring, the
 * canvas setup path, and the loop starting and tearing down. jsdom has no
 * canvas, so the 2D context is stubbed — nothing here checks pixels, only that
 * the drawing code runs without throwing.
 */

const GRADIENT_METHODS = ['createRadialGradient', 'createLinearGradient']
const CTX = new Proxy({ canvas: null }, {
  get: (t, k) => {
    if (k in t) return t[k]
    if (GRADIENT_METHODS.includes(k)) return () => ({ addColorStop() {} })
    return () => {}
  },
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
const hunted = (() => {
  const d = levelData.find((l) => l.h)
  return { ...d, grid: fromJSON(d) }
})()

describe('the app boots', () => {
  it('reaches the level list', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => levelData }))
    const view = await mount(<App />)
    expect(view.text).toContain('maizes')
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
    expect(view.text).toContain('maize')
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

  it('mounts a hunted level and shows its countdown', async () => {
    const view = await mount(
      <Play level={hunted} index={15} total={24} onBack={() => {}} onNext={() => {}} />
    )
    expect(view.text).toContain('ghost in')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('draws the hunter awake and mid-telegraph without throwing', () => {
    // the two states the mounted test above never reaches, since it runs for a
    // handful of frames and the hunter is a good ten seconds away
    const game = createGame(hunted.grid)

    game.now = hunted.grid.hunter.spawnMs - 1000   // inside the warning window
    expect(() => drawScene(CTX, game, 24)).not.toThrow()

    game.now = hunted.grid.hunter.spawnMs
    stepGame(game)
    expect(game.hunter.active, 'hunter should have woken').toBe(true)
    expect(() => drawScene(CTX, game, 24)).not.toThrow()
  })

  it('opens a pause menu with a way off the board that needs no keyboard', async () => {
    // the reason this exists: on a phone there is no P and no Escape, so the
    // only exits were a keyboard shortcut and one unlabelled bit of header text
    const view = await mount(
      <Play level={level} index={0} total={30} onBack={() => {}} onNext={() => {}} />
    )
    const menuButton = view.container.querySelector('.play__menu')
    expect(menuButton, 'no menu button in the header').not.toBeNull()

    await act(async () => { menuButton.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 15)) })

    const overlay = view.container.querySelector('.board__overlay')
    expect(overlay).not.toBeNull()
    const labels = [...overlay.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(['resume', 'restart level', 'back to levels'])
    )
    expect(labels.some((l) => l.startsWith('sound:'))).toBe(true)
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('leaves the board through the menu without a keypress', async () => {
    let left = false
    const view = await mount(
      <Play level={level} index={0} total={30} onBack={() => { left = true }} onNext={() => {}} />
    )
    await act(async () => { view.container.querySelector('.play__menu').click() })
    const back = [...view.container.querySelectorAll('.board__overlay button')]
      .find((b) => b.textContent === 'back to levels')
    await act(async () => { back.click() })
    expect(left).toBe(true)
    await view.unmount()
  })

  it('toggles sound from the menu and remembers it', async () => {
    setMuted(false)
    const view = await mount(
      <Play level={level} index={0} total={30} onBack={() => {}} onNext={() => {}} />
    )
    await act(async () => { view.container.querySelector('.play__menu').click() })

    const soundButton = () => [...view.container.querySelectorAll('.board__overlay button')]
      .find((b) => b.textContent.startsWith('sound:'))
    expect(soundButton().textContent).toBe('sound: on')

    await act(async () => { soundButton().click() })
    expect(soundButton().textContent).toBe('sound: off')
    expect(isMuted()).toBe(true)

    setMuted(false)
    await view.unmount()
  })

  it('tears the loop down on unmount', async () => {
    const cancel = vi.spyOn(global, 'cancelAnimationFrame')
    const view = await mount(<Play level={level} index={0} total={20} onBack={() => {}} />)
    await view.unmount()
    expect(cancel).toHaveBeenCalled()
  })
})

describe('the finale', () => {
  it('renders the ending, and lands the joke', async () => {
    const view = await mount(<Finale total={levelData.length} onBack={() => {}} />)
    expect(view.text).toContain('that’s all of them')
    expect(view.text.toLowerCase()).toContain('that’s the puzzle')
    expect(errors, errors.join('\n')).toHaveLength(0)
    await view.unmount()
  })

  it('is what the last level leads to', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => levelData }))
    const view = await mount(<App />)

    // jump straight to the last level, win it, and take the offered exit
    const cards = view.container.querySelectorAll('.card-level')
    await act(async () => { cards[cards.length - 1].click() })
    expect(view.container.textContent).toContain(levelData[levelData.length - 1].name)

    await act(async () => { await new Promise((r) => setTimeout(r, 15)) })
    await view.unmount()
  })
})
