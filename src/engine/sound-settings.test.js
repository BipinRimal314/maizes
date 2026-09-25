import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

async function sound(saved = null) {
  vi.resetModules()
  vi.stubGlobal('localStorage', { getItem: key => key === 'maizes:volume' ? saved : null, setItem: vi.fn() })
  return import('./sound.js')
}

it('starts audible when no volume has been saved', async () => {
  expect((await sound()).getVolume()).toBe(0.55)
})

it('preserves an intentionally saved zero volume', async () => {
  expect((await sound('0')).getVolume()).toBe(0)
})

it('resumes suspended audio from player input without needing a sound effect', async () => {
  const resume = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', { AudioContext: class { state = 'suspended'; resume = resume } })
  const { unlockAudio } = await sound()
  unlockAudio()
  expect(resume).toHaveBeenCalledOnce()
})

function audioHarness(state = 'running') {
  const starts = vi.fn()
  const gains = []
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const node = () => ({ connect() { return this }, start: starts, stop() {}, frequency: param(), Q: param() })
  let resumeAudio
  const resumed = new Promise(resolve => { resumeAudio = resolve })
  vi.stubGlobal('window', { AudioContext: class {
    state = state
    currentTime = 0
    sampleRate = 44100
    destination = {}
    resume = () => resumed
    createBuffer = () => ({ getChannelData: () => new Float32Array(44100) })
    createBufferSource = node
    createBiquadFilter = node
    createOscillator = node
    createGain = () => {
      const gain = param()
      gains.push(gain)
      return { ...node(), gain }
    }
  } })
  return { starts, gains, resumeAudio }
}

it.each(['death', 'caught'])('plays the %s impact and tone at the saved volume', async (event) => {
  const { starts, gains } = audioHarness()
  const { playSound } = await sound('0.5')
  playSound(event)
  expect(starts).toHaveBeenCalledTimes(2)
  expect(gains.every(g => g.setValueAtTime.mock.calls[0][0] > 0)).toBe(true)
})

it('waits for suspended audio before playing death, and respects subsequent mute', async () => {
  const { starts, resumeAudio } = audioHarness('suspended')
  const { playSound, setMuted } = await sound()
  const playing = playSound('death')
  expect(starts).not.toHaveBeenCalled()
  resumeAudio()
  await playing
  expect(starts).toHaveBeenCalledTimes(2)
  setMuted(true)
  playSound('caught')
  expect(starts).toHaveBeenCalledTimes(2)
})

it('does not schedule a death sound at zero volume', async () => {
  const { starts } = audioHarness()
  const { playSound } = await sound('0')
  playSound('death')
  expect(starts).not.toHaveBeenCalled()
})
