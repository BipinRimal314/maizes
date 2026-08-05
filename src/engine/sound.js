/**
 * Procedural sound. No assets, everything is an oscillator.
 *
 * The context is created lazily and resumed on demand — browsers start it
 * suspended until a user gesture, and the original never resumed it, so audio
 * could stay silent for the whole session depending on how the page was
 * entered. Every call is wrapped because audio is never worth crashing a frame.
 */

let audioCtx = null
let muted = false

function getAudioContext() {
  if (audioCtx) return audioCtx
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  audioCtx = new Ctor()
  return audioCtx
}

function tone(ctx, { type, from, to, gain, duration, delay = 0 }) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  const start = ctx.currentTime + delay

  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  if (to !== undefined && to !== from) {
    osc.frequency.exponentialRampToValueAtTime(to, start + duration)
  }
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration)

  osc.connect(amp).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration)
}

const VOICES = {
  victory: (ctx) => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      tone(ctx, { type: 'sine', from: freq, gain: 0.2, duration: 0.3, delay: i * 0.12 })
    })
  },
  // a false exit: the victory arpeggio, falling instead of rising
  fail: (ctx) => {
    tone(ctx, { type: 'square', from: 200, to: 50, gain: 0.2, duration: 0.5 })
  },
  death: (ctx) => {
    tone(ctx, { type: 'sawtooth', from: 300, to: 80, gain: 0.15, duration: 0.3 })
  },
  wipe: (ctx) => {
    tone(ctx, { type: 'sine', from: 900, to: 120, gain: 0.12, duration: 0.45 })
    tone(ctx, { type: 'sine', from: 600, to: 90, gain: 0.08, duration: 0.5, delay: 0.05 })
  },
}

function setMuted(value) {
  muted = value
}

function isMuted() {
  return muted
}

function playSound(type) {
  if (muted) return
  const voice = VOICES[type]
  if (!voice) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()
    voice(ctx)
  } catch {
    // a missing or blocked audio context must never break the game loop
  }
}

export { playSound, setMuted, isMuted }
