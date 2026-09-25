import AVFoundation

/*
 * Procedural sound: every voice an oscillator or filtered noise, no assets.
 * A port of src/engine/sound.js onto one AVAudioSourceNode.
 *
 * Web Audio builds a tiny node graph per sound; here each sound is a small
 * struct the render callback steps sample by sample, which reproduces the same
 * envelopes (exponential ramps to a floor, a lowpass whose Q is in decibels as
 * Web Audio's is) without a graph to tear down. The three persistent layers —
 * wind, drone, and the ghost's dread — are one `Bed`.
 *
 * The session is `.ambient`: it obeys the silent switch and mixes with whatever
 * the player is already listening to, which is the polite thing for a quiet
 * game to do.
 */

private enum Wave {
  case sine, triangle, sawtooth

  func at(_ phase: Double) -> Double {
    switch self {
    case .sine: return sin(2 * .pi * phase)
    case .triangle: return 1 - 4 * abs(phase - 0.5)
    case .sawtooth: return 2 * phase - 1
    }
  }
}

private struct Rng {
  var state: UInt64 = 0x9e3779b97f4a7c15

  /// White noise in [-1, 1).
  mutating func next() -> Double {
    state ^= state << 13
    state ^= state >> 7
    state ^= state << 17
    return Double(state >> 11) / Double(1 << 52) - 1
  }
}

/// Web Audio's lowpass biquad. Its Q is in decibels, not a plain ratio.
private struct Biquad {
  var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
  var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

  init() {}

  init(lowpass cutoff: Double, qDb: Double, sampleRate: Double) {
    let w0 = 2 * .pi * min(cutoff, sampleRate * 0.49) / sampleRate
    let alpha = sin(w0) / (2 * pow(10, qDb / 20))
    let cosw = cos(w0)
    let a0 = 1 + alpha
    b0 = (1 - cosw) / 2 / a0
    b1 = (1 - cosw) / a0
    b2 = b0
    a1 = -2 * cosw / a0
    a2 = (1 - alpha) / a0
  }

