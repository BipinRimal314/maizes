import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fromJSON } from './generate.js'
import { judge } from './oracle.js'
import { distancesFrom } from './analysis.js'
import { key } from '../engine/grid.js'
import { BALL_TOP_SPEED } from '../engine/hunter.js'
import { slowestSurface } from '../engine/physics.js'
import { beatsAfterLevel, CHAPTER_BEATS } from '../ui/story.js'
const levels = JSON.parse(readFileSync(new URL('../../public/campaign-v2.json', import.meta.url)))

describe('the hundred-field campaign', () => {
  it('builds toward the largest final field, with lessons and quiet crossings', () => {
    expect(levels).toHaveLength(100)
    expect(new Set(levels.map(l => l.name)).size).toBe(100)
    expect(levels[6].teaches).toBe('axe')
    expect(levels[29].teaches).toBe('hunter')
    expect(levels[70].teaches).toBe('ward')
    expect(levels.at(-1).c).toBe(38)
    expect(levels.at(-1).r).toBe(21)
    expect(levels.slice(0, -1).every(l => l.c * l.r < 38 * 21)).toBe(true)
    expect(levels.slice(30).filter(l => l.relief && !l.h).length).toBeGreaterThan(5)
    for (const l of levels.filter(l => l.h)) {
      expect(l.h[1]).toBeLessThan(BALL_TOP_SPEED * slowestSurface(fromJSON(l)) * .45)
      expect(l.h[0]).toBeGreaterThanOrEqual(18000)
    }
  })

  it('keeps every story chapter and delivers the finale only at field 100', () => {
    for (const name of Object.keys(CHAPTER_BEATS)) expect(levels.some(l => l.chapter === name)).toBe(true)
    for (let i = 0; i < 99; i++) expect(beatsAfterLevel(levels, i).some(b => b.id === 'bargain')).toBe(false)
    expect(beatsAfterLevel(levels, 99).map(b => b.id)).toContain('bargain')
  })

  for (const level of levels) {
    it(`${level.name} is solvable through the real axe, movement, and hunter rules`, { timeout: 30000 }, () => {
      const verdict = judge(fromJSON(level))
      expect(verdict.problems).toEqual([])
      expect(verdict.ok).toBe(true)
    })
  }

  it('requires the axe for gated timber and keeps shortcut routes optional', () => {
    for (const l of levels.filter(l => l.axe)) {
      const grid = fromJSON(l)
      const blocked = new Set([...grid.wood, ...grid.traps].map(p => key(p.x, p.y)))
      const before = distancesFrom(grid, grid.start, blocked)
      expect(before.has(key(grid.axe.x, grid.axe.y)), l.name).toBe(true)
      for (const p of [...grid.flags, grid.end]) expect(before.has(key(p.x, p.y)), l.name).toBe(grid.woodMode === 'optional')
    }
  })
})

it('gives the campaign distinct route choices, discoveries, and a staged finale', () => {
  expect(levels.filter(l => l.pickupMode === 'continuous').length).toBeGreaterThan(75)
  expect(levels.filter(l => l.pickupMode === 'return').length).toBeGreaterThan(5)
  const shortcuts = levels.filter(l => l.woodMode === 'optional')
  expect(shortcuts.length).toBeGreaterThan(10)
  for (const l of shortcuts) expect(l.shortcutSaving).toBeGreaterThanOrEqual(5)
  const memories = levels.flatMap(l => l.discoveries ?? [])
  expect(memories.length).toBeGreaterThan(20)
  expect(new Set(memories.map(p => p.text)).size).toBe(memories.length)
  for (const l of levels) {
    const grid = fromJSON(l)
    const safe = distancesFrom(grid, grid.start, new Set(grid.traps.map(p => key(p.x, p.y))))
    for (const p of [...grid.discoveries, ...grid.shelters]) expect(safe.has(key(p.x, p.y)), l.name).toBe(true)
  }
  const final = levels.at(-1)
  expect(final.discoveries.filter(p => p.required)).toHaveLength(3)
  expect(final.axe).toBeTruthy()
  expect(final.charm).toBeTruthy()
  expect(final.shelters.length).toBeGreaterThan(0)
  expect(final.hunterBehavior).toBe('search')
})
