import SwiftUI

/*
 * Drawing the board. A port of src/engine/render.js onto SwiftUI's
 * GraphicsContext — the only code in the app that thinks in points.
 *
 * Everything the JS file argues for holds here too: lit from within, the hat
 * as the light source, ink kept inside the collision radius, fog that
 * remembers what sight has lost. The numbers are the same numbers. Two things
 * differ, both for the phone's sake:
 *
 *  - The parts of the board that never move (ground, grid, surfaces, the start
 *    ring, the walls and their glow) are drawn once per cell size into an image
 *    and blitted every frame, instead of re-blurring every wall sixty times a
 *    second. The exit and the maize are drawn over that image rather than under
 *    the walls; neither reaches the edge of its cell, so nothing visible
 *    changes.
 *  - Canvas's `shadowBlur` is roughly twice a SwiftUI shadow radius, so every
 *    blur here is halved.
 */

struct Terrain {
  let bg: Color
  let grid: Color
  let wall: Color
  let glow: Color
  let fog: Color
}

extension Color {
  init(hex: UInt32, alpha: Double = 1) {
    self.init(.sRGB,
              red: Double((hex >> 16) & 0xff) / 255,
              green: Double((hex >> 8) & 0xff) / 255,
              blue: Double(hex & 0xff) / 255,
              opacity: alpha)
  }

  init(r: Double, g: Double, b: Double, a: Double = 1) {
    self.init(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: a)
  }
}

let TERRAINS: [String: Terrain] = [
  "field": Terrain(bg: Color(hex: 0x14100a), grid: Color(hex: 0x221b10), wall: Color(hex: 0xf0b357), glow: Color(r: 240, g: 179, b: 87, a: 0.39), fog: Color(r: 10, g: 8, b: 5)),
  "track": Terrain(bg: Color(hex: 0x17110a), grid: Color(hex: 0x251c11), wall: Color(hex: 0xe0a049), glow: Color(r: 224, g: 160, b: 73, a: 0.36), fog: Color(r: 12, g: 9, b: 5)),
  "dusk": Terrain(bg: Color(hex: 0x100e1a), grid: Color(hex: 0x1c1930), wall: Color(hex: 0xb9a8e8), glow: Color(r: 185, g: 168, b: 232, a: 0.39), fog: Color(r: 8, g: 7, b: 14)),
  "woods": Terrain(bg: Color(hex: 0x0b120d), grid: Color(hex: 0x152018), wall: Color(hex: 0xa8cf9a), glow: Color(r: 168, g: 207, b: 154, a: 0.36), fog: Color(r: 5, g: 9, b: 6)),
  "night": Terrain(bg: Color(hex: 0x0a0e1a), grid: Color(hex: 0x141a2c), wall: Color(hex: 0xa8c4e8), glow: Color(r: 168, g: 196, b: 232, a: 0.39), fog: Color(r: 5, g: 7, b: 13)),
  "ridge": Terrain(bg: Color(hex: 0x121316), grid: Color(hex: 0x1e2026), wall: Color(hex: 0xe6e2d6), glow: Color(r: 230, g: 226, b: 214, a: 0.33), fog: Color(r: 9, g: 10, b: 12)),
  "marsh": Terrain(bg: Color(hex: 0x0a1010), grid: Color(hex: 0x14201c), wall: Color(hex: 0x8fbf8a), glow: Color(r: 143, g: 191, b: 138, a: 0.33), fog: Color(r: 5, g: 8, b: 8)),
  "ember": Terrain(bg: Color(hex: 0x170a08), grid: Color(hex: 0x26120d), wall: Color(hex: 0xff8a4c), glow: Color(r: 255, g: 138, b: 76, a: 0.41), fog: Color(r: 11, g: 5, b: 4)),
  "desert": Terrain(bg: Color(hex: 0x1a1008), grid: Color(hex: 0x2a1c0e), wall: Color(hex: 0xf5c169), glow: Color(r: 245, g: 193, b: 105, a: 0.39), fog: Color(r: 13, g: 8, b: 4)),
  "snow": Terrain(bg: Color(hex: 0x0a1220), grid: Color(hex: 0x142034), wall: Color(hex: 0xdcecff), glow: Color(r: 220, g: 236, b: 255, a: 0.39), fog: Color(r: 5, g: 9, b: 16)),
  "enchanted": Terrain(bg: Color(hex: 0x0d0b1a), grid: Color(hex: 0x1b1733), wall: Color(hex: 0x7df9e2), glow: Color(r: 80, g: 240, b: 205, a: 0.47), fog: Color(r: 6, g: 5, b: 14)),
]