  mutating func process(_ x: Double) -> Double {
    let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

/// One fire-and-forget sound: a tone with an exponential sweep, or a noise burst.
private struct Voice {
  var wave: Wave?
  var from = 0.0
  var to = 0.0
  var gain: Double
  var floor: Double
  var duration: Double
  var t: Double
  var phase = 0.0
  var filter = Biquad()

  mutating func next(_ dt: Double, _ rng: inout Rng) -> Double? {
    if t < 0 { t += dt; return 0 }
    if t >= duration { return nil }
    let k = t / duration
    let amp = gain > floor ? gain * pow(floor / gain, k) : 0
    let sample: Double
    if let wave {
      phase += from * pow(to / from, k) * dt
      phase -= phase.rounded(.down)
      sample = wave.at(phase)
    } else {
      sample = filter.process(rng.next())
    }
    t += dt
    return sample * amp
  }
}

private struct Air {
  let wind: Double
  let windGain: Double
  let drone: Double
  let droneGain: Double
}

private let AMBIENCE: [String: Air] = [
  "field": Air(wind: 380, windGain: 0.007, drone: 82, droneGain: 0.0098),
  "track": Air(wind: 460, windGain: 0.0084, drone: 78, droneGain: 0.0091),
  "dusk": Air(wind: 300, windGain: 0.0091, drone: 69, droneGain: 0.0112),
  "woods": Air(wind: 240, windGain: 0.0105, drone: 62, droneGain: 0.0126),
  "night": Air(wind: 190, windGain: 0.0098, drone: 55, droneGain: 0.014),
  "ridge": Air(wind: 620, windGain: 0.014, drone: 58, droneGain: 0.0112),
  "desert": Air(wind: 720, windGain: 0.0119, drone: 73, droneGain: 0.0084),
  "snow": Air(wind: 520, windGain: 0.0154, drone: 49, droneGain: 0.0126),
  "marsh": Air(wind: 210, windGain: 0.0112, drone: 52, droneGain: 0.014),
  "enchanted": Air(wind: 160, windGain: 0.0077, drone: 44, droneGain: 0.0182),
  "ember": Air(wind: 340, windGain: 0.0126, drone: 47, droneGain: 0.0154),
]

/// The air of a terrain, and the ghost's layer under it.
private struct Bed {
  var wind: Biquad
  let windGain: Double
  let drone: Double
  let droneGain: Double
  var dread: Biquad
  var dreadGain = 0.0
  var dreadTarget = 0.0
  var t = 0.0
  var dronePhase = 0.0
  var dreadPhase = 0.0
  var fading: Double?

  init(_ air: Air, volume: Double, sampleRate: Double) {
    wind = Biquad(lowpass: air.wind, qDb: 1, sampleRate: sampleRate)
    windGain = air.windGain * volume
    drone = air.drone
    droneGain = air.droneGain * volume
    dread = Biquad(lowpass: 200, qDb: 1, sampleRate: sampleRate)
  }

  var silent: Bool { (fading ?? 0) >= 0.25 }

  mutating func next(_ dt: Double, _ rng: inout Rng, _ dreadEase: Double) -> Double {
    var level = min(1, t / 1.5)          // fade in
    var out = 1.0
    if let f = fading {
      out = max(0, 1 - f / 0.2)          // fade, never a click
      fading = f + dt
    }
    level *= out
    t += dt

    let w = wind.process(rng.next()) * windGain * level

    dronePhase += drone * dt
    dronePhase -= dronePhase.rounded(.down)
    let d = sin(2 * .pi * dronePhase) * droneGain * level

    dreadGain += (dreadTarget - dreadGain) * dreadEase
    dreadPhase += drone * 0.5 * dt
    dreadPhase -= dreadPhase.rounded(.down)
    let r = dread.process(2 * dreadPhase - 1) * dreadGain * out

    return w + d + r
  }
}

final class Sound {
  static let shared = Sound()

  private let engine = AVAudioEngine()
  private var configured = false
  private var sampleRate = 44_100.0

  private struct Inbox {
    var voices: [Voice] = []
    var bed: Bed??                       // .some(nil) stops the bed
    var proximity: Double?
  }

  private let lock = NSLock()
  private var inbox = Inbox()

  // render thread only
  private var voices: [Voice] = []
  private var bed: Bed?
  private var fadingBed: Bed?
  private var rng = Rng()

  private var settings: Settings { .shared }

  private init() {}

  private func running() -> Bool {
    if !configured {
      configured = true
      try? AVAudioSession.sharedInstance().setCategory(.ambient)
      try? AVAudioSession.sharedInstance().setActive(true)
      let rate = engine.outputNode.inputFormat(forBus: 0).sampleRate
      sampleRate = rate > 0 ? rate : 44_100
      guard let mono = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else { return false }
      let node = AVAudioSourceNode(format: mono) { [unowned self] _, _, frames, list in
        self.render(Int(frames), UnsafeMutableAudioBufferListPointer(list))
        return noErr
      }
      engine.attach(node)
      engine.connect(node, to: engine.mainMixerNode, format: mono)
      voices.reserveCapacity(32)
    }
    // interruptions and route changes stop the engine; the next sound restarts it
    if !engine.isRunning { try? engine.start() }
    return engine.isRunning
  }

  private func post(_ change: (inout Inbox) -> Void) {
    lock.lock()
    change(&inbox)
    lock.unlock()
  }

  // ponytail: a lock shared with the render thread. Contention is a few posts a
  // second; a lock-free ring buffer is the upgrade if it ever glitches.
  private func render(_ frames: Int, _ buffers: UnsafeMutableAudioBufferListPointer) {
    lock.lock()
    let mail = inbox
    inbox = Inbox()
    lock.unlock()

    voices.append(contentsOf: mail.voices)
    if let replacement = mail.bed {
      if var old = bed { old.fading = 0; fadingBed = old }
      bed = replacement
    }
    if let target = mail.proximity { bed?.dreadTarget = target }

    guard let out = buffers.first?.mData?.assumingMemoryBound(to: Float.self) else { return }
    let dt = 1 / sampleRate
    let dreadEase = 1 - exp(-dt / 0.12)

    for i in 0..<frames {
      var sample = 0.0
      var v = 0
      while v < voices.count {
        if let s = voices[v].next(dt, &rng) {
          sample += s
          v += 1
        } else {
          voices.swapAt(v, voices.count - 1)
          voices.removeLast()
        }
      }
      if bed != nil { sample += bed!.next(dt, &rng, dreadEase) }
      if fadingBed != nil {
        sample += fadingBed!.next(dt, &rng, dreadEase)
        if fadingBed!.silent { fadingBed = nil }
      }
      out[i] = Float(sample)
    }
  }

  private func tone(_ wave: Wave, _ from: Double, _ to: Double? = nil, gain: Double, duration: Double, delay: Double = 0) -> Voice {
    Voice(wave: wave, from: from, to: to ?? from, gain: gain * settings.volume, floor: 0.001, duration: duration, t: -delay)
  }

  private func thud(cutoff: Double, gain: Double, duration: Double, q: Double = 1) -> Voice {
    Voice(wave: nil, gain: gain * settings.volume, floor: 0.0005, duration: duration, t: 0,
          filter: Biquad(lowpass: cutoff, qDb: q, sampleRate: sampleRate))
  }

  func play(_ cue: SoundCue) {
    guard !settings.muted, running() else { return }
    let made: [Voice]
    switch cue {
    case .death:
      made = [thud(cutoff: 800, gain: 0.13, duration: 0.12, q: 0.9),
              tone(.triangle, 300, 130, gain: 0.10, duration: 0.2)]
    case .bump:
      made = [thud(cutoff: 560, gain: 0.028, duration: 0.04, q: 1.2)]
    case .capture:
      made = [tone(.triangle, 660, 880, gain: 0.09, duration: 0.16)]
    case .unlock:
      made = [659.0, 988].enumerated().map { i, f in
        tone(.triangle, f, gain: 0.09, duration: 0.22, delay: Double(i) * 0.1)
      }
    case .win:
      made = [523.0, 659, 784].enumerated().map { i, f in
        tone(.triangle, f, gain: 0.1, duration: 0.28, delay: Double(i) * 0.12)
      }
    case .hunter:
      made = [(196.0, 0.0), (147, 0.14)].map { f, delay in
        tone(.triangle, f, f * 0.72, gain: 0.1, duration: 0.3, delay: delay)
      }
    case .caught:
      made = [thud(cutoff: 450, gain: 0.15, duration: 0.26, q: 0.7),
              tone(.triangle, 220, 90, gain: 0.1, duration: 0.36)]
    }
    post { $0.voices.append(contentsOf: made) }
  }

  /// A footfall that carries the ground: dull earth, bright sand, muffled snow.
  func step(_ surface: UInt8) {
    guard !settings.muted, running() else { return }
    let shape: (cutoff: Double, gain: Double, duration: Double, q: Double) =
      surface == SAND ? (1500, 0.032, 0.05, 2.4) :
      surface == SNOW ? (240, 0.022, 0.11, 0.8) :
      (420, 0.036, 0.07, 1.2)
    // a little scatter, so a run does not turn into a metronome
    let voice = thud(cutoff: shape.cutoff * Double.random(in: 0.85..<1.15), gain: shape.gain,
                     duration: shape.duration, q: shape.q)
    post { $0.voices.append(voice) }
  }

  func startAmbience(_ terrain: String) {
    guard !settings.muted else { stopAmbience(); return }
    guard running() else { return }
    let bed = Bed(AMBIENCE[terrain] ?? AMBIENCE["field"]!, volume: settings.volume, sampleRate: sampleRate)
    post { $0.bed = .some(bed) }
  }

  func stopAmbience() {
    guard configured else { return }
    post { $0.bed = .some(nil) }
  }

  /// 0 asleep or far, 1 on top of you. Ramped on the render thread.
  func setHunterProximity(_ nearness: Double) {
    guard configured else { return }
    let target = pow(max(0, min(1, nearness)), 1.6) * 0.06 * settings.volume
    post { $0.proximity = target }
  }
}
