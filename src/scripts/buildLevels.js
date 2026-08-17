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
 * The campaign. Each chapter teaches one thing and then stops.
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
    terrain: 'field',
    blurb: 'A maze, and one flag to fetch. Enjoy it.',
    tier: 'gentle',
    count: 4,
    seed: 1000,
  },
  {
    name: 'Two Trips',
    terrain: 'track',
    blurb: 'Two flags now, and the floor is not entirely trustworthy.',
    tier: 'brisk',
    count: 3,
    seed: 2000,
  },
  // Fog arrives at level 8. It is the idea the game is actually about, and
  // waiting until level 11 spent half the campaign before getting to it.
  {
    name: 'First Light',
    terrain: 'dusk',
    blurb: 'Same size, same traps. You just cannot see it any more.',
    tier: 'misty',
    count: 4,
    seed: 2500,
  },
  {
    name: 'The Fog',
    terrain: 'woods',
    blurb: 'Closer in now. You will have to remember what you walked through.',
    tier: 'blind',
    count: 4,
    seed: 3000,
  },
  // The hunter arrives at level 16 the same way fog arrived at level 8: same
  // size, same flags, same traps, same fog radius as the chapter before it. One
  // new variable, so a player who suddenly struggles knows what changed.
  {
    name: 'Company',
    terrain: 'night',
    blurb: 'Same maze as before. You are just not alone in it any more.',
    tier: 'hunted',
    count: 4,
    seed: 3500,
  },
  {
    name: 'No Mercy',
    terrain: 'ridge',
    blurb: 'Bigger, darker, faster, and still looking for you.',
    tier: 'cruel',
    count: 5,
    seed: 4000,
  },
  // Memory goes at level 25, by the same rule that governed fog and the
  // hunter: identical to the chapter before it in every other respect.
  {
    name: 'Forgetting',
    terrain: 'marsh',
    blurb: 'You will still walk it. You just will not keep it.',
    tier: 'fading',
    count: 3,
    seed: 4500,
  },
  {
    name: 'Nothing Stays',
    terrain: 'ember',
    blurb: 'It closes up behind you almost as fast as you open it.',
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
    for (let i = 0; i < chapter.count; i++) {
      const name = `${chapter.name} ${i + 1}`
      const seed = chapter.seed + i * 101
      const started = Date.now()
      const level = generateLevel(chapter.tier, seed)

      totalRejected += level.rejected.length
      for (const rejection of level.rejected) {
        for (const problem of rejection.problems) {
          const kind = problem.replace(/-?\d+/g, 'N')
          rejectionReasons.set(kind, (rejectionReasons.get(kind) || 0) + 1)
        }
      }

      if (!level.grid) {
        throw new Error(`could not generate "${name}" after ${level.attempts} attempts`)
      }

      const json = toJSON(level, name)
      json.chapter = chapter.name
      json.blurb = chapter.blurb
      json.terrain = chapter.terrain
      levels.push(json)

      const d = level.difficulty
      report.push(
        `${name.padEnd(14)} seed=${String(level.seed).padEnd(7)} tries=${String(level.attempts).padStart(3)} ` +
        `${String(Date.now() - started).padStart(4)}ms  route=${String(d.routeLength).padStart(3)} ` +
        `flags=${json.f.length} traps=${json.t.length} fog=${json.fog ?? '-'} ` +
        `hunter=${json.h ? `${(json.h[0] / 1000).toFixed(0)}s` : '-'} ` +
        `mem=${json.m ? `${(json.m / 1000).toFixed(1)}s` : '∞'} ` +
        `perfect=${d.perfectSeconds.toFixed(0)}s blindDeaths=${d.blindDeaths}` +
        (d.blindCaught ? ` caught=${d.blindCaught}` : '')
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
