import SwiftUI

/*
 * One field in play: the fixed-timestep loop, the camera, the touch stick, and
 * the handful of values the HUD shows. Ports of src/engine/loop.js,
 * src/ui/useGameLoop.js, useGameInput.js and the state half of Play.jsx.
 *
 * The simulation runs off a CADisplayLink and never through SwiftUI. The board
 * is redrawn by a TimelineView reading the same Game object, and the HUD is
 * published ten times a second rather than sixty.
 */

struct BoardView: Equatable {
  let cellSize: Double
  let viewCols: Int
  let viewRows: Int
  let scrolls: Bool

  /// Fit the board, or — below a readable cell size — a window that follows the hat.
  static func measure(cols: Int, rows: Int, width: Double, height: Double) -> BoardView {
    let fit = (min(width / Double(cols), height / Double(rows))).rounded(.down)
    if fit >= 26 {
      return BoardView(cellSize: min(72, fit), viewCols: cols, viewRows: rows, scrolls: false)
    }
    return BoardView(cellSize: 26,
                     viewCols: min(cols, max(6, Int(width / 26))),
                     viewRows: min(rows, max(5, Int(height / 26))),
                     scrolls: true)
  }
}

final class PlayModel: ObservableObject {
  struct Hud: Equatable {
    var now = 0.0
    var captured = 0
    var exitOpen = false
    var hunterAwake = false
    var hunterIn: Int?
    var quip = ""
  }

  struct Outcome {
    let deaths: Int
    let ms: Double
    let par: Double?
  }

  let level: Level
  let game: Game
  let par: Double?

  @Published private(set) var hud = Hud()
  @Published private(set) var result: Outcome?
  @Published private(set) var lost = false
  @Published private(set) var caughtLine = ""
  @Published private(set) var paused = false
  @Published private(set) var intro = true
  @Published private(set) var whisper: String?

  var view: BoardView? {
    didSet { if view != oldValue { game.camera = nil } }
  }

  private var link: CADisplayLink?
  private var last: CFTimeInterval?
  private var accumulator = 0.0
  private var lastHud = 0.0
  private var timers: [DispatchWorkItem] = []
  private var origin: CGPoint?

  init(level: Level) {
    self.level = level
    let progress = Progress.shared
    game = Game(level.grid, assist: Settings.shared.assist)
    par = progress.speedrunActive ? progress.parFor(level.name) : nil

    // the field opens paused under its title, and the clock with it
    game.paused = true
    game.onSound = { Sound.shared.play($0) }
    game.onStep = { Sound.shared.step($0) }
    game.onWin = { [weak self] in self?.won() }
    game.onLose = { [weak self] _ in
      guard let self else { return }
      lost = true
      caughtLine = game.quip
    }
  }

  private func won() {
    Progress.shared.recordWin(level.name, deaths: game.deaths, ms: game.now)
    let outcome = Outcome(deaths: game.deaths, ms: game.now, par: par)
    // the card waits for the hat to go in; the numbers on it are already fixed
    after(BoardArt.outroMs + 120) { [weak self] in self?.result = outcome }
  }

