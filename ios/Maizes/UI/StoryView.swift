import SwiftUI

/*
 * One story card, typed out. A port of src/ui/Story.jsx and useTypewriter.js.
 *
 * The farmer is body text; the voices are indented, lighter and italic, heard
 * past him rather than from him. A tap anywhere fills the card in, and a phone
 * set to reduce motion gets the whole card at once rather than slower typing.
 */
struct StoryView: View {
  let beat: Beat
  let trail: [Level]?
  let actionLabel: String?
  let onDone: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var line = 0
  @State private var char = 0
  private let p = Palette.paper

  private var done: Bool { line >= beat.lines.count }

  var body: some View {
    GeometryReader { geo in
      ScrollView {
        VStack {
          Spacer(minLength: 0)
          card
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity, minHeight: geo.size.height)
      }
    }
    .background(p.bg.ignoresSafeArea())
    .contentShape(Rectangle())
    .onTapGesture { if !done { skip() } }
    .task { await type() }
  }

  private var card: some View {
    CardBox(palette: p, maxWidth: 544, alignment: .leading) {
      if let title = beat.title {
        Text(title)
          .font(.display(23))
          .foregroundStyle(p.ink)
          .frame(maxWidth: .infinity)
          .padding(.bottom, 22)
      }

      VStack(alignment: .leading, spacing: 13) {
        ForEach(Array(beat.lines.enumerated()).prefix(min(line + 1, beat.lines.count)), id: \.offset) { i, l in
          lineView(i, l)
        }
      }

      if done, let trail {
        TrailMapView(levels: trail)
      }

      HStack {
        Spacer()
        Button(done ? (actionLabel ?? beat.action ?? "go on") : "skip") {
          if done { onDone() } else { skip() }
        }
        .buttonStyle(PillButton(palette: p, primary: true))
        .opacity(done ? 1 : 0.75)
        Spacer()
      }
      .padding(.top, 28)
    }
  }

  @ViewBuilder
  private func lineView(_ i: Int, _ l: Line) -> some View {
    let text = i < line ? l.text : String(l.text.prefix(char))
    if l.voice == .voices {
      Text(text)
        .font(.system(size: 15).italic())
        .foregroundStyle(p.inkSoft)
        .lineSpacing(5)
        .padding(.leading, 14)
        .overlay(alignment: .leading) { Rectangle().fill(p.line).frame(width: 2) }
        .padding(.leading, 26)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if i == 0, let first = text.first {
      (Text(String(first)).font(.display(34)).foregroundStyle(p.flag)
        + Text(String(text.dropFirst())).font(.system(size: 16)).foregroundStyle(p.ink))
        .lineSpacing(6)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      Text(text)
        .font(.system(size: 16))
        .foregroundStyle(p.ink)
        .lineSpacing(6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func skip() {
    line = beat.lines.count
    char = 0
  }

  private func wait(_ ms: UInt64) async {
    try? await Task.sleep(nanoseconds: ms * 1_000_000)
  }

  /// The voices type slower; they are not sure.
  private func type() async {
    if reduceMotion { skip(); return }
    await wait(260)
    while !done && !Task.isCancelled {
      let current = beat.lines[line]
      if char >= current.text.count {
        let nextIsVoice = line + 1 < beat.lines.count && beat.lines[line + 1].voice == .voices
        await wait(nextIsVoice ? 480 : 320)
        if done { break }
        line += 1
        char = 0
      } else {
        await wait(current.voice == .voices ? 42 : 26)
        if done { break }
        char += 1
      }
    }
  }
}
