import SwiftUI

/*
 * The two palettes from src/index.css. The level list, the story cards and the
 * trail map are warm paper; the field is night. The cards are his voice written
 * down, the field is the dark he is walking through.
 */
struct Palette {
  let bg: Color
  let surface: Color
  let surfaceDim: Color
  let ink: Color
  let inkSoft: Color
  let line: Color
  let flag: Color
  let flagSoft: Color
  let exit: Color
  let exitSoft: Color
  let trap: Color
  let trapSoft: Color
  let hunter: Color
  let hunterSoft: Color
  let fading: Color

  static let paper = Palette(
    bg: Color(hex: 0xfdf6e6), surface: Color(hex: 0xfffdf7), surfaceDim: Color(hex: 0xf2ead6),
    ink: Color(hex: 0x33302a), inkSoft: Color(hex: 0x6b6455), line: Color(hex: 0xe4dac2),
    flag: Color(hex: 0xb4552d), flagSoft: Color(hex: 0xf7e9dd),
    exit: Color(hex: 0x1b8f5a), exitSoft: Color(hex: 0xe3f4ec),
    trap: Color(hex: 0xe53935), trapSoft: Color(hex: 0xfdeaea),
    hunter: Color(hex: 0x5b2333), hunterSoft: Color(hex: 0xf6e7ea),
    fading: Color(hex: 0x6a5aa8)
  )

  static let night = Palette(
    bg: Color(hex: 0x0c0a08), surface: Color(r: 255, g: 250, b: 235, a: 0.05), surfaceDim: Color(r: 255, g: 250, b: 235, a: 0.09),
    ink: Color(hex: 0xf4ecd8), inkSoft: Color(hex: 0x9a917c), line: Color(r: 255, g: 240, b: 200, a: 0.14),
    flag: Color(hex: 0xf7b733), flagSoft: Color(r: 247, g: 183, b: 51, a: 0.14),
    exit: Color(hex: 0x48e08a), exitSoft: Color(r: 72, g: 224, b: 138, a: 0.16),
    trap: Color(hex: 0xff5347), trapSoft: Color(r: 255, g: 83, b: 71, a: 0.16),
    hunter: Color(hex: 0xff8fa0), hunterSoft: Color(r: 255, g: 143, b: 160, a: 0.16),
    fading: Color(hex: 0x6a5aa8)
  )
}

extension Font {
  static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
    .system(size: size, weight: weight)
  }
}

struct PillButton: ButtonStyle {
  let palette: Palette
  var primary = false
  var small = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.display(small ? 12 : 14, .bold))
      .padding(.horizontal, small ? 16 : 22)
      .padding(.vertical, small ? 8 : 12)
      .frame(minHeight: 40)
      .foregroundStyle(primary ? palette.bg : palette.ink)
      .background(Capsule().fill(primary ? palette.ink : palette.surface))
      .overlay(Capsule().strokeBorder(primary ? palette.ink : palette.line, lineWidth: 2))
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .opacity(configuration.isPressed ? 0.85 : 1)
  }
}

/// The cream card every story, result and finale sits on.
struct CardBox<Content: View>: View {
  let palette: Palette
  var maxWidth: CGFloat = 352
  var alignment: HorizontalAlignment = .center
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: alignment, spacing: 0) { content }
      .padding(32)
      .frame(maxWidth: maxWidth)
      .background(RoundedRectangle(cornerRadius: 24).fill(palette.surface))
      .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(palette.line, lineWidth: 2))
      .shadow(color: Color(r: 60, g: 52, b: 34, a: 0.14), radius: 22, y: 18)
  }
}

struct StatTile: View {
  let palette: Palette
  let label: String
  let value: String

  var body: some View {
    VStack(spacing: 2) {
      Text(label.uppercased())
        .font(.display(10, .bold))
        .tracking(0.8)
        .foregroundStyle(palette.inkSoft)
      Text(value)
        .font(.display(19))
        .monospacedDigit()
        .foregroundStyle(palette.ink)
    }
    .frame(maxWidth: .infinity)
    .padding(13)
    .background(RoundedRectangle(cornerRadius: 14).fill(palette.surfaceDim))
  }
}

func clock(_ ms: Double) -> String {
  let total = Int(ms / 1000)
  return String(format: "%02d:%02d", total / 60, total % 60)
}

func walked(_ ms: Double) -> String {
  let total = Int(ms / 1000)
  let minutes = total / 60
  if minutes < 60 { return "\(minutes)m \(String(format: "%02d", total % 60))s" }
  return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
}
