/**
 * Build the shipped level set.
 *
 * Run:  npm run levels
 *
 * Generates every level from a seed, judges it, and writes only the ones the
 * oracle accepts. Deterministic — the same seeds always produce the same
 * campaign — and it prints why candidates were rejected, which is usually more
 * interesting than the levels that passed.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateLevel, toJSON } from '../generate/generate.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(HERE, '../../public/levels.json')

/**
 * How near two levels in the same chapter may be in shape before one is refused.
 *
 * Calibrated, not guessed. Generating with intents and no distinctness rule at
 * all gives in-chapter distances with a floor of 0.33 and a lower quartile of
 * 0.63, so 0.55 refuses the closest pairs while staying comfortably reachable —
 * a threshold above the median would simply fail to build the campaign, which
 * is how the first attempt at 0.9 announced itself.
 */
const MIN_SHAPE_DISTANCE = 0.55

/**
 * The campaign. Each chapter teaches one thing and then stops.
 *
 * `intents` gives every level its own question to ask, so a chapter is a set of
 * different problems built from the same mechanics rather than the same problem
 * generated from different seeds.
 *
 * Each chapter opens on the intent the previous one closed with. That keeps the
 * one-new-variable rule honest: on the level where fog or the hunter or the
 * snow arrives, the shape of the problem is the shape you just finished, so the
 * only thing that has changed is the mechanic.
 *
 * `terrain` is presentation only — it repaints the board so the journey looks
 * like it is going somewhere, and changes nothing the oracle judges.
 *
 * The previous version had ten chapters of a hundred levels in its design
 * document and shipped twenty-five that no one had played through. Twenty
 * levels that are all verified beatable is a better game than a hundred that
 * are not.
 */
const CHAPTERS = [
  {
    name: 'Warm Up',
    intents: ['artery', 'warren', 'circuit', 'bottleneck'],
    terrain: 'field',
    blurb: 'My own field, and one ear of hers lying in it. That is all this is.',
    tier: 'gentle',
    count: 4,
    seed: 1000,
  },
  {
    name: 'Two Trips',
    intents: ['bottleneck', 'detour', 'gauntlet'],
    terrain: 'track',
    blurb: 'Two of them out here now, and the ground not to be trusted.',
    tier: 'brisk',
    count: 3,
    seed: 2000,
  },
  // Fog arrives at level 8. It is the idea the game is actually about, and
  // waiting until level 11 spent half the campaign before getting to it.
  {
    name: 'First Light',
    intents: ['gauntlet', 'artery', 'warren', 'circuit'],
    terrain: 'dusk',
    blurb: 'The same field it always was. I simply cannot see it any more.',
    tier: 'misty',
    count: 4,
    seed: 2500,
  },
  {
    name: 'The Fog',
    intents: ['circuit', 'bottleneck', 'detour', 'warren'],
    terrain: 'woods',
    blurb: 'Closer in. I shall have to remember what I walked through.',
    tier: 'blind',
    count: 4,
    seed: 3000,
  },
  // The hunter arrives at level 16 the same way fog arrived at level 8: same
  // size, same flags, same traps, same fog radius as the chapter before it. One
  // new variable, so a player who suddenly struggles knows what changed.
  {
    name: 'Company',
    intents: ['warren', 'bottleneck', 'artery', 'gauntlet'],
    terrain: 'night',
    blurb: 'The same as before. I am only not alone in it now.',
    tier: 'hunted',
    count: 4,
    seed: 3500,
  },
  {
    name: 'No Mercy',
    intents: ['gauntlet', 'circuit', 'detour', 'warren', 'bottleneck'],
    terrain: 'ridge',
    blurb: 'Wider, darker, and something in it still looking for me.',
    tier: 'cruel',
    count: 5,
    seed: 4000,
  },
  // Ground that is not flat earth. Sand first on its own, then snow alongside
  // it — one new thing per chapter, and neither ever leaves again.
  {
    name: 'The Dry Reach',
    intents: ['bottleneck', 'artery', 'circuit'],
    terrain: 'desert',
    blurb: 'Hard flat ground, and it throws you along faster than you meant to go.',
    tier: 'dry',
    count: 3,
    seed: 6000,
  },
  {
    name: 'The White Mile',
    intents: ['circuit', 'gauntlet', 'detour'],
    terrain: 'snow',
    blurb: 'Drifts to wade. The sand was kinder and I did not thank it.',
    tier: 'white',
    count: 3,
    seed: 6500,
  },
  // Memory goes by the same rule that governed fog and the hunter: identical
  // to the chapter before it in every other respect.
  {
    name: 'Forgetting',
    intents: ['detour', 'warren', 'artery'],
    terrain: 'marsh',
    blurb: 'I will walk every foot of it. I will not keep a step.',
    tier: 'fading',
    count: 3,
    seed: 4500,
  },
  // Memory keeps tightening: 7.0s -> 4.0s -> 2.5s. The forest is the last
  // strange place before the fires, and the only one lit from the walls in.
  {
    name: 'The Lit Wood',
    intents: ['artery', 'circuit', 'bottleneck'],
    terrain: 'enchanted',
    blurb: 'The trees here give off their own light. I do not care for it.',
    tier: 'enchanted',
    count: 3,
    seed: 5500,
  },
  {
    name: 'Nothing Stays',
    intents: ['bottleneck', 'detour', 'gauntlet'],
    terrain: 'ember',
    blurb: 'It closes behind me near as fast as I can open it.',
    tier: 'vanishing',
    count: 3,
    seed: 5000,
  },
]

