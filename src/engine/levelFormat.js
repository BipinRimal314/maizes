/**
 * The canonical level codec.
 *
 * There used to be two divergent copies of this — one in utils/serialize.js for
 * shared URLs, one in engine/levelLoader.js for the bundled JSON. Neither had
 * anywhere to put the v2 information-warfare obstacles (liar walls, mimics,
 * memory wipes), so the generator wrote them into the `modifier` slot where
 * nothing could read them. That is why the deception layer never worked.
 *
 * Format v2 entry:
 *   [x, y, wallBits, modifier, flags, gateDir, liarBits]
 *
 *   wallBits  bitmask — top 1, right 2, bottom 4, left 8
 *   modifier  string or null (see engine/obstacles.js for the live set)
 *   flags     bitmask — trap 1, mimic 2, memoryWipe 4
 *   gateDir   'up' | 'down' | 'left' | 'right' | null
 *   liarBits  bitmask of sides whose *visual* is inverted from reality
 *
 * v1 compatibility is free: v1 wrote `trap` as 0/1 in the flags position and
 * TRAP is bit 1, so old entries decode correctly. A missing 7th element is 0.
 */

import { createCell } from './maze'

const FORMAT_VERSION = 2

const WALL = { top: 1, right: 2, bottom: 4, left: 8 }
const FLAG = { trap: 1, mimic: 2, memoryWipe: 4 }
const SIDES = ['top', 'right', 'bottom', 'left']

function packWalls(walls) {
  let bits = 0
  for (const side of SIDES) if (walls[side]) bits |= WALL[side]
  return bits
}

function unpackWalls(bits) {
  return {
    top: !!(bits & WALL.top),
    right: !!(bits & WALL.right),
    bottom: !!(bits & WALL.bottom),
    left: !!(bits & WALL.left),
  }
}

function packFlags(cell) {
  let bits = 0
  if (cell.trap) bits |= FLAG.trap
  if (cell.mimic) bits |= FLAG.mimic
  if (cell.memoryWipe) bits |= FLAG.memoryWipe
  return bits
}

/**
 * Liar walls are stored as "which sides lie", not "what to draw". A lie always
 * means "show the opposite of reality", so one bitmask is enough and the
 * renderer just XORs it against the real walls.
 */
function packLiar(liarWalls) {
  if (!liarWalls) return 0
  let bits = 0
  for (const side of SIDES) if (liarWalls[side]) bits |= WALL[side]
  return bits
}

function unpackLiar(bits) {
  if (!bits) return null
  return {
    top: !!(bits & WALL.top),
    right: !!(bits & WALL.right),
    bottom: !!(bits & WALL.bottom),
    left: !!(bits & WALL.left),
  }
}

/** True walls XOR the lie — what the player is shown. */
function visibleWalls(cell) {
  if (!cell.liarWalls) return cell.walls
  return {
    top: cell.walls.top !== !!cell.liarWalls.top,
    right: cell.walls.right !== !!cell.liarWalls.right,
    bottom: cell.walls.bottom !== !!cell.liarWalls.bottom,
    left: cell.walls.left !== !!cell.liarWalls.left,
  }
}

function isEmptyCell(cell) {
  return (
    packWalls(cell.walls) === 0 &&
    !cell.modifier &&
    packFlags(cell) === 0 &&
    !cell.gate &&
    packLiar(cell.liarWalls) === 0
  )
}

function encodeGrid(grid) {
  const compact = {
    v: FORMAT_VERSION,
    c: grid.cols,
    r: grid.rows,
    s: [grid.start.x, grid.start.y],
    e: [grid.end.x, grid.end.y],
    w: grid.hiddenWord || '',
    d: [],
  }

  for (const cell of grid.cells) {
    if (isEmptyCell(cell)) continue
    const entry = [
      cell.x,
      cell.y,
      packWalls(cell.walls),
      cell.modifier || null,
      packFlags(cell),
      cell.gate ? cell.gate.direction : null,
      packLiar(cell.liarWalls),
    ]
    // trailing zero is implied on decode
    if (entry[6] === 0) entry.pop()
    compact.d.push(entry)
  }

  return compact
}

/**
 * Legacy levels shoved mimics and liar walls into the modifier slot, where they
 * were silently inert. Recover them into the fields that are actually read.
 */
function salvageLegacyModifier(modifier, cell) {
  if (!modifier) return null

  if (Array.isArray(modifier)) {
    // ['liar_wall', { right: false, bottom: false }]
    const [kind, payload] = modifier
    if (kind === 'liar_wall' || kind === 'liarWall') {
      const liar = { top: false, right: false, bottom: false, left: false }
      // the payload named the sides involved in the lie
      for (const side of SIDES) {
        if (payload && Object.prototype.hasOwnProperty.call(payload, side)) {
          liar[side] = true
        }
      }
      cell.liarWalls = liar
      return null
    }
    return null
  }

  if (modifier === 'mimic') {
    cell.mimic = true
    return null
  }
  if (modifier === 'memoryWipe' || modifier === 'memory_wipe') {
    cell.memoryWipe = true
    return null
  }

  return modifier
}

function decodeGrid(compact) {
  const cols = compact.c
  const rows = compact.r
  const version = compact.v || 1

  const cells = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) cells.push(createCell(x, y))
  }

  for (const entry of compact.d) {
    const [x, y, wallBits, modifier, flags, gateDir, liarBits] = entry
    const cell = cells[y * cols + x]
    if (!cell) continue

    cell.walls = unpackWalls(wallBits)

    const resolved = version >= FORMAT_VERSION
      ? modifier || null
      : salvageLegacyModifier(modifier, cell)
    if (resolved) cell.modifier = resolved

    const f = flags || 0
    if (f & FLAG.trap) cell.trap = true
    if (f & FLAG.mimic) cell.mimic = true
    if (f & FLAG.memoryWipe) cell.memoryWipe = true

    if (gateDir) cell.gate = { direction: gateDir, open: true }

    const liar = unpackLiar(liarBits || 0)
    if (liar) cell.liarWalls = liar
  }

  return {
    cols,
    rows,
    cells,
    start: { x: compact.s[0], y: compact.s[1] },
    end: { x: compact.e[0], y: compact.e[1] },
    hiddenWord: compact.w || '',
  }
}

export {
  FORMAT_VERSION,
  WALL,
  FLAG,
  SIDES,
  encodeGrid,
  decodeGrid,
  visibleWalls,
  packWalls,
  unpackWalls,
  packLiar,
  unpackLiar,
  salvageLegacyModifier,
}
