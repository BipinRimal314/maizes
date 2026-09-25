import Foundation

/// One field of the campaign, decoded from the compact form in levels.json
/// (see `fromJSON` in src/generate/generate.js).
struct Level: Decodable {
  let name: String
  let chapter: String
  let blurb: String?
  let terrain: String
  let grid: Grid

  private enum Keys: String, CodingKey {
    case name, chapter, blurb, terrain, c, r, w, s, e, f, t, fog, m, sf, h
  }

  init(from decoder: Decoder) throws {
    let k = try decoder.container(keyedBy: Keys.self)
    name = try k.decode(String.self, forKey: .name)
    chapter = try k.decode(String.self, forKey: .chapter)
    blurb = try k.decodeIfPresent(String.self, forKey: .blurb)
    terrain = try k.decodeIfPresent(String.self, forKey: .terrain) ?? "field"

    let cols = try k.decode(Int.self, forKey: .c)
    let rows = try k.decode(Int.self, forKey: .r)
    let cell = { (pair: [Int]) in Cell(x: pair[0], y: pair[1]) }

    var surface = [UInt8](repeating: GROUND, count: cols * rows)
    for patch in try k.decodeIfPresent([[Int]].self, forKey: .sf) ?? [] {
      surface[patch[1] * cols + patch[0]] = UInt8(patch[2])
    }
    let hunter = try k.decodeIfPresent([Double].self, forKey: .h)

    grid = Grid(
      cols: cols,
      rows: rows,
      walls: try k.decode([UInt8].self, forKey: .w),
      flags: try k.decode([[Int]].self, forKey: .f).map(cell),
      traps: try k.decode([[Int]].self, forKey: .t).map(cell),
      start: cell(try k.decode([Int].self, forKey: .s)),
      end: cell(try k.decode([Int].self, forKey: .e)),
      fog: try k.decodeIfPresent(Double.self, forKey: .fog),
      memory: try k.decodeIfPresent(Double.self, forKey: .m),
      hunter: hunter.map { HunterSpec(spawnMs: $0[0], speed: $0[1]) },
      surface: surface,
      terrain: terrain
    )
  }

  static func campaign(in bundle: Bundle = .main) -> [Level] {
    guard let url = bundle.url(forResource: "levels", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let levels = try? JSONDecoder().decode([Level].self, from: data)
    else { fatalError("levels.json is missing from the app bundle or does not decode") }
    return levels
  }
}
