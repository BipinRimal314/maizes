/**
 * Small display helpers shared by the HUD and the result card.
 *
 * These live outside the component files so those files export only
 * components — otherwise React Fast Refresh gives up on the whole module and
 * every edit becomes a full reload.
 */

function formatClock(ms) {
  const total = Math.floor(ms / 1000)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const GRADES = [
  { min: 90, grade: 'S', label: 'Absolute legend.' },
  { min: 75, grade: 'A', label: 'Barely bleeding.' },
  { min: 60, grade: 'B', label: 'Respectable suffering.' },
  { min: 40, grade: 'C', label: 'Average agony.' },
  { min: 20, grade: 'D', label: 'Concerning performance.' },
  { min: -Infinity, grade: 'E-', label: 'Legendary suffering.' },
]

const GRADE_BACKGROUNDS = {
  S: 'var(--tertiary-container)',
  A: 'var(--secondary-container)',
  B: 'var(--secondary-container)',
  C: 'var(--surface-container-high)',
  D: 'var(--primary-container)',
  'E-': 'var(--error-container)',
}

/**
 * Deaths cost six times what a second costs. That ratio is the thesis: this
 * grades how well you worked the maze out, not how fast you can steer.
 */
function getGrade(deaths, seconds) {
  const score = Math.max(0, 100 - deaths * 3 - seconds * 0.5)
  return GRADES.find((g) => score >= g.min)
}

/** What the maze is doing to you right now, worst thing first. */
function threatPills(hud) {
  const pills = []

  if (hud.fakeExitsTotal > 0) {
    pills.push({
      key: 'exits',
      className: hud.exitUnlocked ? 'pill pill--unlocked' : 'pill',
      text: hud.exitUnlocked
        ? '\u{2705} exit unlocked'
        : `\u{1F512} ${hud.fakeExitsFound}/${hud.fakeExitsTotal} false exits found`,
    })
  }

  if (hud.corruptionActive) {
    pills.push({ key: 'void', className: 'pill pill--danger', text: '\u{1F525} the void is spreading' })
  }

  if (hud.stalkerEnabled) {
    pills.push({
      key: 'stalker',
      className: hud.stalkerActive ? 'pill pill--danger' : 'pill pill--warn',
      text: hud.stalkerActive
        ? '\u{1F47B} the apparition is hunting'
        : '\u{1F440} the apparition is watching',
    })
  }

  if (hud.fogRadius !== null && hud.fogRadius !== undefined) {
    pills.push({ key: 'fog', className: 'pill', text: '\u{1F32B}\u{FE0F} fog' })
  }

  return pills
}

export { formatClock, getGrade, threatPills, GRADES, GRADE_BACKGROUNDS }
