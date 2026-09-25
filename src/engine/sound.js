/**
 * Procedural sound. No assets, everything is an oscillator or a noise buffer.
 *
 * The context is created lazily and resumed on demand — browsers start it
 * suspended until a gesture — and every call is wrapped, because audio is never
 * worth crashing a frame over.
 *
 * Three things here are not decoration:
 *
 * **Footfalls carry the ground.** Sand and snow already change the physics, so
 * making them change the footstep teaches the mechanic with nothing written
 * down — you hear the drag before you have finished wondering why the corner
 * came up wrong. It is the same doctrine as the rest of the game: explain with
 * consequence, not with a caption.
 *
 * **The ghost is audible before it is visible.** A drone that rises as it
 * closes gives you the one thing a countdown cannot: which direction to run.
 *
 * **Each terrain has its own air.** A bed per chapter, so the journey sounds
 * like it is going somewhere as well as looking like it.
 *
 * The one-shots are fire-and-forget. The three above are a small persistent
 * graph, torn down whenever a level unmounts — `stopAmbience` is not optional
 * housekeeping, a leaked oscillator plays forever.
 */

const MUTE_KEY = 'maizes:muted'
const VOLUME_KEY = 'maizes:volume'

let audioCtx = null
let volume = (() => {
  try {
    const saved = localStorage.getItem(VOLUME_KEY)
    const stored = saved === null ? NaN : Number(saved)
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.55
  } catch { return 0.55 }
})()
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
})()

function context() {
  if (audioCtx) return audioCtx
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  audioCtx = new Ctor()
  return audioCtx
}

/** Called from a real input gesture, including direct dev-mode entry. */
function unlockAudio() {
  if (muted) return
  try {
    const ctx = context()
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  } catch { /* unsupported audio must not interrupt play */ }
}

/**
 * One second of white noise, made once and reused.
 *
 * Footsteps and wind are noise shaped by a filter, not tones — a sine pretending
 * to be a boot on gravel sounds like a sine.
 */
let noiseBuffer = null
function noise(ctx) {
  if (noiseBuffer) return noiseBuffer
  const frames = ctx.sampleRate
  noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

function tone(ctx, { type = 'sine', from, to, gain, duration, delay = 0 }) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  const start = ctx.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  if (to !== undefined && to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration)
  amp.gain.setValueAtTime(gain * volume, start)
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration)
}

/** A filtered burst of noise: an impact rather than a pitch. */
function thud(ctx, { cutoff, gain, duration, q = 1 }) {
  const source = ctx.createBufferSource()
  source.buffer = noise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  filter.Q.value = q
  const amp = ctx.createGain()
  const now = ctx.currentTime
  amp.gain.setValueAtTime(gain * volume, now)
  amp.gain.exponentialRampToValueAtTime(0.0005, now + duration)
  source.connect(filter).connect(amp).connect(ctx.destination)
  source.start(now)
  source.stop(now + duration)
}

const VOICES = {
  chop: ctx => thud(ctx, { cutoff: 2100, gain: .17, duration: .09 }),
  timber: ctx => {
    thud(ctx, { cutoff: 1400, gain: .2, duration: .24 })
    tone(ctx, { type: 'triangle', from: 180, to: 70, gain: .08, duration: .28 })
  },
  discovery: ctx => [440, 660, 550].forEach((from, i) => tone(ctx, { type: 'sine', from, gain: .1, duration: .4, delay: i * .16 })),
  // Failure needs a readable midrange impact on small speakers, above the
  // low terrain drones. Walking and wall bumps remain deliberately subtle.
  death: (ctx) => {
    thud(ctx, { cutoff: 1600, gain: 0.24, duration: 0.18, q: 0.9 })
    tone(ctx, { type: 'triangle', from: 480, to: 190, gain: 0.17, duration: 0.32 })
  },

  // a knock against a wall: barely there, and rate-limited by the engine
  bump: (ctx) => thud(ctx, { cutoff: 560, gain: 0.028, duration: 0.04, q: 1.2 }),
  capture: (ctx) => tone(ctx, { type: 'triangle', from: 660, to: 880, gain: 0.09, duration: 0.16 }),
  unlock: (ctx) => [659, 988].forEach((f, i) =>
    tone(ctx, { type: 'triangle', from: f, gain: 0.09, duration: 0.22, delay: i * 0.1 })),
  win: (ctx) => [523, 659, 784].forEach((f, i) =>
    tone(ctx, { type: 'triangle', from: f, gain: 0.1, duration: 0.28, delay: i * 0.12 })),

  // the hunter waking: two low notes, falling, so it is unmistakably not a
  // reward sound even with the tab in the background
  hunter: (ctx) => [[196, 0], [147, 0.14]].forEach(([f, delay]) =>
    tone(ctx, { type: 'triangle', from: f, to: f * 0.72, gain: 0.1, duration: 0.3, delay })),

  caught: (ctx) => {
    thud(ctx, { cutoff: 1100, gain: 0.26, duration: 0.26, q: 0.7 })
    tone(ctx, { type: 'triangle', from: 350, to: 150, gain: 0.18, duration: 0.42 })
  },
}

