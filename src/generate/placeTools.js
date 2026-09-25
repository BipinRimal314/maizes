import { key } from '../engine/grid.js'
import { distancesFrom, findPath } from './analysis.js'

/** A complete distance frontier is a cut: no route can sneak around its wood. */
export function placeTools(grid, { axe = false, ward = false } = {}) {
  const traps = new Set(grid.traps.map(p => key(p.x, p.y)))
  const dist = distancesFrom(grid, grid.start)
  const reserved = new Set([grid.start, grid.end, ...grid.flags, ...grid.traps].map(p => key(p.x, p.y)))
  if (axe) {
    const nearest = Math.min(...[grid.end, ...grid.flags].map(p => dist.get(key(p.x, p.y))))
    let found = false
    for (let depth = Math.min(8, nearest - 2); depth >= 4; depth--) {
      const wood = [...dist].filter(([, d]) => d === depth + 1).map(([id]) => id)
      if (!wood.length || wood.length > 6 || wood.some(id => reserved.has(id))) continue
      const reachable = distancesFrom(grid, grid.start, new Set([...traps, ...wood]))
      const candidates = [...reachable].filter(([id, d]) => d >= 3 && d <= depth && !reserved.has(id))
      if (!candidates.length) continue
      candidates.sort((a, b) => b[1] - a[1])
      const [x, y] = candidates[0][0].split(',').map(Number)
      grid.axe = { x, y }
      grid.wood = wood.map(id => { const [x, y] = id.split(',').map(Number); return { x, y } })
      for (const p of [grid.axe, ...grid.wood]) grid.surface[p.y * grid.cols + p.x] = 0
      reserved.add(key(x, y))
      wood.forEach(id => reserved.add(id))
      found = true
      break
    }
    if (!found) return false
  }
  if (ward) {
    const route = findPath(grid, grid.start, grid.end, traps)
    const choices = route?.filter(p => !reserved.has(key(p.x, p.y))) ?? []
    if (!choices.length) return false
    grid.charm = choices[Math.min(choices.length - 1, Math.floor(choices.length / 3))]
    grid.surface[grid.charm.y * grid.cols + grid.charm.x] = 0
  }
  return true
}
