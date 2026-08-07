/**
 * Procedural sound. No assets, everything is an oscillator.
 *
 * The context is created lazily and resumed on demand — browsers start it
 * suspended until a gesture — and every call is wrapped, because audio is never
 * worth crashing a frame over.
 */

let audioCtx = null
let muted = false

function context() {
  if (audioCtx) return audioCtx
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  audioCtx = new Ctor()
  return audioCtx
}

function tone(ctx, { type = 'sine', from, to, gain, duration, delay = 0 }) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  const start = ctx.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  if (to !== undefined && to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration)
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration)
}

const VOICES = {
  death: (ctx) => tone(ctx, { type: 'sawtooth', from: 300, to: 80, gain: 0.14, duration: 0.28 }),
  capture: (ctx) => tone(ctx, { from: 660, to: 990, gain: 0.16, duration: 0.18 }),
  unlock: (ctx) => [523, 659, 784].forEach((f, i) =>
    tone(ctx, { from: f, gain: 0.16, duration: 0.24, delay: i * 0.09 })),
  win: (ctx) => [523, 659, 784, 1047].forEach((f, i) =>
    tone(ctx, { from: f, gain: 0.18, duration: 0.3, delay: i * 0.11 })),
}

function playSound(name) {
  if (muted) return
  const voice = VOICES[name]
  if (!voice) return
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()
    voice(ctx)
  } catch { /* blocked or missing audio must not break the loop */ }
}

const setMuted = (value) => { muted = value }
const isMuted = () => muted

export { playSound, setMuted, isMuted }