func terrainOf(_ name: String) -> Terrain { TERRAINS[name] ?? TERRAINS["field"]! }

private enum Ink {
  static let start = Color(hex: 0x2f6f74)
  static let exit = Color(hex: 0x48e08a)
  static let exitGlow = Color(r: 72, g: 224, b: 138, a: 0.8)
  static let exitLocked = Color(hex: 0x4a4a44)
  static let maize = Color(hex: 0xf7b733)
  static let maizeDeep = Color(hex: 0xd8901a)
  static let maizeHusk = Color(hex: 0x5fae4a)
  static let maizeGlow = Color(r: 247, g: 183, b: 51, a: 0.7)
  static let maizeTaken = Color(r: 255, g: 255, b: 255, a: 0.16)
  static let hat = Color(hex: 0xffd23f)
  static let hatHot = Color(hex: 0xfffbe8)
  static let hatBand = Color(hex: 0x7a4a12)
  static let hatRim = Color(r: 255, g: 240, b: 190, a: 0.9)
  static let hatGlow = Color(r: 255, g: 210, b: 63, a: 0.85)
  static let trapFlash = Color(hex: 0xff5347)
  static let captureFlash = Color(hex: 0xffc53d)
  static let hunter = Color(hex: 0xf2f0ff)
  static let hunterEye = Color(hex: 0x241426)
  static func aura(_ a: Double) -> Color { Color(r: 229, g: 57, b: 53, a: a) }
}

private func easeOut(_ t: Double) -> Double { 1 - pow(1 - t, 3) }
private func easeIn(_ t: Double) -> Double { t * t * t }
private func easeOutBack(_ t: Double) -> Double { 1 + 2.4 * pow(t - 1, 3) + 1.4 * pow(t - 1, 2) }
private func clamp01(_ t: Double) -> Double { max(0, min(1, t)) }

private func circle(_ x: Double, _ y: Double, _ r: Double) -> Path {
  Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
}

private func ellipse(_ x: Double, _ y: Double, _ rx: Double, _ ry: Double, rotation: Double = 0) -> Path {
  Path(ellipseIn: CGRect(x: -rx, y: -ry, width: 2 * rx, height: 2 * ry))
    .applying(CGAffineTransform(rotationAngle: rotation).concatenating(CGAffineTransform(translationX: x, y: y)))
}

/// Points along an elliptical arc, angles as canvas measures them on a y-down board.
private func arc(_ path: inout Path, _ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double,
                 from a0: Double, to a1: Double, first: Bool) {
  let segments = 20
  for i in 0...segments {
    let a = a0 + (a1 - a0) * Double(i) / Double(segments)
    let p = CGPoint(x: cx + cos(a) * rx, y: cy + sin(a) * ry)
    if i == 0 && first { path.move(to: p) } else { path.addLine(to: p) }
  }
}

enum BoardArt {
  static let wallWidth = 0.06
  static let markerInset = 0.14
  static let memoryAlpha = 0.35
  static let lanternReach = 2.2
  static let shadowThrow = 60.0
  static let maizeScale = 0.86
  static let outroMs = 720.0

  // ------------------------------------------------------------- still parts

  @MainActor
  static func stillImage(_ grid: Grid, cell s: Double, scale: Double) -> Image? {
    let content = Canvas { ctx, _ in drawStill(ctx, grid, s) }
      .frame(width: Double(grid.cols) * s, height: Double(grid.rows) * s)
    let renderer = ImageRenderer(content: content)
    renderer.scale = scale
    return renderer.uiImage.map { Image(uiImage: $0) }
  }

