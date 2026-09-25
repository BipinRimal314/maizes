/** In-world clues are subdued marks, never the developer overlay's red crosses. */
export function drawLandmarks(ctx, game, s) {
  if (!game.grid.revision) return
  ctx.save()
  ctx.lineWidth = Math.max(1.5, s * .035)
  for (const p of game.grid.traps) {
    const x = (p.x + .5) * s, y = (p.y + .5) * s
    ctx.strokeStyle = '#b39672'
    ctx.beginPath()
    ctx.moveTo(x - .24 * s, y - .1 * s); ctx.lineTo(x - .04 * s, y + .05 * s)
    ctx.lineTo(x + .07 * s, y - .08 * s); ctx.lineTo(x + .22 * s, y + .12 * s)
    ctx.stroke()
    ctx.fillStyle = '#8f785c'
    ctx.fillRect(x - .22 * s, y + .2 * s, s * .1, s * .04)
  }
  for (const p of game.grid.shelters ?? []) {
    const x = (p.x + .5) * s, y = (p.y + .5) * s
    ctx.fillStyle = '#3e6951'
    for (const dx of [-.2, 0, .2]) {
      ctx.beginPath(); ctx.arc(x + dx * s, y, s * .19, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = '#b3ce99'
    ctx.beginPath(); ctx.moveTo(x - .22 * s, y + .27 * s); ctx.lineTo(x + .22 * s, y + .27 * s); ctx.stroke()
  }
  for (const p of game.grid.discoveries ?? []) {
    if (game.discoveries.has(p.id)) continue
    const x = (p.x + .5) * s, y = (p.y + .5) * s
    ctx.strokeStyle = '#e9ab93'; ctx.lineWidth = s * .08
    ctx.beginPath(); ctx.moveTo(x - .12 * s, y + .3 * s); ctx.lineTo(x, y - .3 * s); ctx.stroke()
    ctx.fillStyle = '#d78976'
    ctx.beginPath(); ctx.moveTo(x, y - .25 * s); ctx.lineTo(x + .3 * s, y - .1 * s)
    ctx.lineTo(x + .05 * s, y + .02 * s); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}
