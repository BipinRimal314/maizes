import SwiftUI

/*
 * What the player has done, and how they like it. A port of
 * src/ui/progress.js, with the settings that lived in localStorage beside it.
 *
 * The save is a JSON file in Application Support, read once at launch and
 * rewritten whole on every change — the same shape the desktop build writes,
 * and a couple of kilobytes for a finished campaign.
 */

struct Run: Codable {
  var deaths: Int
  var ms: Double
}

struct Speedrun: Codable {
  var active = false
  /// Frozen when the second run starts. Racing the live bests would be racing
  /// a number that always equals your best.
  var par: [String: Double] = [:]
  var beaten: [String: Double] = [:]
  var finished = false
  var gaveUp = false

  init() {}

  init(from decoder: Decoder) throws {
    let k = try decoder.container(keyedBy: CodingKeys.self)
    active = try k.decodeIfPresent(Bool.self, forKey: .active) ?? false
    par = try k.decodeIfPresent([String: Double].self, forKey: .par) ?? [:]
    beaten = try k.decodeIfPresent([String: Double].self, forKey: .beaten) ?? [:]
    finished = try k.decodeIfPresent(Bool.self, forKey: .finished) ?? false
    gaveUp = try k.decodeIfPresent(Bool.self, forKey: .gaveUp) ?? false
  }
}

struct Save: Codable {
  var done: [String: Run] = [:]
  var story: [String: Bool] = [:]
  var speedrun = Speedrun()
}

final class Progress: ObservableObject {
  static let shared = Progress()

  @Published private(set) var save: Save

  private let url: URL = {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return dir.appendingPathComponent("save.json")
  }()

  private init() {
    // a corrupt save is a bad evening; a save that blocks launch is a bug
    if let data = try? Data(contentsOf: url), let loaded = try? JSONDecoder().decode(Save.self, from: data) {
      save = loaded
    } else {
      save = Save()
    }
  }

  private func write() {
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try JSONEncoder().encode(save).write(to: url, options: .atomic)
    } catch {
      // a save that cannot be written must not take the game down
    }
  }

  func recordWin(_ name: String, deaths: Int, ms: Double) {
    if let previous = save.done[name], !(deaths < previous.deaths || (deaths == previous.deaths && ms < previous.ms)) {
      // not a better run
    } else {
      save.done[name] = Run(deaths: deaths, ms: ms)
    }
    if save.speedrun.active, let par = save.speedrun.par[name], ms < par {
      if let best = save.speedrun.beaten[name], best <= ms {} else { save.speedrun.beaten[name] = ms }
    }
    write()
  }

  func isDone(_ name: String) -> Bool { save.done[name] != nil }
  func bestFor(_ name: String) -> Run? { save.done[name] }
  var doneCount: Int { save.done.count }

  /// Only an unbroken run from the start unlocks the next field.
  func unlockedCount(_ levels: [Level]) -> Int {
    var reached = 0
    while reached < levels.count && save.done[levels[reached].name] != nil { reached += 1 }
    return min(reached + 1, levels.count)
  }

  var totals: (levels: Int, deaths: Int, ms: Double, flawless: Int) {
    let runs = Array(save.done.values)
    return (runs.count, runs.reduce(0) { $0 + $1.deaths }, runs.reduce(0) { $0 + $1.ms }, runs.filter { $0.deaths == 0 }.count)
  }

  /// Ignore retired fields in the displayed totals, but retain their saved runs.
  func totals(for levels: [Level]) -> (levels: Int, deaths: Int, ms: Double, flawless: Int) {
    let runs = levels.compactMap { save.done[$0.name] }
    return (runs.count, runs.reduce(0) { $0 + $1.deaths }, runs.reduce(0) { $0 + $1.ms }, runs.filter { $0.deaths == 0 }.count)
  }

  var walkedMs: Double { save.done.values.reduce(0) { $0 + $1.ms } }

  func maizeCollected(_ levels: [Level]) -> Int {
    levels.reduce(0) { $0 + (save.done[$1.name] != nil ? $1.grid.flags.count : 0) }
  }

  func hasSeen(_ id: String) -> Bool { save.story[id] == true }

  func markSeen(_ id: String) {
    save.story[id] = true
    write()
  }

  /// The fields act two races: the last one of every chapter.
  static func speedrunFields(_ levels: [Level]) -> [Level] {
    levels.enumerated().filter { i, level in
      i == levels.count - 1 || levels[i + 1].chapter != level.chapter
    }.map(\.element)
  }

  func startSpeedrun(_ levels: [Level]) {
    var run = Speedrun()
    run.active = true
    for level in Progress.speedrunFields(levels) {
      if let best = save.done[level.name] { run.par[level.name] = best.ms }
    }
    save.speedrun = run
    write()
  }

  var speedrunActive: Bool { save.speedrun.active }
  var speedrunFinished: Bool { save.speedrun.finished }
  var speedrunGaveUp: Bool { save.speedrun.gaveUp }

  /// Not terminal: beating every field afterwards still lands the true ending.
  func concedeSpeedrun() {
    save.speedrun.gaveUp = true
    write()
  }

  func parFor(_ name: String) -> Double? { save.speedrun.par[name] }
  func isBeaten(_ name: String) -> Bool { save.speedrun.beaten[name] != nil }

  func speedrunProgress(_ levels: [Level]) -> (beaten: Int, total: Int) {
    let target = levels.filter { save.speedrun.par[$0.name] != nil }
    return (target.filter { save.speedrun.beaten[$0.name] != nil }.count, target.count)
  }

  func speedrunComplete(_ levels: [Level]) -> Bool {
    let run = speedrunProgress(levels)
    return run.total > 0 && run.beaten == run.total
  }

  func finishSpeedrun() {
    save.speedrun.finished = true
    write()
  }
}

final class Settings: ObservableObject {
  static let shared = Settings()
  private let defaults = UserDefaults.standard

  @Published var muted: Bool { didSet { defaults.set(muted, forKey: "maizes:muted") } }
  @Published var volume: Double { didSet { defaults.set(volume, forKey: "maizes:volume") } }

  /// Every dial only ever makes the game gentler; see src/engine/assist.js.
  @Published var assist: Assist {
    didSet {
      let clamped = Settings.clamp(assist)
      if clamped != assist { assist = clamped; return }
      if let data = try? JSONEncoder().encode(assist) { defaults.set(data, forKey: "maizes:assist") }
    }
  }

  private static func clamp(_ a: Assist) -> Assist {
    Assist(steadyBoard: a.steadyBoard,
           fogBonus: min(3, max(0, a.fogBonus)),
           ghostPace: min(1, max(0.5, a.ghostPace)))
  }

  private init() {
    muted = defaults.bool(forKey: "maizes:muted")
    let stored = defaults.object(forKey: "maizes:volume") as? Double
    volume = stored.map { min(1, max(0, $0)) } ?? 0.55
    if let data = defaults.data(forKey: "maizes:assist"), let a = try? JSONDecoder().decode(Assist.self, from: data) {
      assist = Settings.clamp(a)
    } else {
      // someone who asked the phone for less motion should not have to ask again
      assist = Assist(steadyBoard: UIAccessibility.isReduceMotionEnabled)
    }
  }
}
