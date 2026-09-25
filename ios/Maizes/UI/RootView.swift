import SwiftUI

/*
 * The shell, and the one place that decides what the player sees next. A port
 * of src/App.jsx: story beats are a queue of cards that report they have been
 * read, and only this view picks what follows them.
 */
struct RootView: View {
  private let levels = Level.campaign()
  @ObservedObject private var progress = Progress.shared

  @State private var current: Int?
  @State private var queue: [Beat] = []
  @State private var resumeAt: Int?
  @State private var finished = false
  @State private var booted = false

  private var playing: Bool { current != nil && queue.isEmpty }

  private var screenId: String {
    if let beat = queue.first { return "story-\(beat.id)" }
    if let current { return "play-\(current)" }
    return finished ? "finale" : "levels"
  }

  var body: some View {
    ZStack {
      screen
        .id(screenId)
        .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 8)), removal: .opacity))
    }
    .animation(.easeOut(duration: 0.35), value: screenId)
    .preferredColorScheme(playing ? .dark : .light)
    .statusBarHidden(playing)
    .onAppear {
      guard !booted else { return }
      booted = true
      #if DEBUG
      // `-MaizesLevel 12` on launch opens a field directly, for simulator screenshots
      if UserDefaults.standard.object(forKey: "MaizesLevel") != nil {
        current = min(levels.count - 1, max(0, UserDefaults.standard.integer(forKey: "MaizesLevel")))
        return
      }
      #endif
      if !progress.hasSeen(PROLOGUE.id) { queue = [PROLOGUE] }
    }
  }

  @ViewBuilder private var screen: some View {
    if let beat = queue.first {
      StoryView(beat: beat,
                trail: beat.id == BARGAIN.id ? levels : nil,
                actionLabel: queue.count == 1 && resumeAt != nil ? "on you go" : nil,
                onDone: advance)
    } else if let current {
      PlayView(level: levels[current], index: current, total: levels.count,
               isLast: current == levels.count - 1, onBack: backToLevels, onNext: next)
    } else if finished {
      FinaleView(levels: levels, onBack: backToLevels, onConcede: concede)
    } else {
      LevelsView(levels: levels) { current = $0 }
    }
  }

  /// Which beats finishing level `index` has earned, in the order they play.
  private func beatsAfterLevel(_ index: Int) -> [Beat] {
    let level = levels[index]
    let isLastLevel = index == levels.count - 1
    let isLastOfChapter = isLastLevel || levels[index + 1].chapter != level.chapter

    // the second time through, the only thing left to say is whether it is done
    if progress.speedrunActive { return progress.speedrunComplete(levels) ? [ENDING] : [] }

    var beats: [Beat] = []
    if isLastOfChapter, let beat = CHAPTER_BEATS[level.chapter] { beats.append(beat) }
    if isLastLevel { beats += [BARGAIN, TOO_LATE, SPEEDRUN_BRIEF] }
    return beats
  }

  /// Leaving a won field: the chapter's beat, the next field, or the end.
  private func next() {
    guard let index = current else { return }
    let isLastLevel = index == levels.count - 1
    let beats = beatsAfterLevel(index).filter { !progress.hasSeen($0.id) }

    if !beats.isEmpty {
      resumeAt = isLastLevel ? nil : index + 1
      queue = beats
      current = nil
      return
    }
    if isLastLevel {
      finished = true
      current = nil
      return
    }
    // act two races one field per chapter, so "next" is the next one with a par
    if progress.speedrunActive {
      if let raced = levels.indices.first(where: { $0 > index && progress.parFor(levels[$0].name) != nil }) {
        current = raced
      } else {
        finished = true
        current = nil
      }
      return
    }
    current = index + 1
  }

  /// A beat has been read: mark it, run its side effect, then move on.
  private func advance() {
    guard let beat = queue.first else { return }
    progress.markSeen(beat.id)
    if beat.id == SPEEDRUN_BRIEF.id { progress.startSpeedrun(levels) }
    if beat.id == ENDING.id { progress.finishSpeedrun() }

    queue.removeFirst()
    if !queue.isEmpty { return }

    if beat.id == ENDING.id || beat.id == LOST_HER.id { finished = true; return }
    // the prologue says "pick it up", so it goes straight into the first field
    if beat.id == PROLOGUE.id { current = 0; return }
    if let resume = resumeAt {
      current = resume
      resumeAt = nil
    }
  }

  /// He stops walking. Chosen from the finale, never handed out for being slow.
  private func concede() {
    progress.concedeSpeedrun()
    finished = false
    queue = [LOST_HER]
  }

  private func backToLevels() {
    current = nil
    finished = false
    resumeAt = nil
  }
}