  private func after(_ ms: Double, _ work: @escaping () -> Void) {
    let item = DispatchWorkItem(block: work)
    timers.append(item)
    DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000, execute: item)
  }

  // ------------------------------------------------------------------- loop

  private final class Tick: NSObject {
    weak var model: PlayModel?
    init(_ model: PlayModel) { self.model = model }
    @objc func frame(_ link: CADisplayLink) { model?.frame(link) }
  }

  func start() {
    guard link == nil else { return }
    let link = CADisplayLink(target: Tick(self), selector: #selector(Tick.frame))
    link.add(to: .main, forMode: .common)
    self.link = link

    after(1300) { [weak self] in self?.endIntro() }
    if let line = WHISPERS[level.name] {
      after(4500) { [weak self] in self?.whisper = line }
      after(13000) { [weak self] in self?.whisper = nil }
    }
  }

  func stop() {
    link?.invalidate()
    link = nil
    timers.forEach { $0.cancel() }
    timers = []
    Sound.shared.setHunterProximity(0)
  }

  private func frame(_ link: CADisplayLink) {
    let timestamp = link.timestamp * 1000
    var delta = last.map { timestamp - $0 } ?? 0
    last = timestamp
    // back from the background: a pause, not a debt to simulate through
    if delta > 250 { delta = STEP_MS }
    accumulator += delta

    var steps = 0
    while accumulator >= STEP_MS && steps < 5 {
      game.step()
      accumulator -= STEP_MS
      steps += 1
    }
    if steps == 5 { accumulator = 0 }

    if let view, view.scrolls { aimCamera(view) }

    if timestamp - lastHud >= 100 {
      lastHud = timestamp
      publishHud()
    }
  }

  /// The window eases after the hat, clamped to the board. Snaps on the first frame.
  private func aimCamera(_ view: BoardView) {
    let grid = game.grid
    let wantX = max(0, min(Double(grid.cols - view.viewCols), game.ball.x - Double(view.viewCols) / 2))
    let wantY = max(0, min(Double(grid.rows - view.viewRows), game.ball.y - Double(view.viewRows) / 2))
    guard var camera = game.camera else {
      game.camera = Point(x: wantX, y: wantY)
      return
    }
    camera.x += (wantX - camera.x) * 0.14
    camera.y += (wantY - camera.y) * 0.14
    game.camera = camera
  }

  private func publishHud() {
    let next = Hud(now: game.now, captured: game.captured.count, exitOpen: game.exitOpen,
                   hunterAwake: game.hunter?.active ?? false, hunterIn: game.hunterIn, quip: game.quip)
    if next != hud { hud = next }

    if let hunter = game.hunter, hunter.active {
      let span = hypot(Double(game.grid.cols), Double(game.grid.rows))
      let gap = hypot(hunter.x - game.ball.x, hunter.y - game.ball.y)
      Sound.shared.setHunterProximity(1 - min(1, gap / (span * 0.6)))
    } else {
      Sound.shared.setHunterProximity(0)
    }
  }

  // ---------------------------------------------------------------- actions

  func endIntro() {
    guard intro else { return }
    intro = false
    if !paused && !game.won && !game.lost { game.paused = false }
  }

  func pause(_ next: Bool) {
    if game.won { return }
    game.paused = next
    paused = next
    if next { game.input.clear() }
  }

  func togglePause() { pause(!paused) }

  func restart() {
    if game.won { return }
    game.restart()
    lost = false
    pause(false)
  }

  // ------------------------------------------------------------------ input

  /// A drag on the board is a stick whose origin follows the finger.
  func drag(_ location: CGPoint) {
    endIntro()
    guard let view else { return }
    guard let o = origin else {
      origin = location
      showStick(location, 0, 0, view)
      return
    }
    var dx = location.x - o.x
    var dy = location.y - o.y
    let distance = hypot(dx, dy)
    var start = o
    if distance > 34 {
      let excess = distance - 34
      start = CGPoint(x: o.x + (dx / distance) * excess, y: o.y + (dy / distance) * excess)
      origin = start
      dx = (dx / distance) * 34
      dy = (dy / distance) * 34
    }
    game.input.left = dx < -8
    game.input.right = dx > 8
    game.input.up = dy < -8
    game.input.down = dy > 8
    showStick(start, dx, dy, view)
  }

  func release() {
    origin = nil
    game.stick = nil
    game.input.clear()
  }

  private func showStick(_ at: CGPoint, _ dx: Double, _ dy: Double, _ view: BoardView) {
    let s = view.cellSize
    game.stick = Stick(x: at.x / s + (game.camera?.x ?? 0), y: at.y / s + (game.camera?.y ?? 0),
                       dx: dx / s, dy: dy / s)
  }
}
