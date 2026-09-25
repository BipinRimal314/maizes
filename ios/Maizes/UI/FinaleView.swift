import SwiftUI

/// The end of the campaign. A port of src/ui/Finale.jsx.
struct FinaleView: View {
  let levels: [Level]
  let onBack: () -> Void
  let onConcede: () -> Void

  @ObservedObject private var progress = Progress.shared
  private let p = Palette.paper

  var body: some View {
    let stats = progress.totals(for: levels)
    let total = levels.count
    let complete = stats.levels >= total
    let rescued = progress.speedrunFinished
    let conceded = progress.speedrunGaveUp
    let racing = progress.speedrunActive && !rescued
    let run = progress.speedrunProgress(levels)

    let emoji = rescued ? "🌽" : conceded ? "🍂" : racing ? "🏃" : "🏁"
    let title = rescued ? "you got her back." : conceded ? "he went home." : racing ? "still running." : "that’s all of them."
    let sub = rescued
      ? "every field, twice, and the second time fast enough."
      : conceded
        ? "the fields are still there. so is the gate, and the gap in the hedge."
        : racing
          ? "\(run.beaten) of \(run.total) fields beaten. the rest are still slower than they were."
          : complete
            ? "\(total) fields, every ear of maize in them, and the thing in the dark. all of it."
            : "you reached the end. some levels back there are still waiting for you."

    ScrollView {
      CardBox(palette: p, maxWidth: 416) {
        Text(emoji).font(.system(size: 40))
        Text(title)
          .font(.display(22))
          .foregroundStyle(p.ink)
          .padding(.top, 8)
        Text(sub)
          .font(.system(size: 14).italic())
          .foregroundStyle(p.inkSoft)
          .multilineTextAlignment(.center)

        HStack(spacing: 8) {
          StatTile(palette: p, label: "cleared", value: "\(stats.levels)/\(total)")
          StatTile(palette: p, label: "best time", value: walked(stats.ms))
          StatTile(palette: p, label: "maize", value: "\(progress.maizeCollected(levels))")
        }
        .padding(.vertical, 22)

        Text(stats.flawless > 0
             ? "\(stats.flawless) of them without dying once."
             : "not one clean run. there is still something left to do.")
          .font(.system(size: 13).italic())
          .foregroundStyle(p.inkSoft)

        TrailMapView(levels: levels, compact: true)

        Divider().padding(.vertical, 20)

        Group {
          if rescued {
            Text("“thank you for helping me reach my daughter.”")
              .font(.display(15, .bold))
            Text("— the farmer")
              .font(.display(18))
          } else {
            Text("the trail is still there.")
              .font(.display(15, .bold))
            Text("so is she.")
              .font(.display(18))
          }
        }
        .foregroundStyle(p.ink)
        .multilineTextAlignment(.center)

        HStack(spacing: 10) {
          Button("levels", action: onBack)
            .buttonStyle(PillButton(palette: p, primary: true))
          // only while the run is still winnable: an ending you choose
          if racing && !conceded {
            Button("stop looking", action: onConcede)
              .buttonStyle(PillButton(palette: p))
          }
        }
        .padding(.top, 24)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 40)
      .frame(maxWidth: .infinity)
    }
    .background(p.bg.ignoresSafeArea())
  }
}