  static func drawStill(_ ctx: GraphicsContext, _ grid: Grid, _ s: Double) {
    let ground = terrainOf(grid.terrain)
    let width = Double(grid.cols) * s
    let height = Double(grid.rows) * s

    ctx.fill(Path(CGRect(x: 0, y: 0, width: width, height: height)), with: .color(ground.bg))

    var lines = Path()
    for x in 0...grid.cols {
      lines.move(to: CGPoint(x: Double(x) * s, y: 0))
      lines.addLine(to: CGPoint(x: Double(x) * s, y: height))
    }
    for y in 0...grid.rows {
      lines.move(to: CGPoint(x: 0, y: Double(y) * s))
      lines.addLine(to: CGPoint(x: width, y: Double(y) * s))
    }
    ctx.stroke(lines, with: .color(ground.grid), lineWidth: 0.5)

    drawSurfaces(ctx, grid, s)

    // start: a dim ring that only says "you began here"
    ctx.stroke(circle((Double(grid.start.x) + 0.5) * s, (Double(grid.start.y) + 0.5) * s, s * 0.26),
               with: .color(Ink.start), lineWidth: max(1.5, s * 0.06))

    var walls = Path()
    for y in 0..<grid.rows {
      for x in 0..<grid.cols {
        let w = grid.wallsAt(x, y)
        let px = Double(x) * s
        let py = Double(y) * s
        if w & TOP != 0 { walls.move(to: CGPoint(x: px, y: py)); walls.addLine(to: CGPoint(x: px + s, y: py)) }
        if w & LEFT != 0 { walls.move(to: CGPoint(x: px, y: py)); walls.addLine(to: CGPoint(x: px, y: py + s)) }
        if w & RIGHT != 0 { walls.move(to: CGPoint(x: px + s, y: py)); walls.addLine(to: CGPoint(x: px + s, y: py + s)) }
        if w & BOTTOM != 0 { walls.move(to: CGPoint(x: px, y: py + s)); walls.addLine(to: CGPoint(x: px + s, y: py + s)) }
      }
    }
    let style = StrokeStyle(lineWidth: max(2, s * wallWidth), lineCap: .round)
    // one tight pass of light, then the crisp line the player actually collides with
    var glow = ctx
    glow.addFilter(.shadow(color: ground.glow, radius: s * 0.15))
    glow.stroke(walls, with: .color(ground.glow), style: style)
    ctx.stroke(walls, with: .color(ground.wall), style: style)
  }

  private static func drawSurfaces(_ ctx: GraphicsContext, _ grid: Grid, _ s: Double) {
    let at = { (x: Int, y: Int) -> UInt8 in grid.surfaceAt(x, y) }
    let kinds: [(UInt8, Color, Color)] = [
      (SAND, Color(r: 232, g: 168, b: 56, a: 0.16), Color(r: 245, g: 190, b: 95, a: 0.75)),
      (SNOW, Color(r: 150, g: 200, b: 240, a: 0.18), Color(r: 160, g: 215, b: 255, a: 0.75)),
    ]
    for (kind, tint, edge) in kinds {
      var fill = Path()
      var outline = Path()
      for y in 0..<grid.rows {
        for x in 0..<grid.cols where at(x, y) == kind {
          let px = Double(x) * s
          let py = Double(y) * s
          fill.addRect(CGRect(x: px, y: py, width: s, height: s))
          if at(x, y - 1) != kind { outline.move(to: CGPoint(x: px, y: py)); outline.addLine(to: CGPoint(x: px + s, y: py)) }
          if at(x, y + 1) != kind { outline.move(to: CGPoint(x: px, y: py + s)); outline.addLine(to: CGPoint(x: px + s, y: py + s)) }
          if at(x - 1, y) != kind { outline.move(to: CGPoint(x: px, y: py)); outline.addLine(to: CGPoint(x: px, y: py + s)) }
          if at(x + 1, y) != kind { outline.move(to: CGPoint(x: px + s, y: py)); outline.addLine(to: CGPoint(x: px + s, y: py + s)) }
        }
      }
      if fill.isEmpty { continue }
      ctx.fill(fill, with: .color(tint))
      ctx.stroke(outline, with: .color(edge), lineWidth: max(1, s * 0.045))
    }
  }

  // ---------------------------------------------------------------- the frame

