/** The new campaign has separate identities so old times never become new pars. */
export const CAMPAIGN_ID = 'journey-v2'
export const REGIONS = [
  ['Warm Up', 6, 'field'], ['Two Trips', 7, 'track'],
  ['First Light', 8, 'dusk'], ['The Fog', 8, 'woods'],
  ['Company', 8, 'night'], ['No Mercy', 8, 'ridge'],
  ['The Dry Reach', 8, 'desert'], ['The White Mile', 8, 'snow'],
  ['Forgetting', 8, 'marsh'], ['The Lit Wood', 8, 'enchanted'],
  ['Nothing Stays', 8, 'ember'], ['The Long Dark', 8, 'night'],
  ['The Fires', 7, 'ember'],
]

export function campaignSpec(number, local, count) {
  const milestone = local === count - 1
  const relief = number > 15 && !milestone && local === 3
  const shortcut = number >= 22 && !relief && [1, 5].includes(local)
  const returnTrips = number >= 10 && !relief && local === 2
  const axe = number === 7 || (number > 7 && !relief && [0, 1, 4, 6].includes(local)) || number === 100
  const ward = number >= 71 && !relief && (local % 2 === 0 || milestone)
  let cols = number < 7 ? 7 + Math.floor(number / 2) : number < 30 ? 12 : number < 54 ? 16 : number < 78 ? 18 : number < 94 ? 22 : 26
  let rows = number < 7 ? 5 + Math.floor(number / 3) : number < 30 ? 8 : number < 54 ? 10 : number < 78 ? 11 : number < 94 ? 13 : 15
  if (relief) { cols -= 2; rows -= 1 }
  if (milestone && number > 20) { cols += 2; rows += 1 }
  if (number === 100) { cols = 38; rows = 21 }
  const hunter = number >= 30 && !relief
  const tier = {
    cols, rows,
    loops: shortcut ? .22 : [0.05, 0.1, 0.16, 0.2][local % 4],
    flags: number < 7 ? 1 : number < 38 ? 2 : number < 86 ? 3 : number < 100 ? 4 : 5,
    traps: relief || number < 9 ? 0 : number < 30 ? 1 : number < 62 ? 2 : number < 94 ? 3 : 5,
    fog: number < 14 || relief ? null : number < 30 ? 4.8 : number < 62 ? 4 : 3.4,
    sand: number >= 46 && !relief ? 2 : 0,
    snow: number >= 54 && !relief && local % 3 !== 1 ? 2 : 0,
    memory: number >= 62 && !relief ? 10000 : null,
    patience: number === 100 ? 180 : number >= 86 ? 110 : 80,
  }
  const lesson = ({ 7: 'axe', 9: 'traps', 14: 'fog', 30: 'hunter', 46: 'sand', 54: 'snow', 62: 'memory', 71: 'ward' })[number] ?? null
  // The first ward is guaranteed even if the region's normal rhythm differs.
  return { tier, axe: axe && !shortcut, shortcut, returnTrips, ward: ward || number === 71, hunter, milestone, relief, lesson,
    challenge: number === 100 ? 'Her last markers' : relief ? 'A quiet discovery' : shortcut ? 'Cut a shortcut' : returnTrips ? 'Bring it home' : axe ? 'Open the way' : hunter && local % 2 === 0 ? 'Break their sight' : hunter ? 'Keep moving' : number < 7 ? 'Follow her trail' : 'Plan your harvest' }
}
