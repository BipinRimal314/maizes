import { revamp } from '../generate/revamp.js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCandidate, toJSON } from '../generate/generate.js'
import { judge } from '../generate/oracle.js'
import { levelMetrics, shapeDistance } from '../generate/metrics.js'
import { placeTools } from '../generate/placeTools.js'
import { REGIONS, CAMPAIGN_ID, campaignSpec } from '../generate/campaign.js'

const levels = []
const seen = new Set()
let previous = null
for (const [chapter, count, terrain] of REGIONS) {
  for (let local = 0; local < count; local++) {
    const number = levels.length + 1
    const spec = campaignSpec(number, local, count)
    let accepted = null
    const failures = new Map()
    for (let attempt = 0; attempt < 3000; attempt++) {
      const seed = 910000 + number * 100003 + attempt * 7919
      const grid = buildCandidate(seed, spec.tier)
      if (!grid || !placeTools(grid, spec)) continue
      if (!revamp(grid, spec, number, REGIONS.findIndex(r => r[0] === chapter))) continue
      grid.terrain = terrain
      const metrics = levelMetrics(grid)
      if (!metrics || (previous && shapeDistance(metrics, previous) < .35)) continue
      const identity = `${grid.cols},${grid.rows}:${Array.from(grid.walls)}`
      if (seen.has(identity)) continue
      let verdict = judge(grid)
      if (!verdict.ok) { for (const p of verdict.problems) failures.set(p, (failures.get(p) ?? 0) + 1); continue }
      if (spec.hunter) {
        grid.hunter = { behavior: 'search', sight: 7, speed: .048, spawnMs: Math.max(18000, Math.round((grid.pickupMode === 'continuous' ? verdict.difficulty.perfectSeconds * 1000 : verdict.difficulty.perfectLegMs) * 1.25)) }
        verdict = judge(grid)
        if (!verdict.ok) continue
      }
      accepted = toJSON({ grid, seed, tier: CAMPAIGN_ID, intent: spec.challenge, difficulty: verdict.difficulty, teaches: spec.lesson }, `Field ${String(number).padStart(3, '0')}`)
      Object.assign(accepted, { chapter, terrain, number, campaign: CAMPAIGN_ID,
        challenge: spec.challenge, milestone: spec.milestone, relief: spec.relief,
        blurb: null })
      previous = metrics
      seen.add(identity)
      break
    }
    if (!accepted) throw Error(`Could not build field ${number}: ${JSON.stringify([...failures].slice(-6))}`)
    levels.push(accepted)
    console.log(`${accepted.name}: ${accepted.c}×${accepted.r} ${spec.challenge}, axe=${!!accepted.axe}, ward=${!!accepted.charm}, solved=${accepted.difficulty.perfectSeconds.toFixed(1)}s`)
  }
}
writeFileSync(fileURLToPath(new URL('../../public/campaign-v2.json', import.meta.url)), JSON.stringify(levels))
console.log(`Wrote ${levels.length} verified fields.`)
