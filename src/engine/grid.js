/**
 * The maze.
 *
 * A grid is walls plus six kinds of contents, and nothing else:
 *
 *   flags   you must capture every one to unlock the exit
 *   traps   invisible; stepping on one sends you back to the start
 *   fog     a radius, or null
 *   memory  ms a walked cell stays remembered, or null for forever
 *   hunter  `{ spawnMs, speed }`, or null; see hunter.js
 *   surface a per-cell byte: ordinary ground, sun-baked flat, or deep snow.
 *           Unlike everything above it, this one changes the physics — see
 *           SURFACES in physics.js.
 *
 * That is the whole vocabulary. The previous version had nine mechanics
 * interacting with three death modes and three difficulty eras, and almost
 * every bug lived in that matrix rather than in any single mechanic: fog forced
 * the backtracking the apparition punished, traps could seal the only route to
 * a flag, capturing a flag counted as a death. A small vocabulary is not a
 * lesser game, it is one whose failure modes can be enumerated.
 *
 * Walls are a flat Uint8Array of bitmasks, mirrored across shared edges so the
 * cell under the ball always carries every wall that can stop it. The collision
 * code depends on that invariant, so `setWall` is the only way to change one.
 */

const TOP = 1
const RIGHT = 2
const BOTTOM = 4
const LEFT = 8
const ALL = TOP | RIGHT | BOTTOM | LEFT

/** Index-aligned with the bit values above. */
const DIRECTIONS = [
  { bit: TOP, dx: 0, dy: -1, opposite: BOTTOM, name: 'top' },
  { bit: RIGHT, dx: 1, dy: 0, opposite: LEFT, name: 'right' },
  { bit: BOTTOM, dx: 0, dy: 1, opposite: TOP, name: 'bottom' },
  { bit: LEFT, dx: -1, dy: 0, opposite: RIGHT, name: 'left' },
]

function createGrid(cols, rows) {
  return {
    cols,
    rows,
    walls: new Uint8Array(cols * rows).fill(ALL),
    flags: [],           // [{x, y}]
    traps: [],           // [{x, y}]
    start: { x: 0, y: 0 },
    end: { x: cols - 1, y: rows - 1 },
    fog: null,
    memory: null,
    hunter: null,
    // parallel to `walls`, one byte per cell: 0 ordinary, 1 sand, 2 snow
    surface: new Uint8Array(cols * rows),
  }
}

function inBounds(grid, x, y) {
  return x >= 0 && x < grid.cols && y >= 0 && y < grid.rows
}

function index(grid, x, y) {
  return y * grid.cols + x
}

function wallsAt(grid, x, y) {
  if (!inBounds(grid, x, y)) return ALL
  return grid.walls[index(grid, x, y)]
}

function hasWall(grid, x, y, bit) {
  return (wallsAt(grid, x, y) & bit) !== 0
}

/**
 * Raise or drop a wall on both cells that share it. Nothing else may write to
 * `grid.walls`: if the two sides ever disagree, collision detection silently
 * lets the ball through from one direction only.
 */
function setWall(grid, x, y, direction, present) {
  if (!inBounds(grid, x, y)) return

  const nx = x + direction.dx
  const ny = y + direction.dy

  if (present) grid.walls[index(grid, x, y)] |= direction.bit
  else grid.walls[index(grid, x, y)] &= ~direction.bit

  if (!inBounds(grid, nx, ny)) return

  if (present) grid.walls[index(grid, nx, ny)] |= direction.opposite
  else grid.walls[index(grid, nx, ny)] &= ~direction.opposite
}

/** Can the ball travel from (x, y) through `direction`? */
function isOpen(grid, x, y, direction) {
  if (!inBounds(grid, x, y)) return false
  const nx = x + direction.dx
  const ny = y + direction.dy
  if (!inBounds(grid, nx, ny)) return false
  if (hasWall(grid, x, y, direction.bit)) return false
  // the mirror should agree, but never trust one side alone
  if (hasWall(grid, nx, ny, direction.opposite)) return false
  return true
}

function neighbours(grid, x, y) {
  const out = []
  for (const direction of DIRECTIONS) {
    if (isOpen(grid, x, y, direction)) {
      out.push({ x: x + direction.dx, y: y + direction.dy })
    }
  }
  return out
}

const key = (x, y) => `${x},${y}`

const GROUND = 0
const SAND = 1
const SNOW = 2

/** The ground under a cell. Out of bounds reads as ordinary. */
function surfaceAt(grid, x, y) {
  if (!grid.surface || !inBounds(grid, x, y)) return GROUND
  return grid.surface[index(grid, x, y)]
}

function setSurface(grid, x, y, kind) {
  if (!inBounds(grid, x, y)) return
  grid.surface[index(grid, x, y)] = kind
}

function hasFlag(grid, x, y) {
  return grid.flags.some((f) => f.x === x && f.y === y)
}

function hasTrap(grid, x, y) {
  return grid.traps.some((t) => t.x === x && t.y === y)
}

/** Traps are looked up every simulation step; a Set beats scanning the array. */
function trapSet(grid) {
  return new Set(grid.traps.map((t) => key(t.x, t.y)))
}

function flagSet(grid) {
  return new Set(grid.flags.map((f) => key(f.x, f.y)))
}

function cloneGrid(grid) {
  return {
    cols: grid.cols,
    rows: grid.rows,
    walls: grid.walls.slice(),
    flags: grid.flags.map((f) => ({ ...f })),
    traps: grid.traps.map((t) => ({ ...t })),
    start: { ...grid.start },
    end: { ...grid.end },
    fog: grid.fog,
    memory: grid.memory,
    hunter: grid.hunter ? { ...grid.hunter } : null,
    surface: grid.surface.slice(),
  }
}

export {
  TOP, RIGHT, BOTTOM, LEFT, ALL,
  GROUND, SAND, SNOW,
  surfaceAt, setSurface,
  DIRECTIONS,
  createGrid,
  cloneGrid,
  inBounds,
  index,
  wallsAt,
  hasWall,
  setWall,
  isOpen,
  neighbours,
  key,
  hasFlag,
  hasTrap,
  trapSet,
  flagSet,
}
