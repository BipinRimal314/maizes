import Foundation

/*
 * Presentation events: what the board shows happening. A port of
 * src/engine/fx.js. The rules append here and never read it.
 */

enum FxKind {
  case fall, spawn, pick, unpick, unlock, bump, wake

  var life: Double {
    switch self {
    case .fall: 650
    case .spawn: 320
    case .pick: 700
    case .unpick: 600
    case .unlock: 1100
    case .bump: 260
    case .wake: 900
    }
  }
}

struct Fx {
  let kind: FxKind
  let x: Double
  let y: Double
  let at: Double
  var caught = false
  var axisX = false

  func progress(_ now: Double) -> Double {
    max(0, min(1, (now - at) / kind.life))
  }
}

let FX_MAX = 24
let BUMP_MIN_SPEED = 0.085

/// Which axis, if any, was struck hard enough to show: "x", "y" or nil.
func bumpAxis(_ vxBefore: Double, _ vyBefore: Double, _ ball: Ball) -> Character? {
  if vxBefore * ball.vx < 0 && abs(vxBefore) >= BUMP_MIN_SPEED { return "x" }
  if vyBefore * ball.vy < 0 && abs(vyBefore) >= BUMP_MIN_SPEED { return "y" }
  return nil
}