function build() {
  const levels = []
  const report = []
  let totalRejected = 0
  const rejectionReasons = new Map()

  for (const chapter of CHAPTERS) {
    // shapes accepted so far in this chapter; a candidate too near any of them
    // is refused, which is what stops two levels being the same level
    const shapes = []

    for (let i = 0; i < chapter.count; i++) {
      const name = `${chapter.name} ${i + 1}`
      const seed = chapter.seed + i * 101
      const intent = chapter.intents[i]
      const started = Date.now()
      const level = generateLevel(chapter.tier, seed, {
        intent,
        unlike: shapes,
        apart: MIN_SHAPE_DISTANCE,
      })

      totalRejected += level.rejected.length
      for (const rejection of level.rejected) {
        for (const problem of rejection.problems) {
          const kind = problem.replace(/-?\d+/g, 'N')
          rejectionReasons.set(kind, (rejectionReasons.get(kind) || 0) + 1)
        }
      }

      if (!level.grid) {
        throw new Error(
          `could not generate "${name}" (${chapter.tier}/${intent}) after ${level.attempts} attempts`
        )
      }
      shapes.push(level.metrics)

      const json = toJSON(level, name)
      json.chapter = chapter.name
      json.blurb = chapter.blurb
      json.terrain = chapter.terrain
      levels.push(json)

      const d = level.difficulty
      report.push(
        `${name.padEnd(15)} ${String(level.intent).padEnd(10)} tries=${String(level.attempts).padStart(4)} ` +
        `${String(Date.now() - started).padStart(5)}ms route=${String(d.routeLength).padStart(3)} ` +
        `fork=${level.metrics.junctionRate.toFixed(2)} loop=${level.metrics.loopRate.toFixed(2)} ` +
        `spread=${String(level.metrics.maizeSpread).padStart(3)} choke=${String(level.metrics.chokepoints).padStart(2)} ` +
        `flags=${json.f.length} traps=${json.t.length} fog=${json.fog ?? '-'} ` +
        `hunter=${json.h ? `${(json.h[0] / 1000).toFixed(0)}s` : '-'} ` +
        `mem=${json.m ? `${(json.m / 1000).toFixed(1)}s` : '∞'} ` +
        `ground=${(() => {
          const sand = json.sf.filter(([, , k]) => k === 1).length
          const snow = json.sf.filter(([, , k]) => k === 2).length
          return sand || snow ? `${sand}s/${snow}w` : '-'
        })()} ` +
        `perfect=${d.perfectSeconds.toFixed(0)}s blindDeaths=${d.blindDeaths}` +
        (d.blindLosses ? ` caught=${d.blindLosses}` : '')
      )
    }
  }

  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, JSON.stringify(levels))

  console.log(report.join('\n'))
  console.log('')
  console.log(`${levels.length} levels accepted, ${totalRejected} candidates rejected`)
  if (rejectionReasons.size > 0) {
    console.log('why candidates were rejected:')
    for (const [reason, count] of [...rejectionReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}x  ${reason}`)
    }
  }
  console.log(`\nwrote ${OUTPUT.replace(process.cwd(), '.')}`)
}

build()
