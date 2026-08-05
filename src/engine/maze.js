const GRID_SIZE = 20

/**
 * The canonical cell shape. Every producer of cells goes through here — the
 * builder, the generator, and both halves of the level codec — so a field can
 * never again exist on one path and be missing on another.
 */
function createCell(x, y) {
  return {
    x,
    y,
    walls: { top: false, right: false, bottom: false, left: false },
    modifier: null,
    trap: false,
    gate: null,
    liarWalls: null,    // which sides show the opposite of reality
    mimic: false,       // looks like the exit, kills instead
    memoryWipe: false,  // clears the fog memory trail
  }
}

function createGrid(cols = GRID_SIZE, rows = GRID_SIZE) {
  const cells = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      cells.push(createCell(x, y))
    }
  }
  return {
    cols,
    rows,
    cells,
    start: { x: 0, y: 0 },
    end: { x: cols - 1, y: rows - 1 },
    hiddenWord: '',
  }
}

function getCell(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/** Which side of cell A faces cell B, for orthogonal neighbours only. */
function sideBetween(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 1 && dy === 0) return 'right'
  if (dx === -1 && dy === 0) return 'left'
  if (dx === 0 && dy === 1) return 'bottom'
  if (dx === 0 && dy === -1) return 'top'
  return null
}

/** Replace one cell, returning a new grid. The single write path for edits. */
function updateCell(grid, x, y, patch) {
  const index = y * grid.cols + x
  const cell = grid.cells[index]
  if (!cell) return grid

  const cells = grid.cells.slice()
  cells[index] = { ...cell, ...patch }
  return { ...grid, cells }
}

/**
 * Walls live on both cells that share them, which is what lets the collision
 * code trust the cell under the ball. Any edit has to keep both sides in step.
 */
function toggleWallBetween(grid, x1, y1, x2, y2) {
  const a = getCell(grid, x1, y1)
  const b = getCell(grid, x2, y2)
  if (!a || !b) return grid

  const side = sideBetween(x1, y1, x2, y2)
  if (!side) return grid

  const next = !a.walls[side]
  let out = updateCell(grid, x1, y1, { walls: { ...a.walls, [side]: next } })
  out = updateCell(out, x2, y2, { walls: { ...b.walls, [OPPOSITE[side]]: next } })
  return out
}

/** Toggle the *lie* on a shared edge, mirrored the same way a wall is. */
function toggleLiarBetween(grid, x1, y1, x2, y2) {
  const a = getCell(grid, x1, y1)
  const b = getCell(grid, x2, y2)
  if (!a || !b) return grid

  const side = sideBetween(x1, y1, x2, y2)
  if (!side) return grid

  const blank = { top: false, right: false, bottom: false, left: false }
  const aLiar = { ...blank, ...(a.liarWalls || {}) }
  const bLiar = { ...blank, ...(b.liarWalls || {}) }
  const next = !aLiar[side]

  aLiar[side] = next
  bLiar[OPPOSITE[side]] = next

  const empty = (l) => !l.top && !l.right && !l.bottom && !l.left

  let out = updateCell(grid, x1, y1, { liarWalls: empty(aLiar) ? null : aLiar })
  out = updateCell(out, x2, y2, { liarWalls: empty(bLiar) ? null : bLiar })
  return out
}

function setModifier(grid, x, y, modifier) {
  return updateCell(grid, x, y, { modifier })
}

function setStart(grid, x, y) {
  return { ...grid, start: { x, y } }
}

function setEnd(grid, x, y) {
  return { ...grid, end: { x, y } }
}

function setHiddenWord(grid, word) {
  return { ...grid, hiddenWord: word }
}

// The flag setters take an explicit value so the builder can clear them.
// They only ever set `true` before, which meant nothing placed in the editor
// could be removed again.
function setTrap(grid, x, y, value = true) {
  return updateCell(grid, x, y, { trap: !!value })
}

function setMimic(grid, x, y, value = true) {
  return updateCell(grid, x, y, { mimic: !!value })
}

function setMemoryWipe(grid, x, y, value = true) {
  return updateCell(grid, x, y, { memoryWipe: !!value })
}

function setLiarWalls(grid, x, y, liarWalls) {
  return updateCell(grid, x, y, { liarWalls })
}

function setGate(grid, x, y, direction) {
  return updateCell(grid, x, y, {
    gate: direction ? { direction, open: true } : null,
  })
}

/** Strip every obstacle from a cell, leaving its walls alone. */
function clearCell(grid, x, y) {
  return updateCell(grid, x, y, {
    modifier: null,
    trap: false,
    mimic: false,
    memoryWipe: false,
    gate: null,
    liarWalls: null,
  })
}

export {
  GRID_SIZE,
  OPPOSITE,
  createCell,
  createGrid,
  getCell,
  updateCell,
  sideBetween,
  toggleWallBetween,
  toggleLiarBetween,
  setModifier,
  setStart,
  setEnd,
  setHiddenWord,
  setTrap,
  setGate,
  setLiarWalls,
  setMimic,
  setMemoryWipe,
  clearCell,
}
