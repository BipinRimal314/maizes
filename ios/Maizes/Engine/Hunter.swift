import Foundation

/*
 * The hunter. A port of src/engine/hunter.js.
 *
 * Same two fairness invariants, same reasons: it cannot catch you through a
 * wall, and it is strictly slower than the ball on the slowest ground of the
 * grid it is on. Both are enforced by the JS tests against the shipped levels
 * and carried here by the parity traces.
 */

let BALL_TOP_SPEED = (Physics.accel * Physics.friction) / (1 - Physics.friction)
let HUNTER_SPEED_SHARE = 0.67
let CATCH_DISTANCE = 0.5
let WAKE_WARNING_MS = 2500.0
let HUNTER_RADIUS = 0.3

final class Hunter {
  var x = 0.0
  var y = 0.0
  var active = false
  let spawnMs: Double
  var wakesAt: Double
  let speed: Double
  let radius = HUNTER_RADIUS
  private var field: [Int32]?
  private var fieldFrom: Cell?

  /// `pace` comes from the assist settings; 1 is the game as designed.
  init?(_ grid: Grid, pace: Double = 1) {
    guard let spec = grid.hunter else { return nil }
    spawnMs = spec.spawnMs
    wakesAt = spec.spawnMs
    let cap = BALL_TOP_SPEED * Physics.slowestSurface(grid) * HUNTER_SPEED_SHARE
    speed = min(spec.speed, cap) * pace
  }

  /// Back to sleep, clock restarted. Called on every return to the start.
  func sleep(_ now: Double) {
    active = false
    wakesAt = now + spawnMs
    field = nil
    fieldFrom = nil
  }

  /// The cell furthest from the player through the maze.
  static func spawnCell(_ grid: Grid, _ from: Cell) -> Cell {
    var best = from
    var bestD = -1
    var seen = [Int](repeating: -1, count: grid.cols * grid.rows)
    seen[from.y * grid.cols + from.x] = 0
    var queue = [from]
    var head = 0

    while head < queue.count {
      let at = queue[head]
      head += 1
      let d = seen[at.y * grid.cols + at.x]
      if d > bestD { best = at; bestD = d }

      for direction in DIRECTIONS where grid.isOpen(at.x, at.y, direction) {
        let nx = at.x + direction.dx
        let ny = at.y + direction.dy
        if seen[ny * grid.cols + nx] != -1 { continue }
        seen[ny * grid.cols + nx] = d + 1
        queue.append(Cell(x: nx, y: ny))
      }
    }
    return best
  }

  static func distanceField(_ grid: Grid, _ from: Cell) -> [Int32] {
    var field = [Int32](repeating: -1, count: grid.cols * grid.rows)
    field[from.y * grid.cols + from.x] = 0
    var queue = [from]
    var head = 0

    while head < queue.count {
      let at = queue[head]
      head += 1
      let d = field[at.y * grid.cols + at.x]
      for direction in DIRECTIONS where grid.isOpen(at.x, at.y, direction) {
        let nx = at.x + direction.dx
        let ny = at.y + direction.dy
        if field[ny * grid.cols + nx] != -1 { continue }
        field[ny * grid.cols + nx] = d + 1
        queue.append(Cell(x: nx, y: ny))
      }
    }
    return field
  }

  static func stepTowards(_ grid: Grid, _ field: [Int32], _ from: Cell) -> Cell? {
    let here = field[from.y * grid.cols + from.x]
    if here <= 0 { return nil }
    for direction in DIRECTIONS where grid.isOpen(from.x, from.y, direction) {
      let nx = from.x + direction.dx
      let ny = from.y + direction.dy
      if field[ny * grid.cols + nx] == here - 1 { return Cell(x: nx, y: ny) }
    }
    return nil
  }

  /// Same cell, or two cells with an open edge between them. Never through a wall.
  static func canTouch(_ grid: Grid, _ a: Cell, _ b: Cell) -> Bool {
    if a == b { return true }
    for direction in DIRECTIONS where a.x + direction.dx == b.x && a.y + direction.dy == b.y {
      return grid.isOpen(a.x, a.y, direction)
    }
    return false
  }

  /// One fixed step. True if it caught the ball.
  func step(_ grid: Grid, _ ball: Ball, _ now: Double) -> Bool {
    if !active {
      if now < wakesAt { return false }
      active = true
      let at = Hunter.spawnCell(grid, ball.cell)
      x = Double(at.x) + 0.5
      y = Double(at.y) + 0.5
    }

    let player = ball.cell
    if !grid.inBounds(player.x, player.y) { return false }

    if field == nil || fieldFrom != player {
      field = Hunter.distanceField(grid, player)
      fieldFrom = player
    }
    let field = self.field!

    var budget = speed
    while budget > 1e-9 {
      let at = Cell(x: cellOf(x), y: cellOf(y))
      let target = Hunter.stepTowards(grid, field, at) ?? at
      let dx = Double(target.x) + 0.5 - x
      let dy = Double(target.y) + 0.5 - y
      let distance = jsHypot(dx, dy)
      if distance < 1e-9 { break }

      let travel = min(budget, distance)
      x += (dx / distance) * travel
      y += (dy / distance) * travel
      budget -= travel
    }

    let cell = Cell(x: cellOf(x), y: cellOf(y))
    let touching = jsHypot(x - ball.x, y - ball.y) < CATCH_DISTANCE
    return touching && Hunter.canTouch(grid, cell, player)
  }

  /// 0 while asleep and far off, 1 the moment it wakes. Presentation only.
  func wakeProgress(_ now: Double) -> Double {
    if active { return 1 }
    let remaining = wakesAt - now
    if remaining >= WAKE_WARNING_MS { return 0 }
    return 1 - remaining / WAKE_WARNING_MS
  }
}
