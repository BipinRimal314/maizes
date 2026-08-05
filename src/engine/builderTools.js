/**
 * The editor's palette and the single-cell edit rule.
 *
 * The palette used to be ten motor modifiers — gravity wells, spinners, fart
 * tiles, ice — and could not place a single one of the mechanics the game
 * actually runs on. You could not author a trap, a mimic, a liar wall, a memory
 * wipe or a one-way gate, which is to say you could not build a Mazochist level
 * in the Mazochist level builder. This is that list, rebuilt from
 * engine/obstacles.js.
 */

import {
  setModifier, setStart, setEnd, setTrap, setMimic, setMemoryWipe,
  setGate, clearCell, getCell,
} from './maze'

const TOOLS = [
  { id: 'wall', label: '\u{1F9F1}', name: 'wall', hint: 'drag between cells' },
  { id: 'liar', label: '\u{1F92B}', name: 'liar wall', hint: 'drag — shows the opposite of the truth' },
  { id: 'start', label: '\u{1F7E2}', name: 'start', hint: 'click a cell' },
  { id: 'end', label: '\u{1F3C1}', name: 'exit', hint: 'click a cell' },
]

const OBSTACLES = [
  { id: 'fakeExit', label: '\u{1F3C6}', name: 'flag', kind: 'deceive', hint: 'capture every flag to unlock the exit — each one sends you home' },
  { id: 'mimic', label: '\u{1F480}', name: 'mimic', kind: 'deceive', hint: 'looks like the exit, kills you' },
  { id: 'trap', label: '\u{1F573}\u{FE0F}', name: 'trap', kind: 'hide', hint: 'invisible until it kills you' },
  { id: 'memoryWipe', label: '\u{1F32C}\u{FE0F}', name: 'memory wipe', kind: 'hide', hint: 'erases what you have mapped' },
  { id: 'gateUp', label: '\u{2B06}\u{FE0F}', name: 'gate up', kind: 'commit', hint: 'one-way, closes behind you' },
  { id: 'gateDown', label: '\u{2B07}\u{FE0F}', name: 'gate down', kind: 'commit', hint: 'one-way, closes behind you' },
  { id: 'gateLeft', label: '\u{2B05}\u{FE0F}', name: 'gate left', kind: 'commit', hint: 'one-way, closes behind you' },
  { id: 'gateRight', label: '\u{27A1}\u{FE0F}', name: 'gate right', kind: 'commit', hint: 'one-way, closes behind you' },
  { id: 'eraser', label: '\u{1F9F9}', name: 'erase', kind: 'commit', hint: 'clear obstacles from a cell' },
]

const GATE_DIRECTIONS = {
  gateUp: 'up', gateDown: 'down', gateLeft: 'left', gateRight: 'right',
}

/** Apply a single-cell tool, toggling it off if it is already there. */
function applyCellTool(grid, tool, x, y) {
  const cell = getCell(grid, x, y)
  if (!cell) return grid

  switch (tool) {
    case 'start': return setStart(grid, x, y)
    case 'end': return setEnd(grid, x, y)
    case 'eraser': return clearCell(grid, x, y)
    case 'fakeExit':
      return setModifier(grid, x, y, cell.modifier === 'fakeExit' ? null : 'fakeExit')
    case 'trap': return setTrap(grid, x, y, !cell.trap)
    case 'mimic': return setMimic(grid, x, y, !cell.mimic)
    case 'memoryWipe': return setMemoryWipe(grid, x, y, !cell.memoryWipe)
    default: {
      const direction = GATE_DIRECTIONS[tool]
      if (!direction) return grid
      const same = cell.gate && cell.gate.direction === direction
      return setGate(grid, x, y, same ? null : direction)
    }
  }
}

export { TOOLS, OBSTACLES, GATE_DIRECTIONS, applyCellTool }
