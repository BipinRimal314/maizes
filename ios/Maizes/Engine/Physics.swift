import Foundation

/*
 * Ball movement and collision. A port of src/engine/physics.js, operation for
 * operation: cell units, a fixed step, and each axis resolved separately. The
 * reasons for all three are in the JS file and hold here unchanged.
 */

enum Physics {
  static let radius = 0.22
  static let accel = 0.036
  static let friction = 0.82
  static let maxSpeed = 0.42
  static let bounce = -0.3
  static let substeps = 4.0

  /// Sand throws the ball along, snow has to be waded. Only acceleration scales.
  static func factor(_ kind: UInt8) -> Double {
    kind == SAND ? 1.55 : kind == SNOW ? 0.72 : 1
  }

  static func surfaceFactor(_ grid: Grid, _ x: Double, _ y: Double) -> Double {
    factor(grid.surfaceAt(cellOf(x), cellOf(y)))
  }

  static func slowestSurface(_ grid: Grid) -> Double {
    var slowest = 1.0
    for kind in grid.surface {
      let f = factor(kind)
      if f < slowest { slowest = f }
    }
    return slowest
  }

  /// Push a point out of any wall its circle overlaps.
  static func resolve(_ x0: Double, _ y0: Double, _ radius: Double, _ grid: Grid)
    -> (x: Double, y: Double, hitX: Bool, hitY: Bool)
  {
    var x = x0
    var y = y0
    var hitX = false
    var hitY = false
    let cols = Double(grid.cols)
    let rows = Double(grid.rows)

    if x - radius < 0 { x = radius; hitX = true }
    if x + radius > cols { x = cols - radius; hitX = true }
    if y - radius < 0 { y = radius; hitY = true }
    if y + radius > rows { y = rows - radius; hitY = true }

    for _ in 0..<2 {
      let fx = x.rounded(.down)
      let fy = y.rounded(.down)
      let cx = Int(fx)
      let cy = Int(fy)
      if !grid.inBounds(cx, cy) { break }
      let walls = grid.wallsAt(cx, cy)

      if walls & RIGHT != 0 && x + radius > fx + 1 { x = fx + 1 - radius; hitX = true }
      if walls & LEFT != 0 && x - radius < fx { x = fx + radius; hitX = true }
      if walls & BOTTOM != 0 && y + radius > fy + 1 { y = fy + 1 - radius; hitY = true }
      if walls & TOP != 0 && y - radius < fy { y = fy + radius; hitY = true }

      let rightCell = (x + radius).rounded(.down)
      if grid.inBounds(Int(rightCell), cy) && grid.wallsAt(Int(rightCell), cy) & LEFT != 0 && x < rightCell {
        x = rightCell - radius
        hitX = true
      }
      let leftCell = (x - radius).rounded(.down)
      if grid.inBounds(Int(leftCell), cy) && grid.wallsAt(Int(leftCell), cy) & RIGHT != 0 && x > leftCell + 1 {
        x = leftCell + 1 + radius
        hitX = true
      }
      let belowCell = (y + radius).rounded(.down)
      if grid.inBounds(cx, Int(belowCell)) && grid.wallsAt(cx, Int(belowCell)) & TOP != 0 && y < belowCell {
        y = belowCell - radius
        hitY = true
      }
      let aboveCell = (y - radius).rounded(.down)
      if grid.inBounds(cx, Int(aboveCell)) && grid.wallsAt(cx, Int(aboveCell)) & BOTTOM != 0 && y > aboveCell + 1 {
        y = aboveCell + 1 + radius
        hitY = true
      }
    }

    return (x, y, hitX, hitY)
  }
}

struct Input {
  var up = false
  var down = false
  var left = false
  var right = false

  mutating func clear() { self = Input() }
}

struct Ball {
  var x: Double
  var y: Double
  var vx = 0.0
  var vy = 0.0
  let radius = Physics.radius

  init(at cell: Cell) {
    x = Double(cell.x) + 0.5
    y = Double(cell.y) + 0.5
  }

  var cell: Cell { Cell(x: cellOf(x), y: cellOf(y)) }

  /// Advance by exactly one fixed step.
  mutating func step(_ input: Input, _ grid: Grid) {
    var dx = 0.0
    var dy = 0.0
    if input.up { dy -= 1 }
    if input.down { dy += 1 }
    if input.left { dx -= 1 }
    if input.right { dx += 1 }

    if dx != 0 && dy != 0 {
      dx *= 0.7071067811865476   // Math.SQRT1_2
      dy *= 0.7071067811865476
    }

    let accel = Physics.accel * Physics.surfaceFactor(grid, x, y)
    vx = (vx + dx * accel) * Physics.friction
    vy = (vy + dy * accel) * Physics.friction

    let speed = jsHypot(vx, vy)
    if speed > Physics.maxSpeed {
      vx = (vx / speed) * Physics.maxSpeed
      vy = (vy / speed) * Physics.maxSpeed
    }

    let stepVx = vx / Physics.substeps
    let stepVy = vy / Physics.substeps
    var hitX = false
    var hitY = false

    for _ in 0..<Int(Physics.substeps) {
      var r = Physics.resolve(x + stepVx, y, radius, grid)
      x = r.x
      y = r.y
      if r.hitX { hitX = true }
      if r.hitY { hitY = true }

      r = Physics.resolve(x, y + stepVy, radius, grid)
      x = r.x
      y = r.y
      if r.hitX { hitX = true }
      if r.hitY { hitY = true }
    }

    if hitX { vx *= Physics.bounce }
    if hitY { vy *= Physics.bounce }
  }
}
