import SwiftUI

/*
 * The trail so far. A port of src/ui/Levels.jsx: what has been walked and one
 * step past it, and nothing that names a mechanic before the story has earned
 * it. No developer mode on mobile; `-MaizesLevel N` covers testing in Debug.
 */
struct LevelsView: View {
  let levels: [Level]
  let onPick: (Int) -> Void

  @ObservedObject private var progress = Progress.shared
  @ObservedObject private var settings = Settings.shared
  private let p = Palette.paper

  private struct Chapter: Identifiable {
    let name: String
    let blurb: String?
    var indices: [Int]
    var id: String { name }
  }

  var body: some View {
    let racing = progress.speedrunActive
    let reach = racing ? levels.count : progress.unlockedCount(levels)
    let remaining = racing ? 0 : levels.count - reach

    ScrollView {
      VStack(spacing: 0) {
        header(racing: racing)
        ForEach(chapters(reach: reach, racing: racing)) { chapter in
          chapterView(chapter, racing: racing)
        }
        if remaining > 0 { locked(reach: reach, remaining: remaining) }
      }
      .frame(maxWidth: 860)
      .padding(.horizontal, 20)
      .padding(.top, 48)
      .padding(.bottom, 64)
      .frame(maxWidth: .infinity)
    }
    .background(p.bg.ignoresSafeArea())
  }

  private func chapters(reach: Int, racing: Bool) -> [Chapter] {
    var out: [Chapter] = []
    for (index, level) in levels.enumerated() {
      if index >= reach { break }
      // in the race, a field with no par is a field with nothing to beat
      if racing && progress.parFor(level.name) == nil { continue }
      if out.last?.name != level.chapter {
        out.append(Chapter(name: level.chapter, blurb: level.blurb, indices: []))
      }
      out[out.count - 1].indices.append(index)
    }
    return out
  }

  private func header(racing: Bool) -> some View {
    VStack(spacing: 12) {
      Text("Journey to Maizy")
        .font(.display(44))
        .tracking(-1.5)
        .foregroundStyle(p.ink)
        .multilineTextAlignment(.center)
      Text("a trail of dropped corn, and a father following it.")
        .font(.system(size: 15).italic())
        .foregroundStyle(p.inkSoft)
        .multilineTextAlignment(.center)
      if racing {
        let run = progress.speedrunProgress(levels)
        pill("running it back · \(run.beaten) of \(run.total) fields beaten", color: p.flag)
      } else if progress.totals(for: levels).levels > 0 {
        pill("\(progress.totals(for: levels).levels) of \(levels.count) escaped · walked \(walked(progress.totals(for: levels).ms))", color: p.inkSoft)
      }
      Button(settings.muted ? "🔇 sound off" : "🔊 sound on") { settings.muted.toggle() }
        .buttonStyle(PillButton(palette: p, small: true))
    }
    .padding(.bottom, 44)
  }

  private func pill(_ text: String, color: Color) -> some View {
    Text(text)
      .font(.display(12, .bold))
      .foregroundStyle(color)
      .padding(.horizontal, 14)
      .padding(.vertical, 5)
      .background(Capsule().fill(p.surface))
      .overlay(Capsule().strokeBorder(p.line, lineWidth: 2))
  }

  private func chapterView(_ chapter: Chapter, racing: Bool) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(chapter.name)
        .font(.display(19))
        .foregroundStyle(p.ink)
      if let blurb = chapter.blurb {
        Text(blurb)
          .font(.system(size: 14).italic())
          .foregroundStyle(p.inkSoft)
      }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 12)], spacing: 12) {
        ForEach(chapter.indices, id: \.self) { index in
          card(index, racing: racing)
        }
      }
      .padding(.top, 10)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.bottom, 44)
  }

  private func card(_ index: Int, racing: Bool) -> some View {
    let level = levels[index]
    let beaten = racing && progress.isBeaten(level.name)

    return Button { onPick(index) } label: {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text("\(index + 1)").font(.display(20))
          Spacer()
          if racing {
            if beaten { Text("🏃").font(.system(size: 14)) }
          } else if progress.isDone(level.name) {
            Text("⭐").font(.system(size: 14))
          }
        }
        if racing {
          if let par = progress.parFor(level.name) {
            Text("beat \(String(format: "%.1f", par / 1000))s").font(.system(size: 11)).foregroundStyle(p.inkSoft)
          }
        } else if let best = progress.bestFor(level.name) {
          Text("\(best.deaths == 0 ? "clean · " : "")\(walked(best.ms))").font(.system(size: 11)).foregroundStyle(p.inkSoft)
        }
      }
      .foregroundStyle(p.ink)
      .padding(13)
      .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
      .background(RoundedRectangle(cornerRadius: 14).fill(beaten ? p.exitSoft : p.surface))
      .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(beaten ? p.exit : p.line, lineWidth: 2))
    }
    .buttonStyle(.plain)
  }

  private func locked(reach: Int, remaining: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("the trail goes on")
        .font(.display(19))
        .foregroundStyle(p.inkSoft)
      Text("\(remaining) more of it, and no telling what is in them until you are standing there.")
        .font(.system(size: 14).italic())
        .foregroundStyle(p.inkSoft)
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 12)], spacing: 12) {
        ForEach(0..<min(remaining, 6), id: \.self) { i in
          VStack(alignment: .leading) {
            Text("\(reach + i + 1)").font(.display(20))
            Spacer()
            HStack { Spacer(); Text("🌾").font(.system(size: 17)).saturation(0.3) }
          }
          .foregroundStyle(p.inkSoft)
          .padding(13)
          .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
          .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, style: StrokeStyle(lineWidth: 2, dash: [5, 4])))
          .opacity(0.5)
          .accessibilityHidden(true)
        }
      }
      .padding(.top, 10)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