  /// One frame. Fog over the maze, the hunter over the fog — never hidden by it.
  static func drawScene(_ context: GraphicsContext, _ game: Game, cell s: Double, still: Image?) {
    var ctx = context
    let grid = game.grid
    if let camera = game.camera {
      ctx.fill(Path(CGRect(x: 0, y: 0, width: 1e5, height: 1e5)), with: .color(terrainOf(grid.terrain).bg))
      ctx.translateBy(x: -camera.x * s, y: -camera.y * s)
    }
    if game.shake > 0 {
      let force = (game.shake / 420) * s * 0.14
      ctx.translateBy(x: (Double.random(in: 0..<1) - 0.5) * force, y: (Double.random(in: 0..<1) - 0.5) * force)
    }

    if let still {
      ctx.draw(still, in: CGRect(x: 0, y: 0, width: Double(grid.cols) * s, height: Double(grid.rows) * s))
    } else {
      drawStill(ctx, grid, s)
    }
    drawExit(ctx, game, s)
    for flag in grid.flags {
      if game.isCaptured(flag) {
        ctx.stroke(circle((Double(flag.x) + 0.5) * s, (Double(flag.y) + 0.5) * s, s * 0.18),
                   with: .color(Ink.maizeTaken), lineWidth: max(1, s * 0.05))
      } else {
        drawMaize(ctx, Double(flag.x), Double(flag.y), s, now: game.now)
      }
    }

    drawFxUnder(ctx, game, s)
    drawTrail(ctx, game, s)
    if game.won {
      let t = clamp01(game.outro / outroMs)
      drawHat(ctx, game.ball.x, game.ball.y, game.ball.radius, s, scale: 1 - easeIn(t), tilt: t * 0.9, bob: 0)
    } else {
      let pose = hatPose(game)
      drawHat(ctx, game.ball.x, game.ball.y, game.ball.radius, s, scale: pose.scale, tilt: pose.tilt, bob: pose.bob)
    }
    drawFog(ctx, game, s)
    drawHunter(ctx, game, s)
    drawWakeWarning(ctx, game, s)
    drawFlash(ctx, game, s)
    drawFxOver(ctx, game, s)
    if game.won { drawOutro(ctx, game, s) }
    drawStick(ctx, game, s)
  }

  /// The exit: a dull closed ring, or lit and slowly breathing once it opens.
  private static func drawExit(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    let ex = (Double(game.grid.end.x) + 0.5) * s
    let ey = (Double(game.grid.end.y) + 0.5) * s
    if game.exitOpen {
      let pulse = 0.86 + 0.14 * sin(game.now / 520)
      var c = ctx
      c.addFilter(.shadow(color: Ink.exitGlow, radius: s * 0.2 * pulse))
      c.opacity = pulse
      c.fill(circle(ex, ey, s * 0.28), with: .color(Ink.exit))
    } else {
      var locked = circle(ex, ey, s * 0.26)
      locked.move(to: CGPoint(x: ex - s * 0.13, y: ey - s * 0.13))
      locked.addLine(to: CGPoint(x: ex + s * 0.13, y: ey + s * 0.13))
      ctx.stroke(locked, with: .color(Ink.exitLocked), lineWidth: max(1.5, s * 0.07))
    }
  }

  /// One ear of maize, drawn in the board's own language rather than blitted.
  private static func drawMaize(_ ctx: GraphicsContext, _ x: Double, _ y: Double, _ s: Double, now: Double? = nil) {
    let phase = x * 1.7 + y * 2.3
    let breath = now.map { sin($0 / 520 + phase) } ?? 0
    let r = s * maizeScale * 0.5

    var c = ctx
    c.translateBy(x: (x + 0.5) * s, y: (y + 0.5) * s + breath * s * 0.012)
    c.rotate(by: .radians(-0.38))

    var glow = c
    glow.addFilter(.shadow(color: Ink.maizeGlow, radius: s * 0.1))
    glow.fill(ellipse(-r * 0.42, r * 0.16, r * 0.26, r * 0.66, rotation: -0.24), with: .color(Ink.maizeHusk))
    glow.fill(ellipse(0, 0, r * 0.40, r * 0.82), with: .color(Ink.maize))

    var rows = Path()
    for t in [-0.34, 0, 0.34] {
      rows.move(to: CGPoint(x: -r * 0.26, y: r * t))
      rows.addLine(to: CGPoint(x: r * 0.26, y: r * t))
    }
    c.stroke(rows, with: .color(Ink.maizeDeep), style: StrokeStyle(lineWidth: max(1, s * 0.035), lineCap: .round))
  }

