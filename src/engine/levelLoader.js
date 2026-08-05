/**
 * Load curated levels — hand-crafted basics + ML-generated curated set.
 *
 * Decoding goes through the shared codec in levelFormat.js. This file used to
 * carry its own copy that silently dropped mimics, liar walls and memory-wipe
 * zones on the floor.
 */

import { LEVELS as HAND_CRAFTED } from './levels'
import { decodeGrid } from './levelFormat'

const BASE_URL = import.meta.env?.BASE_URL || '/'

/** "The Fog 11" -> "The Fog". Levels are named "<chapter> <n>". */
function chapterNameOf(levelName) {
  const parts = levelName.trim().split(' ')
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join(' ')
  }
  return levelName
}

async function loadAllLevels() {
  // chapter 1: 3 hand-crafted intro levels (just enough to learn)
  const intro = HAND_CRAFTED.slice(0, 3).map((l) => ({
    ...l,
    chapter: 'The Basics',
    chapterNumber: 1,
    era: 'learning',
    fogRadius: null,
    deathMode: 'progress',
    apparition: false,
  }))

  // chapters 2+: curated ML levels
  const curated = []
  try {
    const resp = await fetch(`${BASE_URL}levels/curated.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()

    let currentChapter = null
    let chapterNum = 1

    for (const level of data) {
      const chName = chapterNameOf(level.name)
      if (chName !== currentChapter) {
        chapterNum++
        currentChapter = chName
      }

      curated.push({
        name: level.name,
        description: level.description,
        chapter: currentChapter,
        chapterNumber: chapterNum,
        grid: decodeGrid(level.maze),
        era: level.era || 'learning',
        fogRadius: level.fog_radius ?? null,
        deathMode: level.death_mode || 'progress',
        apparition: level.apparition === true,
      })
    }
  } catch (e) {
    console.warn('Could not load curated levels:', e)
  }

  return [...intro, ...curated]
}

export { loadAllLevels, chapterNameOf }