function playSound(name) {
  if (muted || volume === 0) return
  const voice = VOICES[name]
  if (!voice) return
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      return ctx.resume().then(() => {
        if (!muted && volume > 0) voice(ctx)
      }).catch(() => {})
    }
    voice(ctx)
  } catch { /* blocked or missing audio must not break the loop */ }
}

/** Remembered across sessions — a tester who muted once should stay muted. */
function setMuted(value) {
  muted = !!value
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* private mode */ }
  return muted
}

const isMuted = () => muted
const toggleMuted = () => setMuted(!muted)

/**
 * Master volume, 0 to 1, remembered.
 *
 * Applied at the point every sound is made rather than through a master gain
 * node, because the one-shots each build their own tiny graph and connect
 * straight to the destination — routing them all through a shared node would
 * mean keeping that node alive across levels, which is the thing the ambience
 * teardown exists to avoid.
 */
function setVolume(value) {
  volume = Math.max(0, Math.min(1, Number(value) || 0))
  try { localStorage.setItem(VOLUME_KEY, String(volume)) } catch { /* private mode */ }
  return volume
}
const getVolume = () => volume

// ---------------------------------------------------------------- footfalls

/**
 * How the ground sounds underfoot.
 *
 * Ordinary earth is a dull thud. Sand is drier and brighter — hard flat ground
 * you can run on. Snow is quieter and lower, because the sound of deep snow is
 * mostly the sound of it not being there. The three are deliberately far apart
 * in brightness, since a player is meant to notice the change without being
 * told to listen for it.
 */
const FOOTFALLS = {
  0: { cutoff: 420, gain: 0.036, duration: 0.07, q: 1.2 },   // ordinary ground
  1: { cutoff: 1500, gain: 0.032, duration: 0.05, q: 2.4 },  // sand
  2: { cutoff: 240, gain: 0.022, duration: 0.11, q: 0.8 },   // snow
}

/** A single footfall on `surface`. Cheap enough to fire several times a second. */
function playStep(surface = 0) {
  if (muted) return
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()

    const shape = FOOTFALLS[surface] ?? FOOTFALLS[0]
    const source = ctx.createBufferSource()
    source.buffer = noise(ctx)
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    // a little scatter, so a run does not turn into a metronome
    filter.frequency.value = shape.cutoff * (0.85 + Math.random() * 0.3)
    filter.Q.value = shape.q

    const amp = ctx.createGain()
    const now = ctx.currentTime
    amp.gain.setValueAtTime(shape.gain * volume, now)
    amp.gain.exponentialRampToValueAtTime(0.0005, now + shape.duration)

    source.connect(filter).connect(amp).connect(ctx.destination)
    source.start(now)
    source.stop(now + shape.duration)
  } catch { /* audio is never worth a frame */ }
}

// ----------------------------------------------------------------- ambience

/**
 * The air of each terrain: a filtered noise bed plus a low drone.
 *
 * Quiet on purpose — this sits under everything and should be noticed only
 * when it changes, which is once a chapter.
 */
