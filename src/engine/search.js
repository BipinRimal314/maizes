import { DIRECTIONS, isOpen } from './grid.js'

/** Straight corridor sight stops at stone and uncut timber. */
export function seesPlayer(grid, from, to, range) {
  if (from.x !== to.x && from.y !== to.y) return false
  if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) > range) return false
  const d = DIRECTIONS.find(d => d.dx === Math.sign(to.x - from.x) && d.dy === Math.sign(to.y - from.y))
  if (!d) return true
  let x = from.x, y = from.y
  while (x !== to.x || y !== to.y) {
    if (!isOpen(grid, x, y, d)) return false
    x += d.dx; y += d.dy
  }
  return true
}

export function searchTarget(hunter, grid, ball, now) {
  const at = { x: Math.floor(hunter.x), y: Math.floor(hunter.y) }
  const player = { x: Math.floor(ball.x), y: Math.floor(ball.y) }
  const sheltered = (grid.shelters ?? []).some(p => p.x === player.x && p.y === player.y)
    && Math.hypot(ball.vx ?? 0, ball.vy ?? 0) < .025
  if (!sheltered && seesPlayer(grid, at, player, hunter.sight)) {
    hunter.lastKnown = player
    hunter.mood = 'chasing'
  } else if (hunter.heard && now < hunter.heard.until) {
    hunter.lastKnown = hunter.heard
    hunter.mood = 'investigating'
  } else hunter.mood = sheltered ? 'hidden' : 'searching'
  const target = hunter.lastKnown
  if (target && (target.x !== at.x || target.y !== at.y)) return target
  // Reaching the last seen spot does not magically reveal the player's new one.
  if (!hunter.patrol || now >= hunter.patrolUntil || (hunter.patrol.x === at.x && hunter.patrol.y === at.y)) {
    const open = DIRECTIONS.filter(d => isOpen(grid, at.x, at.y, d))
    const choices = open.filter(d => at.x + d.dx !== hunter.previous?.x || at.y + d.dy !== hunter.previous?.y)
    const options = choices.length ? choices : open
    const d = options[Math.floor(now / 1700) % options.length]
    hunter.previous = at
    hunter.patrol = d ? { x: at.x + d.dx, y: at.y + d.dy } : at
    hunter.patrolUntil = now + 3000
    hunter.lastKnown = null
  }
  return hunter.patrol
}
