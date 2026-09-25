import XCTest
@testable import Maizes

/*
 * The Swift rules are the same game as the JS rules, or they are not.
 *
 * Every level shipped in levels.json was proven beatable by a simulated player
 * driving src/engine. That proof only covers this app if the port lands on the
 * same state from the same inputs — so this replays traces recorded from the
 * JS engine (`npm run traces`) and compares every checkpoint exactly: doubles
 * by bit pattern, not within a tolerance. A tolerance would hide the one-ulp
 * drift that, a few thousand steps later, is a ball on the other side of a
 * corner.
 *
 * Regenerate the traces whenever the JS engine or the campaign changes.
 */
final class ParityTests: XCTestCase {
  private struct TraceFile: Decodable {
    let levels: [LevelTraces]
  }

  private struct LevelTraces: Decodable {
    let name: String
    let hunter: [String]?
    let traces: [String: Trace]
  }

  private struct Trace: Decodable {
    let inputs: [[Int]]
    let checkpoints: [Checkpoint]
  }

  /// Field order is set by `checkpoint()` in src/scripts/traces.js.
  private struct Checkpoint: Decodable {
    let step: Int
    let now, x, y, vx, vy: UInt64
    let hunter: (x: UInt64, y: UInt64, active: Bool, wakesAt: UInt64)?
    let deaths, captured: Int
    let won, lost, exitOpen: Bool
    let quip: String
    let fx, trail, visited: Int
    let shake: UInt64

    init(from decoder: Decoder) throws {
      var c = try decoder.unkeyedContainer()
      func bits() throws -> UInt64 { UInt64(try c.decode(String.self), radix: 16)! }
      step = try c.decode(Int.self)
      now = try bits()
      x = try bits()
      y = try bits()
      vx = try bits()
      vy = try bits()
      if try c.decodeNil() {
        hunter = nil
      } else {
        var h = try c.nestedUnkeyedContainer()
        let hx = UInt64(try h.decode(String.self), radix: 16)!
        let hy = UInt64(try h.decode(String.self), radix: 16)!
        let active = try h.decode(Int.self) == 1
        let wakes = UInt64(try h.decode(String.self), radix: 16)!
        hunter = (hx, hy, active, wakes)
      }
      deaths = try c.decode(Int.self)
      captured = try c.decode(Int.self)
      won = try c.decode(Int.self) == 1
      lost = try c.decode(Int.self) == 1
      exitOpen = try c.decode(Int.self) == 1
      quip = try c.decode(String.self)
      fx = try c.decode(Int.self)
      trail = try c.decode(Int.self)
      visited = try c.decode(Int.self)
      shake = try bits()
    }
  }

  /// The first way `game` differs from `expected`, or nil.
  private func difference(_ game: Game, _ expected: Checkpoint) -> String? {
    func bits(_ name: String, _ value: Double, _ want: UInt64) -> String? {
      value.bitPattern == want ? nil : "\(name) \(value) != \(Double(bitPattern: want))"
    }
    if let d = bits("now", game.now, expected.now) { return d }
    if let d = bits("ball.x", game.ball.x, expected.x) { return d }
    if let d = bits("ball.y", game.ball.y, expected.y) { return d }
    if let d = bits("ball.vx", game.ball.vx, expected.vx) { return d }
    if let d = bits("ball.vy", game.ball.vy, expected.vy) { return d }

    switch (game.hunter, expected.hunter) {
    case (nil, nil): break
    case let (h?, e?):
      if let d = bits("hunter.x", h.x, e.x) { return d }
      if let d = bits("hunter.y", h.y, e.y) { return d }
      if h.active != e.active { return "hunter.active \(h.active) != \(e.active)" }
      if let d = bits("hunter.wakesAt", h.wakesAt, e.wakesAt) { return d }
    default: return "hunter presence differs"
    }

    if game.deaths != expected.deaths { return "deaths \(game.deaths) != \(expected.deaths)" }
    if game.captured.count != expected.captured { return "captured \(game.captured.count) != \(expected.captured)" }
    if game.won != expected.won { return "won \(game.won) != \(expected.won)" }
    if game.lost != expected.lost { return "lost \(game.lost) != \(expected.lost)" }
    if game.exitOpen != expected.exitOpen { return "exitOpen \(game.exitOpen) != \(expected.exitOpen)" }
    if game.quip != expected.quip { return "quip \"\(game.quip)\" != \"\(expected.quip)\"" }
    if game.fx.count != expected.fx { return "fx \(game.fx.count) != \(expected.fx)" }
    if game.trail.count != expected.trail { return "trail \(game.trail.count) != \(expected.trail)" }
    if game.visited.count != expected.visited { return "visited \(game.visited.count) != \(expected.visited)" }
    if let d = bits("shake", game.shake, expected.shake) { return d }
    return nil
  }

  func testEveryLevelReplaysTheJavaScriptEngineExactly() throws {
    let url = try XCTUnwrap(Bundle(for: ParityTests.self).url(forResource: "traces", withExtension: "json"))
    let file = try JSONDecoder().decode(TraceFile.self, from: Data(contentsOf: url))
    let campaign = Level.campaign()
    XCTAssertEqual(campaign.map(\.name), file.levels.map(\.name), "traces are stale: run npm run traces")

    var replayed = 0
    for (level, recorded) in zip(campaign, file.levels) {
      if let spec = recorded.hunter {
        XCTAssertEqual(level.grid.hunter?.spawnMs.bitPattern, UInt64(spec[0], radix: 16), "\(level.name) spawnMs decoded differently")
        XCTAssertEqual(level.grid.hunter?.speed.bitPattern, UInt64(spec[1], radix: 16), "\(level.name) hunter speed decoded differently")
      }

      for (name, trace) in recorded.traces.sorted(by: { $0.key < $1.key }) {
        let game = Game(level.grid)
        let periodic = trace.checkpoints.dropLast()
        var next = periodic.startIndex
        var step = 0
        var failed = false

        replay: for entry in trace.inputs {
          let mask = entry[0]
          if mask == -1 { game.restart(); continue }
          game.input = Input(up: mask & 1 != 0, down: mask & 2 != 0, left: mask & 4 != 0, right: mask & 8 != 0)
          for _ in 0..<entry[1] {
            game.step()
            step += 1
            replayed += 1
            if next < periodic.endIndex && periodic[next].step == step {
              if let d = difference(game, periodic[next]) {
                XCTFail("\(level.name) / \(name) diverged at step \(step): \(d)")
                failed = true
                break replay
              }
              next += 1
            }
          }
        }

        if !failed, let last = trace.checkpoints.last {
          XCTAssertEqual(step, last.step, "\(level.name) / \(name) replayed a different number of steps")
          if let d = difference(game, last) {
            XCTFail("\(level.name) / \(name) differs at the end: \(d)")
          }
        }
      }
    }
    XCTAssertGreaterThan(replayed, 100_000)
  }
}