const AMBIENCE = {
  field:     { wind: 380, windGain: 0.007, drone: 82, droneGain: 0.0098 },
  track:     { wind: 460, windGain: 0.0084, drone: 78, droneGain: 0.0091 },
  dusk:      { wind: 300, windGain: 0.0091, drone: 69, droneGain: 0.0112 },
  woods:     { wind: 240, windGain: 0.0105, drone: 62, droneGain: 0.0126 },
  night:     { wind: 190, windGain: 0.0098, drone: 55, droneGain: 0.014 },
  ridge:     { wind: 620, windGain: 0.014, drone: 58, droneGain: 0.0112 },
  desert:    { wind: 720, windGain: 0.0119, drone: 73, droneGain: 0.0084 },
  snow:      { wind: 520, windGain: 0.0154, drone: 49, droneGain: 0.0126 },
  marsh:     { wind: 210, windGain: 0.0112, drone: 52, droneGain: 0.014 },
  enchanted: { wind: 160, windGain: 0.0077, drone: 44, droneGain: 0.0182 },
  ember:     { wind: 340, windGain: 0.0126, drone: 47, droneGain: 0.0154 },
}

let bed = null

/** Start the bed for a terrain. Safe to call repeatedly; replaces what is playing. */
function startAmbience(terrain) {
  stopAmbience()
  if (muted) return
  try {
    const ctx = context()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()

    const air = AMBIENCE[terrain] ?? AMBIENCE.field
    const now = ctx.currentTime

    const wind = ctx.createBufferSource()
    wind.buffer = noise(ctx)
    wind.loop = true
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = air.wind
    const windGain = ctx.createGain()
    windGain.gain.setValueAtTime(0, now)
    windGain.gain.linearRampToValueAtTime(air.windGain * volume, now + 1.5)   // fade in
    wind.connect(windFilter).connect(windGain).connect(ctx.destination)
    wind.start(now)

    const drone = ctx.createOscillator()
    drone.type = 'sine'
    drone.frequency.value = air.drone
    const droneGain = ctx.createGain()
    droneGain.gain.setValueAtTime(0, now)
    droneGain.gain.linearRampToValueAtTime(air.droneGain * volume, now + 1.5)
    drone.connect(droneGain).connect(ctx.destination)
    drone.start(now)

    // the hunter's layer, silent until something is coming
    const dread = ctx.createOscillator()
    dread.type = 'sawtooth'
    dread.frequency.value = air.drone * 0.5
    const dreadFilter = ctx.createBiquadFilter()
    dreadFilter.type = 'lowpass'
    dreadFilter.frequency.value = 200
    const dreadGain = ctx.createGain()
    dreadGain.gain.setValueAtTime(0, now)
    dread.connect(dreadFilter).connect(dreadGain).connect(ctx.destination)
    dread.start(now)

    bed = { ctx, nodes: [wind, drone, dread], gains: [windGain, droneGain], dreadGain }
  } catch { bed = null }
}

/** Stop everything persistent. A leaked oscillator plays until the tab closes. */
function stopAmbience() {
  if (!bed) return
  try {
    const { ctx, nodes, gains, dreadGain } = bed
    const now = ctx.currentTime
    for (const gain of [...gains, dreadGain]) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.2)   // fade, never a click
    }
    for (const node of nodes) node.stop(now + 0.25)
  } catch { /* already gone */ }
  bed = null
}

/**
 * How close the hunter is, 0 (asleep or far) to 1 (on top of you).
 *
 * Ramped rather than set, so a jump in distance does not click, and so the
 * sound swells as it closes instead of switching on.
 */
function setHunterProximity(nearness) {
  if (!bed) return
  try {
    const { ctx, dreadGain } = bed
    const target = Math.max(0, Math.min(1, nearness)) ** 1.6 * 0.06 * volume
    const now = ctx.currentTime
    dreadGain.gain.cancelScheduledValues(now)
    dreadGain.gain.setTargetAtTime(target, now, 0.12)
  } catch { /* audio is never worth a frame */ }
}

export {
  playSound, unlockAudio, setMuted, isMuted, toggleMuted, MUTE_KEY,
  setVolume, getVolume, VOLUME_KEY,
  playStep, startAmbience, stopAmbience, setHunterProximity,
  FOOTFALLS, AMBIENCE,
}
