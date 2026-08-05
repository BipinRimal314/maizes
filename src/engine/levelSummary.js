/**
 * Summarising a level for the list.
 *
 * Tags describe what a level does to *you*, grouped the same way
 * engine/obstacles.js groups them: HIDE, DECEIVE, COMMIT. The old list showed
 * the emoji of each motor modifier a level contained — a snowflake for ice, a
 * fart cloud — advertising exactly the kind of difficulty the design document
 * had already decided to delete.
 */

function countObstacles(grid) {
  const counts = { traps: 0, fakeExits: 0, mimics: 0, liars: 0, wipes: 0, gates: 0 }

  for (const cell of grid.cells) {
    if (cell.trap) counts.traps++
    if (cell.modifier === 'fakeExit') counts.fakeExits++
    if (cell.mimic) counts.mimics++
    if (cell.liarWalls) counts.liars++
    if (cell.memoryWipe) counts.wipes++
    if (cell.gate) counts.gates++
  }

  return counts
}

function levelTags(level) {
  const c = countObstacles(level.grid)
  const tags = []

  if (level.fogRadius) tags.push({ kind: 'hide', text: 'fog' })
  if (c.traps) tags.push({ kind: 'hide', text: `${c.traps} hidden` })
  if (c.wipes) tags.push({ kind: 'hide', text: 'memory wipe' })
  if (c.fakeExits) tags.push({ kind: 'deceive', text: `${c.fakeExits} false exits` })
  if (c.mimics) tags.push({ kind: 'deceive', text: `${c.mimics} mimic${c.mimics > 1 ? 's' : ''}` })
  if (c.liars) tags.push({ kind: 'deceive', text: 'liar walls' })
  if (c.gates) tags.push({ kind: 'commit', text: `${c.gates} one-way` })
  if (level.era === 'punishing' || level.era === 'sadistic') {
    tags.push({ kind: 'commit', text: 'apparition' })
  }

  return tags
}

function groupIntoChapters(allLevels) {
  const chapters = []
  let current = null

  allLevels.forEach((level, index) => {
    if (level.chapterNumber !== current) {
      chapters.push({ number: level.chapterNumber, name: level.chapter, levels: [] })
      current = level.chapterNumber
    }
    chapters[chapters.length - 1].levels.push({ ...level, index })
  })

  return chapters
}

export { countObstacles, levelTags, groupIntoChapters }
