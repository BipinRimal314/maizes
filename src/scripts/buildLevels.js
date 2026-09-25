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
 * `blurb` says where the farmer is and how he is holding up. It never says what
 * is new — nine of these used to announce their own mechanic ("something in it
 * still looking for me"), which hands the player the lesson before they have
 * met it. Warm Up has none at all: four levels of one ear on an open board
 * explain themselves, and a caption there is noise.
 *
 * `teaches` names the mechanic arriving in this chapter, and applies an extra
 * constraint to its *first* level only — see teaching.js. Every level after it
 * may be as quiet as it likes.
 *
 * `intents` gives every level its own question to ask, so a chapter is a set of
 * different problems built from the same mechanics rather than the same problem
 * generated from different seeds.
 *
 * Teaching chapters retain their original first encounter. Other transitions
 * may change shape immediately: repeating a shape at every chapter boundary
 * made the journey feel longer without teaching anything new.
 *
 * `terrain` is presentation only — it repaints the board so the journey looks
 * like it is going somewhere, and changes nothing the oracle judges.
 *
 * `count` preserves the original seed sequence; `keep` selects twenty fields
 * from that thirty-field pool. Every original chapter finale stays, preserving
 * existing speedrun targets and the chapter story beats. No save is deleted.
 */
const CHAPTERS = [
  {
    name: 'Warm Up',
    keep: [0,2],
    intents: ['artery', 'warren', 'circuit'],
    terrain: 'field',
    blurb: null,
    tier: 'gentle',
    count: 3,
    seed: 1000,
  },
  {
    name: 'Two Trips',
    keep: [0,1],
    teaches: 'traps',
    intents: ['circuit', 'bottleneck'],
    terrain: 'track',
    blurb: 'Past the gate, where my land stops being mine.',
    tier: 'brisk',
    count: 2,
    seed: 2000,
  },
  // Fog arrives at level 6. It is the idea the game is actually about, and
  // anything later spends the campaign before getting to it.
  {
    name: 'First Light',
    keep: [0,2],
    teaches: 'fog',
    intents: ['bottleneck', 'gauntlet', 'artery'],
    terrain: 'dusk',
    blurb: 'The sun went down somewhere behind me.',
    tier: 'misty',
    count: 3,
    seed: 2500,
  },
  {
    name: 'The Fog',
    keep: [1],
    intents: ['artery', 'circuit'],
    terrain: 'woods',
    blurb: 'Low ground, and the air gone white with it.',
    tier: 'blind',
    count: 2,
    seed: 3000,
  },
  // The hunter arrives at level 11 the same way fog arrived at level 6: same
  // size, same flags, same traps, same fog radius as the chapter before it. One
  // new variable, so a player who suddenly struggles knows what changed.
  {
    name: 'Company',
    keep: [0,2],
    teaches: 'hunter',
    intents: ['circuit', 'warren', 'bottleneck'],
    terrain: 'night',
    blurb: 'The long field under the ridge.',
    tier: 'hunted',
    count: 3,
    seed: 3500,
  },
  {
    name: 'No Mercy',
    keep: [1],
    intents: ['bottleneck', 'gauntlet'],
    terrain: 'ridge',
    blurb: 'Up on the ridge itself. Nothing grows here.',
    tier: 'cruel',
    count: 2,
    seed: 4000,
  },
  // Ground that is not flat earth. Sand first on its own, then snow alongside
  // it — one new thing per chapter, and neither ever leaves again.
  {
    name: 'The Dry Reach',
    keep: [0,1],
    teaches: 'sand',
    intents: ['gauntlet', 'artery'],
    terrain: 'desert',
    blurb: 'Flat country. It goes further than it looks.',
    tier: 'dry',
    count: 2,
    seed: 6000,
  },
  {
    name: 'The White Mile',
    keep: [0,1],
    teaches: 'snow',
    intents: ['artery', 'detour'],
    terrain: 'snow',
    blurb: 'Higher, and colder than it has any right to be.',
    tier: 'white',
    count: 2,
    seed: 6500,
  },
  // Memory goes by the same rule that governed fog and the hunter: identical
  // to the chapter before it in every other respect.
  {
    name: 'Forgetting',
    keep: [0,1],
    teaches: 'memory',
    intents: ['detour', 'warren'],
    terrain: 'marsh',
    blurb: 'Marsh, and two days now without sleep.',
    tier: 'fading',
    count: 2,
    seed: 4500,
  },
  // Memory keeps tightening: 7.0s -> 4.0s -> 2.5s. The forest is the last
  // strange place before the fires, and the only one lit from the walls in.
  {
    name: 'The Lit Wood',
    keep: [1],
    intents: ['warren', 'bottleneck'],
    terrain: 'enchanted',
    blurb: 'The wood I have never once walked into.',
    tier: 'enchanted',
    count: 2,
    seed: 5500,
  },
  {
    name: 'Nothing Stays',
    keep: [2],
    intents: ['bottleneck', 'detour', 'gauntlet'],
    terrain: 'ember',
    blurb: 'Smoke on the wind. Their fires, close.',
    tier: 'vanishing',
    count: 3,
    seed: 5000,
  },
  // And then the ground opens out. Nothing new is switched on in these two
  // chapters — size is the variable, and it is the one a player feels most.
  {
    name: 'The Long Dark',
    keep: [1],
    intents: ['gauntlet', 'detour'],
    terrain: 'night',
    blurb: 'Past their fires. It was not the end of it.',
    tier: 'vast',
    count: 2,
    seed: 7000,
  },
  {
    name: 'The Fires',
    keep: [1],
    intents: ['detour', 'artery'],
    terrain: 'ember',
    blurb: 'More fires. The real ones, this time.',
    tier: 'endless',
    count: 2,
    seed: 7500,
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
        // only the level a mechanic arrives on has to demonstrate it
        teaches: i === 0 ? chapter.teaches ?? null : null,
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
      json.blurb = chapter.blurb ?? null
      json.terrain = chapter.terrain
      // Generate the original candidates to preserve names, geometry, and saved times.
      // Only the selected crossings belong to the shorter story campaign.
      if (!chapter.keep.includes(i)) continue
      levels.push(json)

      const d = level.difficulty
      report.push(
        `${name.padEnd(15)} ${String(level.intent).padEnd(10)} tries=${String(level.attempts).padStart(4)} ` +
        `${String(Date.now() - started).padStart(5)}ms route=${String(d.routeLength).padStart(3)} ` +
        `${level.teaches ? `teaches=${level.teaches} ` : ''}` +
        `fork=${level.metrics.junctionRate.toFixed(2)} loop=${level.metrics.loopRate.toFixed(2)} ` +
        `spread=${String(level.metrics.maizeSpread).padStart(3)} choke=${String(level.metrics.chokepoints).padStart(2)} ` +
        `flags=${json.f.length} traps=${json.t.length} fog=${json.fog ?? '-'} ` +
        `hunter=${json.h ? `${(json.h[0] / 1000).toFixed(0)}s` : '-'} ` +
        `mem=${json.m ? `${(json.m / 1000).toFixed(1)}s` : '∞'} ` +
        `${json.c}x${json.r} ` +
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
