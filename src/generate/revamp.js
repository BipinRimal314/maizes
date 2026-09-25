import { DIRECTIONS, isOpen, key } from '../engine/grid.js'
import { distancesFrom, findPath } from './analysis.js'

const MEMORIES = [
  ['The red ribbon', 'Her ribbon, tied twice around a branch. She knows the first knot always slips.'],
  ['Small footprints', 'Two sets of prints. Hers, and something smaller. She stopped to help it.'],
  ['A folded leaf', 'A leaf folded into a boat. We made these when the ditch flooded. Mine never floated.'],
  ['The low branch', 'She bent the branch away from the path. Even frightened, she thought about whoever came next.'],
  ['Three stones', 'Three stones in a little tower. Our sign for “I was here.” I put the fallen one back.'],
  ['A torn cuff', 'A strip from her sleeve, caught on the timber. No blood. I breathe again.'],
  ['The shared apple', 'An apple core beside tiny paw prints. She gave away part of her supper.'],
  ['A yellow thread', 'She kept a thread from my old hat. I did not know she had it.'],
  ['A dry hollow', 'Leaves pressed flat under a hedge. She found somewhere to rest. I hope she slept.'],
  ['The charcoal arrow', 'An arrow drawn low on the stone. She made it where I would look.'],
  ['A practice knot', 'The knot I taught her, pulled tight. I used to think she never listened.'],
  ['Still warm', 'A little ash sheltered from the wind. She was here recently. I am getting closer.'],
  ['Her last marker', 'Two knots and a yellow thread. Not a farewell. She expects me to find her.'],
]

const QUIET_NOTES = [
  'She used to tie ribbons to my sleeve so I would not get lost. I laughed then.',
  'Little prints turn back toward the ditch, then rejoin hers. Whatever she helped got out.',
  'Another leaf boat waits in a puddle. This one carries a pebble for a passenger.',
  'The thorns are tucked behind the branch. She must have scratched her hands doing this.',
  'I make a second stone tower beside hers. It is something to do with my shaking hands.',
  'A careful patch of stitching. She mended the tear before she went on.',
  'The apple seeds are planted in a row. She never could leave a thing without trying to grow it.',
  'A thread catches the light. I remember her asking if she could keep it. I said yes without looking up.',
  'She covered the hollow with fresh leaves after she left. A bed for the next small traveller.',
  'Under the arrow, a tiny drawing of my hat. She knew who would follow.',
  'The rope held. All those afternoons practising on the fence were not wasted.',
  'A handprint in the ash, small enough to fit inside mine. I lay my palm beside it.',
  'Her steps are steady here. She is tired, but she is still choosing where to go.',
]

/** Reserve a genuine optional shortcut: the uncut route stays open and longer. */
function shortcut(grid) {
  const blocked = new Set(grid.traps.map(p => key(p.x, p.y)))
  const reserved = new Set([grid.start, grid.end, ...grid.flags, ...grid.traps, grid.charm].filter(Boolean).map(p => key(p.x, p.y)))
  for (const goal of [...grid.flags, grid.end]) {
    const route = findPath(grid, grid.start, goal, blocked)
    for (const p of (route ?? []).slice(3, -2)) {
      if (reserved.has(key(p.x, p.y))) continue
      const cut = new Set([...blocked, key(p.x, p.y)])
      const alternate = findPath(grid, grid.start, goal, cut)
      if (!alternate || alternate.length < route.length + 5) continue
      const reachable = distancesFrom(grid, grid.start, cut)
      if ([...grid.flags, grid.end, grid.charm].filter(Boolean).some(q => !reachable.has(key(q.x, q.y)))) continue
      const axe = [...reachable].filter(([id, d]) => d >= 2 && d <= 8 && !reserved.has(id) && id !== key(p.x, p.y))
        .sort((a, b) => a[1] - b[1])[0]
      if (!axe) continue
      const [x, y] = axe[0].split(',').map(Number)
      grid.axe = { x, y }
      grid.wood = [p]
      grid.shortcutSaving = alternate.length - route.length
      return true
    }
  }
  return false
}

export function revamp(grid, spec, number, chapterIndex) {
  grid.revision = 3
  grid.pickupMode = spec.returnTrips ? 'return' : 'continuous'
  grid.objective = spec.challenge
  grid.woodMode = spec.shortcut ? 'optional' : 'required'
  if (spec.shortcut && !shortcut(grid)) return false
  const blocked = new Set([...grid.traps, ...(grid.wood ?? [])].map(p => key(p.x, p.y)))
  const reserved = new Set([grid.start, grid.end, ...grid.flags, ...grid.traps, ...(grid.wood ?? []), grid.axe, grid.charm].filter(Boolean).map(p => key(p.x, p.y)))
  const safe = distancesFrom(grid, grid.start, new Set(grid.traps.map(p => key(p.x, p.y))))
  const choices = [...safe].filter(([id, d]) => d >= 3 && !reserved.has(id)).map(([id]) => {
    const [x, y] = id.split(',').map(Number); return { x, y }
  })
  grid.shelters = spec.hunter ? choices.filter(p => DIRECTIONS.filter(d => isOpen(grid, p.x, p.y, d)).length === 1).slice(0, 3) : []
  grid.shelters.forEach(p => reserved.add(key(p.x, p.y)))
  grid.discoveries = []
  if (spec.relief || spec.milestone || number === 3) {
    const route = findPath(grid, grid.start, grid.flags[0] ?? grid.end, new Set(grid.traps.map(p => key(p.x, p.y)))) ?? []
    const places = route.filter(p => !reserved.has(key(p.x, p.y)))
    const p = places[Math.floor(places.length / 2)]
    if (p) {
      const [title, originalText] = MEMORIES[chapterIndex]
      const text = number === 3 ? 'A red ribbon at her height. The knot is deliberate. She is leaving me a trail.' : spec.relief ? QUIET_NOTES[chapterIndex] : originalText
      grid.discoveries.push({ ...p, id: `memory-${number}`, title, text })
    }
  }
  if (number === 100) {
    const route = (findPath(grid, grid.start, grid.end, new Set(grid.traps.map(p => key(p.x, p.y)))) ?? []).filter(p => !reserved.has(key(p.x, p.y)))
    if (route.length < 3) return false
    const notes = [
      ['The first knot', 'The first knot points toward the timber. She remembered the way I taught her.'],
      ['The second knot', 'Another knot beyond the dark. She found her own way through. Now it is my turn.'],
      ['The yellow thread', 'My old hat thread, tied beside her ribbon. “Papa will come.” I will, Maizy.'],
    ]
    grid.discoveries = notes.map(([title, text], i) => ({ ...route[Math.floor((route.length - 1) * i / 2)], id: `final-marker-${i}`, title, text, required: true }))
  }
  // Keep optional axe reachable before any timber is cut.
  if (grid.axe && !distancesFrom(grid, grid.start, blocked).has(key(grid.axe.x, grid.axe.y))) return false
  return true
}
