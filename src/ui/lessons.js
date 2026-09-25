const LESSONS = {
  finale: ['Her last markers', 'Find the axe, open the timber, and follow Maizy’s three pink trail markers. Gather the corn to open the last gate. Use the brush and ward if the ghost finds you.'],
  axe: ['Find the axe', 'The timber blocks every way onward. Find the axe, then hold toward a wooden barrier to chop it. Stone walls cannot be cut.'],
  ward: ['A little protection', 'Collect the glowing ward. If the ghost touches you, it breaks the ward and disappears for ten seconds. Each ward works once.'],
  traps: ['Watch the ground', 'Cracked earth and loose soil mark a trap. Walk around it. A fall returns you to the start; on Difficult, it also drops your maize.'],
  hunter: ['Break its line of sight', 'The ghost sees along open corridors. Turn a corner and it searches your last known position. Stand still in green brush to hide, but do not let it touch you.'],
  shortcut: ['A choice of routes', 'The long route is open. Find the axe to cut a shorter one through the timber. Chopping draws the ghost toward the sound.'],
  return: ['Bring it home', 'In this field, each ear takes you back to the entrance. Plan a separate trip for each. In other fields, you keep walking after a pickup.'],
}
export function lessonFor(level) {
  const kind = level.grid.discoveries?.some(p => p.required) ? 'finale'
    : LESSONS[level.teaches] ? level.teaches
      : level.grid.woodMode === 'optional' ? 'shortcut'
        : level.grid.pickupMode === 'return' ? 'return' : null
  if (!kind) return null
  const [title, text] = LESSONS[kind]
  return { id: `revamp3-lesson-${kind}`, title, text }
}