  /// How the hat is carried: leaning into the walk, bobbing, swelling in on arrival.
  private static func hatPose(_ game: Game) -> (scale: Double, tilt: Double, bob: Double) {
    let speed = hypot(game.ball.vx, game.ball.vy)
    let walk = min(1, speed / 0.16)
    var scale = 1.0
    let tilt = max(-0.18, min(0.18, game.ball.vx * 1.1))
    let bob = walk > 0.25 ? sin(game.now / 60) * walk * 0.02 : 0
    if let spawn = game.latestFx(.spawn) { scale = easeOutBack(spawn.progress(game.now)) }
    return (scale, tilt, bob)
  }

  /// The hat, and the light source. Its ink never leaves the collision radius.
  private static func drawHat(_ ctx: GraphicsContext, _ bx: Double, _ by: Double, _ radius: Double, _ s: Double,
                              scale: Double, tilt: Double, bob: Double) {
    if scale <= 0.02 { return }
    let x = bx * s
    let y = (by + bob) * s
    let r0 = radius * s
    let rimWidth = max(1.25, s * 0.06)
    let rim0 = max(r0 * 0.4, r0 - rimWidth / 2)
    let fill = r0 * scale
    let rim = rim0 * scale

    var c = ctx
    if tilt != 0 {
      c.translateBy(x: x, y: y)
      c.rotate(by: .radians(tilt))
      c.translateBy(x: -x, y: -y)
    }

    var glow = c
    glow.addFilter(.shadow(color: Ink.hatGlow, radius: s * 0.16))
    glow.fill(ellipse(x, y + fill * 0.26, fill, fill * 0.52), with: .color(Ink.hat))
    var crown = Path()
    arc(&crown, x, y - fill * 0.18, fill * 0.56, fill * 0.54, from: .pi, to: 2 * .pi, first: true)
    crown.closeSubpath()
    glow.fill(crown, with: .color(Ink.hat))

    c.fill(ellipse(x, y + fill * 0.12, fill * 0.58, fill * 0.17), with: .color(Ink.hatBand))
    c.stroke(ellipse(x, y + fill * 0.26, rim, rim * 0.52), with: .color(Ink.hatRim), lineWidth: rimWidth)
    c.fill(ellipse(x - fill * 0.16, y - fill * 0.30, fill * 0.20, fill * 0.14, rotation: -0.4), with: .color(Ink.hatHot))
  }

  /// The ghost, with eyes that look where it is about to go.
  private static func drawHunter(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    guard let hunter = game.hunter, hunter.active else { return }
    let x = hunter.x * s
    let y = (hunter.y + sin(game.now / 360) * 0.03) * s
    let r = hunter.radius * s

    ctx.fill(circle(x, y, r * 2.4), with: .radialGradient(
      Gradient(colors: [Ink.aura(0.22), Ink.aura(0)]),
      center: CGPoint(x: x, y: y), startRadius: r * 0.5, endRadius: r * 2.4))

    var body = Path()
    arc(&body, x, y - r * 0.1, r, r, from: .pi, to: 2 * .pi, first: true)
    body.addLine(to: CGPoint(x: x + r, y: y + r * 0.62))
    for i in 0..<4 {
      let from = x + r - (Double(i) * 2 * r) / 4
      let to = x + r - (Double(i + 1) * 2 * r) / 4
      body.addQuadCurve(to: CGPoint(x: to, y: y + r * 0.62),
                        control: CGPoint(x: (from + to) / 2, y: y + r * (i % 2 == 0 ? 1.05 : 0.2)))
    }
    body.closeSubpath()
    ctx.fill(body, with: .color(Ink.hunter))

    let dx = game.ball.x - hunter.x
    let dy = game.ball.y - hunter.y
    let distance = max(hypot(dx, dy), 1e-6)
    let gaze = min(distance, 1)
    let px = (dx / distance) * r * 0.22 * gaze
    let py = (dy / distance) * r * 0.22 * gaze
    for side in [-1.0, 1.0] {
      let ex = x + side * r * 0.36
      let ey = y - r * 0.18
      ctx.fill(ellipse(ex, ey, r * 0.3, r * 0.36), with: .color(Ink.hunterEye))
      ctx.fill(circle(ex + px, ey + py, r * 0.16), with: .color(Ink.hunter))
    }
  }

