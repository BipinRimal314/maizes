import SwiftUI

/// The field. The view half of src/ui/Play.jsx.
struct PlayView: View {
  @StateObject private var model: PlayModel
  @ObservedObject private var settings = Settings.shared
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.displayScale) private var displayScale
  @State private var still: Image?

  let index: Int
  let total: Int
  let isLast: Bool
  let onBack: () -> Void
  let onNext: () -> Void

  private let p = Palette.night

  init(level: Level, index: Int, total: Int, isLast: Bool, onBack: @escaping () -> Void, onNext: @escaping () -> Void) {
    _model = StateObject(wrappedValue: PlayModel(level: level))
    self.index = index
    self.total = total
    self.isLast = isLast
    self.onBack = onBack
    self.onNext = onNext
  }

  private var level: Level { model.level }

  var body: some View {
    ZStack {
      p.bg.ignoresSafeArea()
      if let result = model.result {
        resultCard(result)
          .transition(.opacity)
      } else {
        field
        if model.lost {
          overlay { lostMenu }
        } else if model.paused {
          overlay { pauseMenu }
        }
      }
    }
    .animation(.easeOut(duration: 0.25), value: model.result != nil)
    .animation(.easeOut(duration: 0.25), value: model.paused)
    .animation(.easeOut(duration: 0.25), value: model.lost)
    .onAppear {
      model.start()
      Sound.shared.startAmbience(level.terrain)
    }
    .onDisappear {
      model.stop()
      Sound.shared.stopAmbience()
    }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { model.pause(true) }
    }
    .onChange(of: settings.muted) { _, _ in Sound.shared.startAmbience(level.terrain) }
  }

  // ------------------------------------------------------------------ field

  private var field: some View {
    VStack(spacing: 10) {
      header
      hudRow
      GeometryReader { geo in
        let view = BoardView.measure(cols: level.grid.cols, rows: level.grid.rows,
                                     width: geo.size.width, height: geo.size.height)
        board(view)
          .frame(width: geo.size.width, height: geo.size.height)
          .task(id: view) {
            model.view = view
            still = BoardArt.stillImage(level.grid, cell: view.cellSize, scale: displayScale)
          }
      }
      quipLine
      Button("restart") { model.restart() }
        .buttonStyle(PillButton(palette: p, small: true))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 8)
  }

  private var header: some View {
    HStack(spacing: 12) {
      Button("← levels", action: onBack)
        .buttonStyle(PillButton(palette: p, small: true))
      Text(level.name)
        .font(.display(16))
        .foregroundStyle(p.ink)
        .frame(maxWidth: .infinity)
        .lineLimit(1)
      Text("\(index + 1)/\(total)")
        .font(.system(size: 13).monospacedDigit())
        .foregroundStyle(p.inkSoft)
      Button { model.togglePause() } label: { Image(systemName: model.paused ? "play.fill" : "pause.fill") }
        .buttonStyle(PillButton(palette: p, small: true))
        .accessibilityLabel(model.paused ? "resume" : "pause and open the menu")
    }
  }

  private var hudRow: some View {
    let hud = model.hud
    return HStack(spacing: 8) {
      hudTile("time", clock(hud.now))
      hudTile("maize", "\(hud.captured)/\(level.grid.flags.count)",
              color: hud.exitOpen ? p.exit : p.flag,
              background: hud.exitOpen ? p.exitSoft : p.surface,
              border: hud.exitOpen ? p.exit : p.line)
      if let par = model.par {
        let blown = hud.now > par
        hudTile(blown ? "too slow" : "beat", clock(par),
                color: blown ? p.trap : p.exit,
                background: blown ? p.trapSoft : p.surface,
                border: blown ? p.trap : p.line)
      }
      if level.grid.hunter != nil {
        hudTile(hud.hunterAwake ? "ghost" : "ghost in",
                hud.hunterAwake ? "👻" : "\(hud.hunterIn ?? 0)s",
                color: hud.hunterAwake ? p.hunter : p.inkSoft,
                background: hud.hunterAwake ? p.hunterSoft : p.surface,
                border: hud.hunterAwake ? p.hunter : p.line)
      }
    }
  }

  private func hudTile(_ label: String, _ value: String, color: Color? = nil,
                       background: Color? = nil, border: Color? = nil) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(label.uppercased())
        .font(.display(9, .bold))
        .tracking(0.7)
        .foregroundStyle(color == p.inkSoft || color == nil ? p.inkSoft : color!)
      Text(value)
        .font(.display(18).monospacedDigit())
        .foregroundStyle(color ?? p.ink)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 12)
    .padding(.vertical, 7)
    .background(RoundedRectangle(cornerRadius: 12).fill(background ?? p.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(border ?? p.line, lineWidth: 2))
  }

  private func board(_ view: BoardView) -> some View {
    ZStack {
      TimelineView(.animation(paused: model.result != nil)) { _ in
        Canvas(rendersAsynchronously: false) { ctx, _ in
          BoardArt.drawScene(ctx, model.game, cell: view.cellSize, still: still)
        }
      }
      .frame(width: Double(view.viewCols) * view.cellSize, height: Double(view.viewRows) * view.cellSize)
      .clipShape(RoundedRectangle(cornerRadius: 14))
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { model.drag($0.location) }
          .onEnded { _ in model.release() }
      )

      if model.intro {
        VStack(spacing: 5) {
          Text(level.chapter.uppercased())
            .font(.display(11, .bold))
            .tracking(1.8)
            .foregroundStyle(p.inkSoft)
          Text(level.name)
            .font(.display(24, .bold))
            .foregroundStyle(p.ink)
        }
        .shadow(color: .black.opacity(0.9), radius: 6)
        .allowsHitTesting(false)
        .transition(.opacity)
      }
    }
    .animation(.easeInOut(duration: 0.35), value: model.intro)
  }

  private var quipLine: some View {
    let line = model.hud.quip.isEmpty ? (model.whisper ?? "") : model.hud.quip
    let whispering = model.hud.quip.isEmpty && model.whisper != nil
    return Text(line)
      .font(.system(size: 13).italic())
      .foregroundStyle(whispering ? p.fading : p.inkSoft)
      .multilineTextAlignment(.center)
      .frame(maxWidth: 400, minHeight: 34)
      .id(line)
      .transition(.opacity)
      .animation(.easeOut(duration: 0.4), value: line)
  }

  // ---------------------------------------------------------------- menus

  private func overlay<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    ZStack {
      Color(r: 10, g: 8, b: 6, a: 0.9).ignoresSafeArea()
      ScrollView {
        content()
          .frame(maxWidth: 300)
          .padding(.vertical, 40)
          .frame(maxWidth: .infinity)
      }
    }
    .transition(.opacity)
  }

  private var lostMenu: some View {
    VStack(spacing: 8) {
      Text("Caught.")
        .font(.display(20))
        .foregroundStyle(p.trap)
      Text(model.caughtLine)
        .font(.system(size: 15).italic())
        .foregroundStyle(p.ink)
        .multilineTextAlignment(.center)
      Text(level.grid.flags.count > 1
           ? "The maize goes back where it was. Start the field again."
           : "Start the field again.")
        .font(.system(size: 12))
        .foregroundStyle(p.inkSoft)
        .multilineTextAlignment(.center)
        .padding(.bottom, 16)
      Button("again") { model.restart() }
        .buttonStyle(PillButton(palette: p, primary: true))
        .frame(maxWidth: .infinity)
      Button("levels", action: onBack)
        .buttonStyle(PillButton(palette: p))
    }
  }

  private var pauseMenu: some View {
    VStack(spacing: 8) {
      Text("paused")
        .font(.display(18))
        .foregroundStyle(p.ink)
        .padding(.bottom, 8)
      Group {
        Button("resume") { model.togglePause() }
          .buttonStyle(PillButton(palette: p, primary: true))
        Button("restart level") { model.restart() }
          .buttonStyle(PillButton(palette: p))
        Button("sound: \(settings.muted ? "off" : "on")") { settings.muted.toggle() }
          .buttonStyle(PillButton(palette: p))
      }
      .frame(maxWidth: .infinity)

      menuSlider("volume") {
        Slider(value: $settings.volume, in: 0...1, step: 0.05) { editing in
          if !editing { Sound.shared.startAmbience(level.terrain) }
        }
        .disabled(settings.muted)
      }

      Button("back to levels", action: onBack)
        .buttonStyle(PillButton(palette: p))

      Divider().overlay(p.line).padding(.vertical, 8)

      Text("MAKE IT KINDER")
        .font(.display(10, .bold))
        .tracking(0.8)
        .foregroundStyle(p.inkSoft)
      Toggle(isOn: $settings.assist.steadyBoard) {
        Text("HOLD THE BOARD STEADY").font(.display(11, .bold)).foregroundStyle(p.inkSoft)
      }
      .tint(p.flag)
      menuSlider("see further") {
        Slider(value: $settings.assist.fogBonus, in: 0...3, step: 1)
      }
      menuSlider("ghost hangs back") {
        Slider(value: Binding(get: { 1.5 - settings.assist.ghostPace },
                              set: { settings.assist.ghostPace = 1.5 - $0 }),
               in: 0.5...1, step: 0.1)
      }
      Text("takes effect next field · every field is still beatable")
        .font(.display(10, .bold))
        .foregroundStyle(p.inkSoft.opacity(0.7))
        .multilineTextAlignment(.center)
    }
    .tint(p.flag)
  }

  private func menuSlider<Control: View>(_ label: String, @ViewBuilder _ control: () -> Control) -> some View {
    HStack(spacing: 10) {
      Text(label.uppercased())
        .font(.display(11, .bold))
        .foregroundStyle(p.inkSoft)
        .frame(width: 118, alignment: .leading)
      control()
    }
  }

  // ---------------------------------------------------------------- result

  private func resultCard(_ result: PlayModel.Outcome) -> some View {
    let paper = Palette.paper
    let racing = result.par != nil
    let saved = racing && result.ms < result.par!
    let clean = result.deaths == 0

    let emoji = racing ? (saved ? "🏃" : "⏱") : (clean ? "🏆" : result.deaths < 6 ? "🎉" : "😅")
    let title = racing ? (saved ? "Faster." : "Not fast enough.") : (clean ? "Not one stumble." : "Through.")
    let sub = racing
      ? (saved ? "\(clock(result.par! - result.ms)) to the good. Keep on." : "\(clock(result.ms - result.par!)) short. This field again, then.")
      : (clean ? "Clean as a whistle. Do not let it go to your head." : "Slow, and sore, and through all the same.")

    return ScrollView {
      CardBox(palette: paper) {
        Text(emoji).font(.system(size: 40))
        Text(title)
          .font(.display(22))
          .foregroundStyle(paper.ink)
          .padding(.top, 8)
        Text(sub)
          .font(.system(size: 14).italic())
          .foregroundStyle(paper.inkSoft)
          .multilineTextAlignment(.center)
        HStack(spacing: 10) {
          StatTile(palette: paper, label: "time", value: clock(result.ms))
          if let par = result.par {
            StatTile(palette: paper, label: "to beat", value: clock(par))
          } else {
            StatTile(palette: paper, label: "deaths", value: "\(result.deaths)")
          }
        }
        .padding(.vertical, 22)
        HStack(spacing: 10) {
          Button(isLast ? "finish" : "next level", action: onNext)
            .buttonStyle(PillButton(palette: paper, primary: true))
          Button("levels", action: onBack)
            .buttonStyle(PillButton(palette: paper))
        }
        Text("\(level.name) · \(Int(result.ms / 1000))s")
          .font(.system(size: 11))
          .foregroundStyle(paper.inkSoft.opacity(0.7))
          .padding(.top, 18)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 40)
      .frame(maxWidth: .infinity)
    }
    .background(paper.bg.ignoresSafeArea())
  }
}
