import Foundation

/*
 * The maze. A port of src/engine/grid.js.
 *
 * Read-only here. Every level arrives already generated and proven in
 * levels.json, and nothing on iOS ever raises or drops a wall, so `setWall`
 * and the mirrored-edge invariant it guards stay on the JS side with the
 * generator.
 */

let TOP: UInt8 = 1
let RIGHT: UInt8 = 2
let BOTTOM: UInt8 = 4
let LEFT: UInt8 = 8
let ALL: UInt8 = 15

let GROUND: UInt8 = 0
let SAND: UInt8 = 1
let SNOW: UInt8 = 2

struct Direction {
  let bit: UInt8
  let dx: Int
  let dy: Int
  let opposite: UInt8
}

/// Same order as the JS. The hunter's searches break ties by it, so the order
/// is part of what the parity traces check.
let DIRECTIONS = [
  Direction(bit: TOP, dx: 0, dy: -1, opposite: BOTTOM),
  Direction(bit: RIGHT, dx: 1, dy: 0, opposite: LEFT),
  Direction(bit: BOTTOM, dx: 0, dy: 1, opposite: TOP),
  Direction(bit: LEFT, dx: -1, dy: 0, opposite: RIGHT),
]

struct Cell: Hashable {
  var x: Int
  var y: Int
}

struct HunterSpec {
  let spawnMs: Double
  let speed: Double
}

struct Grid {
  let cols: Int
  let rows: Int
  let walls: [UInt8]
  let flags: [Cell]
  let traps: [Cell]
  let start: Cell
  let end: Cell
  let fog: Double?
  let memory: Double?
  let hunter: HunterSpec?
  /// One byte per cell: 0 ordinary, 1 sand, 2 snow.
  let surface: [UInt8]
  let terrain: String

  func inBounds(_ x: Int, _ y: Int) -> Bool {
    x >= 0 && x < cols && y >= 0 && y < rows
  }

  func wallsAt(_ x: Int, _ y: Int) -> UInt8 {
    inBounds(x, y) ? walls[y * cols + x] : ALL
  }

  /// Can the ball travel from (x, y) through `d`? Checks both sides of the edge.
  func isOpen(_ x: Int, _ y: Int, _ d: Direction) -> Bool {
    guard inBounds(x, y) else { return false }
    let nx = x + d.dx
    let ny = y + d.dy
    guard inBounds(nx, ny) else { return false }
    if wallsAt(x, y) & d.bit != 0 { return false }
    if wallsAt(nx, ny) & d.opposite != 0 { return false }
    return true
  }

  func surfaceAt(_ x: Int, _ y: Int) -> UInt8 {
    inBounds(x, y) ? surface[y * cols + x] : GROUND
  }
}
