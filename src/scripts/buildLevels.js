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
 * The previous version had ten chapters of a hundred levels in its design
 * document and shipped twenty-five that no one had played through. Twenty
 * levels that are all verified beatable is a better game than a hundred that
 * are not.
 */
const CHAPTERS = [
  {
    name: 'Warm Up',
    blurb: 'A maze, and one flag to fetch. Enjoy it.',
    tier: 'gentle',
    count: 5,
    seed: 1000,
  },
  {
    name: 'Two Trips',
    blurb: 'Two flags now, and the floor is not entirely trustworthy.',
    tier: 'brisk',
    count: 5,
    seed: 2000,
  },
  {
    name: 'The Fog',
    blurb: 'You can only see what is near you. You will have to remember the rest.',
    tier: 'blind',
    count: 5,
    seed: 3000,
  },
  {
    name: 'No Mercy',
    blurb: 'Bigger, darker, and it is hiding more from you.',
    tier: 'cruel',
    count: 5,
    seed: 4000,
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
      levels.push(json)

      const d = level.difficulty
      report.push(
        `${name.padEnd(14)} seed=${String(level.seed).padEnd(7)} tries=${String(level.attempts).padStart(3)} ` +
        `${String(Date.now() - started).padStart(4)}ms  route=${String(d.routeLength).padStart(3)} ` +
        `flags=${json.f.length} traps=${json.t.length} fog=${json.fog ?? '-'} ` +
        `perfect=${d.perfectSeconds.toFixed(0)}s blindDeaths=${d.blindDeaths}`
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
