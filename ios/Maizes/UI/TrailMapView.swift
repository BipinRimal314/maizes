import SwiftUI

/*
 * Everything he has walked, in one picture. A port of src/ui/TrailMap.jsx:
 * chapters left to right as bands of their own ground, sized by how many
 * fields each holds, with only the ears actually picked counted underneath.
 */
struct TrailMapView: View {
  let levels: [Level]
  var compact = false

  @ObservedObject private var progress = Progress.shared
  private let p = Palette.paper

  private struct Leg: Identifiable {
    let name: String
    let terrain: String
    var levels: [Level]
    var id: String { name }
  }

  private var legs: [Leg] {
    var out: [Leg] = []
    for level in levels {
      if out.last?.name != level.chapter {
        out.append(Leg(name: level.chapter, terrain: level.terrain, levels: []))
      }
      out[out.count - 1].levels.append(level)
    }
    return out
  }

  private func walked(_ level: Level) -> Bool { progress.isDone(level.name) }

  private func ears(_ leg: Leg) -> Int {
    leg.levels.reduce(0) { $0 + (walked($1) ? $1.grid.flags.count : 0) }
  }

  var body: some View {
    let legs = legs
    let total = legs.reduce(0) { $0 + ears($1) }
    let reached = legs.filter { $0.levels.contains(where: walked) }.count

    VStack(spacing: 6) {
      GeometryReader { geo in
        HStack(spacing: 0) {
          ForEach(legs) { leg in
            let ground = terrainOf(leg.terrain)
            let been = leg.levels.contains(where: walked)
            ZStack(alignment: .bottom) {
              ground.bg
              HStack(spacing: 2.5) {
                ForEach(leg.levels, id: \.name) { level in
                  Circle()
                    .fill(walked(level) ? ground.wall : .clear)
                    .overlay(Circle().strokeBorder(ground.wall, lineWidth: 1))
                    .frame(width: 5.5, height: 5.5)
                    .opacity(walked(level) ? 1 : 0.5)
                }
              }
              .frame(maxHeight: .infinity)
              if been && ears(leg) > 0 && !compact {
                Text("\(ears(leg))")
                  .font(.display(9))
                  .foregroundStyle(.black.opacity(0.5))
                  .padding(.bottom, 2)
              }
            }
            .frame(width: geo.size.width * Double(leg.levels.count) / Double(levels.count))
            .opacity(been ? 1 : 0.32)
          }
        }
      }
      .frame(height: compact ? 38 : 51)
      .clipShape(RoundedRectangle(cornerRadius: 14))
      .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 2))

      if !compact {
        GeometryReader { geo in
          HStack(spacing: 0) {
            ForEach(legs) { leg in
              Text(leg.levels.contains(where: walked) ? leg.name.uppercased() : "")
                .font(.display(8, .bold))
                .foregroundStyle(p.inkSoft)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(width: geo.size.width * Double(leg.levels.count) / Double(levels.count))
            }
          }
        }
        .frame(height: 12)
      }

      HStack(spacing: 8) {
        Image("Maize").resizable().frame(width: 30, height: 30)
        Text("\(total)")
          .font(.display(27).monospacedDigit())
          .foregroundStyle(p.flag)
        Text("gathered across \(reached) \(reached == 1 ? "place" : "places")")
          .font(.system(size: 12))
          .foregroundStyle(p.inkSoft)
      }
      .padding(.top, 11)
    }
    .padding(.top, 26)
  }
}