  /// The board's edge reddens over the last seconds before the ghost wakes.
  private static func drawWakeWarning(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    guard let hunter = game.hunter, !hunter.active else { return }
    let progress = hunter.wakeProgress(game.now)
    if progress <= 0 { return }

    let width = Double(game.grid.cols) * s
    let height = Double(game.grid.rows) * s
    let pulse = 0.6 + 0.4 * sin((game.now / 1000) * .pi * 3)
    let depth = min(width, height) * 0.16
    var c = ctx
    c.opacity = progress * pulse * 0.42
    let edges: [(Double, Double, Double, Double)] = [
      (0, 0, depth, 0), (width, 0, width - depth, 0), (0, 0, 0, depth), (0, height, 0, height - depth),
    ]
    let board = Path(CGRect(x: 0, y: 0, width: width, height: height))
    for (x0, y0, x1, y1) in edges {
      c.fill(board, with: .linearGradient(Gradient(colors: [Ink.aura(0.85), Ink.aura(0)]),
                                          startPoint: CGPoint(x: x0, y: y0), endPoint: CGPoint(x: x1, y: y1)))
    }
  }

  /// A disc of lantern light with every wall's shadow cut back out of it.
  private static func drawSight(_ ctx: inout GraphicsContext, _ grid: Grid, _ s: Double,
                                _ lx: Double, _ ly: Double, _ radius: Double) {
    ctx.fill(circle(lx, ly, radius), with: .radialGradient(
      Gradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.62), .init(color: .clear, location: 1)]),
      center: CGPoint(x: lx, y: ly), startRadius: 0, endRadius: radius))

    let reach = radius / s + 1
    let cx = lx / s
    let cy = ly / s
    let minX = max(0, Int((cx - reach).rounded(.down)))
    let maxX = min(grid.cols - 1, Int((cx + reach).rounded(.up)))
    let minY = max(0, Int((cy - reach).rounded(.down)))
    let maxY = min(grid.rows - 1, Int((cy + reach).rounded(.up)))
    guard minX <= maxX, minY <= maxY else { return }

    let far = shadowThrow * s
    var shadows = Path()
    func cast(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) {
      let adx = ax - lx, ady = ay - ly, bdx = bx - lx, bdy = by - ly
      let alen = hypot(adx, ady) == 0 ? 1e-6 : hypot(adx, ady)
      let blen = hypot(bdx, bdy) == 0 ? 1e-6 : hypot(bdx, bdy)
      shadows.move(to: CGPoint(x: ax, y: ay))
      shadows.addLine(to: CGPoint(x: ax + (adx / alen) * far, y: ay + (ady / alen) * far))
      shadows.addLine(to: CGPoint(x: bx + (bdx / blen) * far, y: by + (bdy / blen) * far))
      shadows.addLine(to: CGPoint(x: bx, y: by))
      shadows.closeSubpath()
    }
    for y in minY...maxY {
      for x in minX...maxX {
        let w = grid.wallsAt(x, y)
        let px = Double(x) * s
        let py = Double(y) * s
        if w & TOP != 0 { cast(px, py, px + s, py) }
        if w & LEFT != 0 { cast(px, py, px, py + s) }
        if x == grid.cols - 1 && w & RIGHT != 0 { cast(px + s, py, px + s, py + s) }
        if y == grid.rows - 1 && w & BOTTOM != 0 { cast(px, py + s, px + s, py + s) }
      }
    }
    ctx.blendMode = .destinationOut
    ctx.fill(shadows, with: .color(.black))
    ctx.blendMode = .normal
  }

  /// Fog: a dark sheet, holes where he has been, and what he can see from here.
  private static func drawFog(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    let grid = game.grid
    guard let fog = grid.fog else { return }
    let width = Double(grid.cols) * s
    let height = Double(grid.rows) * s
    let board = Path(CGRect(x: 0, y: 0, width: width, height: height))
    let bx = game.ball.x * s
    let by = game.ball.y * s
    let radius = (fog + game.assist.fogBonus) * lanternReach * s
    let hole = 1 - memoryAlpha

    ctx.drawLayer { layer in
      layer.fill(board, with: .color(terrainOf(grid.terrain).fog))
      layer.blendMode = .destinationOut

      if let memory = grid.memory {
        for (cell, seenAt) in game.visited {
          let age = game.now - seenAt
          if age >= memory { continue }   // forgotten completely
          let strength = pow(1 - age / memory, 0.65)
          layer.fill(Path(CGRect(x: Double(cell.x) * s, y: Double(cell.y) * s, width: s, height: s)),
                     with: .color(.black.opacity(hole * strength)))
        }
      } else {
        var remembered = Path()
        for cell in game.visited.keys {
          remembered.addRect(CGRect(x: Double(cell.x) * s, y: Double(cell.y) * s, width: s, height: s))
        }
        layer.fill(remembered, with: .color(.black.opacity(hole)))
      }

      // shadows cut into sight, never into memory
      layer.drawLayer { sight in drawSight(&sight, grid, s, bx, by, radius) }
    }

    // and the warmth: he is carrying the light, so what he sees is warm
    var warm = ctx
    warm.blendMode = .plusLighter
    warm.drawLayer { layer in
      drawSight(&layer, grid, s, bx, by, radius)
      layer.blendMode = .sourceIn
      layer.fill(board, with: .radialGradient(
        Gradient(stops: [
          .init(color: Color(r: 255, g: 206, b: 122, a: 0.20), location: 0),
          .init(color: Color(r: 255, g: 186, b: 96, a: 0.10), location: 0.45),
          .init(color: Color(r: 255, g: 170, b: 80, a: 0), location: 1),
        ]),
        center: CGPoint(x: bx, y: by), startRadius: 0, endRadius: radius))
    }
  }

  private static func drawFlash(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    guard let flash = game.flash, game.now < flash.until else { return }
    let inset = s * markerInset
    var c = ctx
    c.opacity = clamp01((flash.until - game.now) / 450) * 0.28
    c.fill(Path(roundedRect: CGRect(x: Double(flash.x) * s + inset, y: Double(flash.y) * s + inset,
                                    width: s - inset * 2, height: s - inset * 2), cornerRadius: s * 0.2),
           with: .color(flash.trap ? Ink.trapFlash : Ink.captureFlash))
  }

  // ------------------------------------------------------------------ effects

  private static func drawMotes(_ ctx: GraphicsContext, _ cx: Double, _ cy: Double, _ count: Int, _ p: Double, _ s: Double,
                                color: Color, reach: Double, size: Double, gravity: Double = 0, seed: Double = 0) {
    let eased = easeOut(p)
    var c = ctx
    c.opacity = pow(1 - p, 1.4)
    var motes = Path()
    for i in 0..<count {
      let angle = ((Double(i) + 0.5) / Double(count)) * .pi * 2 + seed
      let throwLen = reach * (0.7 + 0.3 * sin(Double(i) * 2.9 + seed)) * s
      let x = cx + cos(angle) * throwLen * eased
      let y = cy + sin(angle) * throwLen * eased + gravity * p * p * s
      motes.addPath(circle(x, y, max(0.8, size * s * (1 - p * 0.6))))
    }
    c.fill(motes, with: .color(color))
  }

  private static func drawRing(_ ctx: GraphicsContext, _ cx: Double, _ cy: Double, _ p: Double, _ s: Double,
                               color: Color, from: Double, to: Double, width: Double) {
    let eased = easeOut(p)
    var c = ctx
    c.opacity = pow(1 - p, 1.2)
    c.stroke(circle(cx, cy, (from + (to - from) * eased) * s), with: .color(color),
             lineWidth: max(1, width * s * (1 - p * 0.7)))
  }

  /// Effects that belong to the ground: under the fog.
  private static func drawFxUnder(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    for fx in game.fx {
      let p = fx.progress(game.now)
      if p >= 1 { continue }
      switch fx.kind {
      case .bump:
        drawMotes(ctx, fx.x * s, fx.y * s, 3, p, s, color: Color(r: 255, g: 236, b: 200, a: 0.5),
                  reach: 0.16, size: 0.03, seed: fx.axisX ? 0.4 : 1.2)
      case .unpick:
        let cx = (fx.x + 0.5) * s, cy = (fx.y + 0.5) * s
        drawRing(ctx, cx, cy, 1 - p, s, color: Ink.maizeTaken, from: 0.2, to: 0.55, width: 0.05)
        var c = ctx
        c.opacity = 0.35 * p
        drawMaize(c, fx.x, fx.y, s)
      case .pick:
        let cx = (fx.x + 0.5) * s, cy = (fx.y + 0.5) * s
        drawRing(ctx, cx, cy, p, s, color: Ink.maize, from: 0.2, to: 0.55, width: 0.05)
        drawMotes(ctx, cx, cy, 6, p, s, color: Ink.maize, reach: 0.42, size: 0.04, gravity: 0.3, seed: 0.3)
        if p < 0.35 {
          let size = s * (1 + easeOut(p / 0.35) * 0.35)
          var c = ctx
          c.opacity = 1 - p / 0.35
          drawMaize(c, cx / size - 0.5, cy / size - 0.5, size)
        }
      default:
        break
      }
    }
  }

  /// Effects that belong to the player and the story: over the fog.
  private static func drawFxOver(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    for fx in game.fx {
      let p = fx.progress(game.now)
      if p >= 1 { continue }
      let cx = (fx.x + 0.5) * s
      let cy = (fx.y + 0.5) * s
      switch fx.kind {
      case .fall:
        let open = p < 0.3 ? easeOut(p / 0.3) : 1 - easeIn((p - 0.3) / 0.7)
        if open > 0 {
          var c = ctx
          c.opacity = 0.9
          c.fill(ellipse(cx, cy + s * 0.08, s * 0.34 * open, s * 0.2 * open), with: .color(.black.opacity(0.85)))
        }
        let drop = clamp01(p / 0.55)
        if drop < 1 {
          drawHat(ctx, fx.x + 0.5, fx.y + 0.5 + easeIn(drop) * 0.25, game.ball.radius, s,
                  scale: 1 - easeIn(drop), tilt: drop * (fx.caught ? -1.2 : 0.8), bob: 0)
        }
        drawMotes(ctx, cx, cy, 4, p, s, color: fx.caught ? Ink.aura(0.7) : Color(r: 120, g: 90, b: 60, a: 0.7),
                  reach: 0.36, size: 0.04, gravity: 0.45, seed: 0.7)
      case .unlock:
        drawRing(ctx, cx, cy, p, s, color: Ink.exit, from: 0.3, to: 3.2, width: 0.07)
      case .wake:
        drawRing(ctx, cx, cy, p, s, color: Ink.aura(0.8), from: 0.3, to: 1.6, width: 0.07)
      default:
        break
      }
    }
  }

  private static func drawOutro(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    let t = clamp01(game.outro / outroMs)
    let ex = (Double(game.grid.end.x) + 0.5) * s
    let ey = (Double(game.grid.end.y) + 0.5) * s
    drawRing(ctx, ex, ey, t, s, color: Ink.exit, from: 0.3, to: 3.6, width: 0.08)
    var c = ctx
    c.opacity = (1 - t) * 0.3
    c.fill(circle(ex, ey, s * (0.3 + easeOut(t) * 0.8)), with: .color(Ink.exitGlow))
  }

  /// The player's own thumb, drawn lightly.
  private static func drawStick(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    guard let stick = game.stick else { return }
    let ox = stick.x * s
    let oy = stick.y * s
    var ring = ctx
    ring.opacity = 0.14
    ring.stroke(circle(ox, oy, s * 0.85), with: .color(.white), lineWidth: max(1, s * 0.035))
    var knob = ctx
    knob.opacity = 0.26
    knob.fill(circle(ox + stick.dx * s, oy + stick.dy * s, s * 0.32), with: .color(.white))
  }

  /// The tail behind the hat, fading to nothing.
  private static func drawTrail(_ ctx: GraphicsContext, _ game: Game, _ s: Double) {
    let trail = game.trail
    if trail.count < 2 { return }
    let radius = game.ball.radius * s
    for (i, point) in trail.enumerated() {
      let age = Double(i + 1) / Double(trail.count)
      var c = ctx
      c.opacity = age * 0.34
      c.fill(circle(point.x * s, point.y * s, radius * age * 0.8), with: .color(Ink.hat))
    }
  }
}
