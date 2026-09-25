import Foundation

/*
 * Game state and one fixed step of simulation. A port of src/engine/game.js.
 *
 * The rule set, the order things resolve in within a step, and the reason the
 * hunter is stepped last are all documented there; this file keeps that order
 * exactly, because `ParityTests` replays JS traces against it.
 */

let STEP_MS = 1000.0 / 60
let TRAIL_LENGTH = 14
let RESPAWN_FLASH_MS = 450.0
let CAPTURE_FLASH_MS = 700.0
let BUMP_SOUND_GAP_MS = 140.0

enum SoundCue {
  case death, bump, capture, unlock, win, hunter, caught
}

struct Flash {
  let x: Int
  let y: Int
  let until: Double
  let trap: Bool
}

struct Point {
  var x: Double
  var y: Double
}

/// The touch stick, in cell coordinates, while a finger is down.
struct Stick {
  var x: Double
  var y: Double
  var dx: Double
  var dy: Double
}

struct Assist: Codable, Equatable {
  var steadyBoard = false
  var fogBonus = 0.0
  var ghostPace = 1.0

  /// The game as designed, and all any trace or proof ever sees.
  static let neutral = Assist()
}

final class Game {
  let grid: Grid
  let assist: Assist
  var ball: Ball
  var input = Input()

  var now = 0.0
  var won = false
  var lost = false
  var paused = false
  var deaths = 0

  let traps: Set<Cell>
  let flags: Set<Cell>
  /// In the order they were picked, as the JS Set iterates.
  private(set) var captured: [Cell] = []
  var exitOpen: Bool

  private(set) var hunter: Hunter?
  private(set) var visited: [Cell: Double]

  // presentation, read by the renderer
  private(set) var flash: Flash?
  private(set) var shake = 0.0
  private(set) var trail: [Point] = []
  private var cell: Cell?
  private(set) var quip = ""
  var camera: Point?
  private(set) var fx: [Fx] = []
  private(set) var outro = 0.0
  var stick: Stick?
  private var lastBump = -1e9

  /// Where in the oath list this field starts, so every field opens differently.
  let quipOffset: Int

  var onDeath: ((Cell) -> Void)?
  var onCapture: ((Cell) -> Void)?
  var onStep: ((UInt8) -> Void)?
  var onWin: (() -> Void)?
  var onLose: ((Cell) -> Void)?
  var onSound: ((SoundCue) -> Void)?

  init(_ grid: Grid, assist: Assist = .neutral) {
    self.grid = grid
    self.assist = assist
    ball = Ball(at: grid.start)
    traps = Set(grid.traps)
    flags = Set(grid.flags)
    exitOpen = grid.flags.isEmpty
    hunter = Hunter(grid, pace: assist.ghostPace)
    visited = [grid.start: 0]
    quipOffset = grid.start.x * 31 + grid.start.y * 17 + grid.flags.count * 7
  }

  func isCaptured(_ c: Cell) -> Bool { captured.contains(c) }

  private func pushFx(_ kind: FxKind, _ x: Double, _ y: Double, caught: Bool = false, axisX: Bool = false) {
    fx.append(Fx(kind: kind, x: x, y: y, at: now, caught: caught, axisX: axisX))
    if fx.count > FX_MAX { fx.removeFirst() }
  }

  private func pushFx(_ kind: FxKind, _ c: Cell, caught: Bool = false) {
    pushFx(kind, Double(c.x), Double(c.y), caught: caught)
  }

  private func pruneFx() {
    while let first = fx.first, now - first.at >= first.kind.life { fx.removeFirst() }
  }

  func latestFx(_ kind: FxKind) -> Fx? { fx.last { $0.kind == kind } }

  private func quipFor() -> String {
    if deaths <= QUIPS_BEFORE_WEARY {
      return DEATH_QUIPS[(quipOffset + deaths) % DEATH_QUIPS.count]
    }
    return WEARY_QUIPS[(quipOffset + deaths) % WEARY_QUIPS.count]
  }

  /// A trap. On a hunted field it costs every picked ear too.
  private func die(_ at: Cell) {
    deaths += 1
    shake = assist.steadyBoard ? 0 : 170
    ball = Ball(at: grid.start)
    hunter?.sleep(now)
    flash = Flash(x: at.x, y: at.y, until: now + RESPAWN_FLASH_MS, trap: true)
    trail = []

    if hunter != nil && !captured.isEmpty {
      for c in captured { pushFx(.unpick, c) }
      captured.removeAll()
      exitOpen = grid.flags.isEmpty
      quip = LOST_MAIZE_QUIPS[(quipOffset + deaths) % LOST_MAIZE_QUIPS.count]
    } else {
      quip = quipFor()
    }
    pushFx(.fall, at)
    pushFx(.spawn, grid.start)
    onSound?(.death)
    onDeath?(at)
  }

  /// Caught. The attempt is over; the board stays as it was.
  private func lose(_ at: Cell) {
    lost = true
    shake = assist.steadyBoard ? 0 : 300
    flash = Flash(x: at.x, y: at.y, until: now + RESPAWN_FLASH_MS, trap: true)
    pushFx(.fall, at, caught: true)
    quip = CAUGHT_QUIPS[(quipOffset + deaths + 1) % CAUGHT_QUIPS.count]
    onSound?(.caught)
    onLose?(at)
  }

  /// Picking an ear throws you back to the start. It is progress, never undone.
  private func capture(_ at: Cell) {
    if captured.contains(at) { return }
    captured.append(at)
    exitOpen = captured.count >= grid.flags.count
    ball = Ball(at: grid.start)
    hunter?.sleep(now)
    flash = Flash(x: at.x, y: at.y, until: now + CAPTURE_FLASH_MS, trap: false)
    quip = exitOpen ? PICKED_LAST : PICKED_ONE
    trail = []
    pushFx(.pick, at)
    if exitOpen { pushFx(.unlock, at) }
    pushFx(.spawn, grid.start)
    onSound?(exitOpen ? .unlock : .capture)
    onCapture?(at)
  }

  /// One fixed step. `now` advances by exactly STEP_MS.
  func step() {
    if won { outro += STEP_MS; return }
    if lost || paused { return }

    now += STEP_MS
    if shake > 0 { shake = max(0, shake - STEP_MS) }
    pruneFx()

    let vxBefore = ball.vx
    let vyBefore = ball.vy
    ball.step(input, grid)

    if let struck = bumpAxis(vxBefore, vyBefore, ball) {
      let sx = vxBefore > 0 ? 1.0 : vxBefore < 0 ? -1.0 : 0
      let sy = vyBefore > 0 ? 1.0 : vyBefore < 0 ? -1.0 : 0
      pushFx(.bump,
             ball.x + (struck == "x" ? sx * ball.radius : 0),
             ball.y + (struck == "y" ? sy * ball.radius : 0),
             axisX: struck == "x")
      if now - lastBump > BUMP_SOUND_GAP_MS {
        lastBump = now
        onSound?(.bump)
      }
    }

    if trail.isEmpty || now.truncatingRemainder(dividingBy: 50) < STEP_MS {
      trail.append(Point(x: ball.x, y: ball.y))
      if trail.count > TRAIL_LENGTH { trail.removeFirst() }
    }

    let here = ball.cell

    if cell != here {
      cell = here
      onStep?(grid.surfaceAt(here.x, here.y))
    }

    if traps.contains(here) {
      die(here)
      return
    }

    if flags.contains(here) && !captured.contains(here) {
      capture(here)
      return
    }

    visited[here] = now

    if exitOpen && here == grid.end {
      won = true
      onSound?(.win)
      onWin?()
      return
    }

    // last, so an exit or an ear reached on the same step as the hunter wins
    let wasAsleep = hunter != nil && !hunter!.active
    if let hunter, hunter.step(grid, ball, now) {
      lose(here)
    } else if wasAsleep && hunter!.active {
      quip = GHOST_WOKE
      pushFx(.wake, hunter!.x, hunter!.y)
      onSound?(.hunter)
    }
  }

  /// Start the attempt again. The level itself is never modified, so this is total.
  func restart() {
    ball = Ball(at: grid.start)
    now = 0
    hunter = Hunter(grid, pace: assist.ghostPace)
    won = false
    lost = false
    deaths = 0
    captured.removeAll()
    exitOpen = grid.flags.isEmpty
    visited = [grid.start: 0]
    flash = nil
    shake = 0
    trail = []
    cell = nil
    quip = ""
    fx = []
    outro = 0
    lastBump = -1e9
  }

  /// Seconds of quiet left before the hunter wakes; nil once it is up or absent.
  var hunterIn: Int? {
    guard let hunter, !hunter.active else { return nil }
    return max(0, Int(((hunter.wakesAt - now) / 1000).rounded(.up)))
  }
}
