/**
 * The hand-crafted opening chapter.
 *
 * These three levels are the entire tutorial, and they now teach the game the
 * design document describes rather than the one that shipped. The old third
 * level was "Black Ice" — slippery tiles, no brakes — which meant the third
 * thing a new player ever learned was a motor-control gimmick that DESIGN.md
 * had already marked for deletion. Old levels 4 through 10 taught reverse
 * controls, fart tiles, spinners and teleporters; none of them were ever
 * loaded (`loadAllLevels` slices the first three) and all of them were built
 * on retired modifiers, so they are gone.
 *
 * The lesson order is deliberate:
 *   1. the maze is a maze
 *   2. the maze is longer than it looks
 *   3. the maze lies to you
 *
 * Level 3 introduces deception in its cheapest form. The liar wall shows a
 * barrier that is not there, so probing it costs a moment and teaches "test
 * what you see". The false exits then cost a trip back to the start. Nothing
 * here can kill you — that starts in chapter two.
 */

import {
  createGrid, toggleWallBetween, setModifier, setStart, setEnd,
  setHiddenWord, setLiarWalls,
} from './maze'

function buildLevel({ size, start, end, walls = [], modifiers = [], liars = [], word }) {
  let grid = createGrid(size, size)
  grid = setStart(grid, start[0], start[1])
  grid = setEnd(grid, end[0], end[1])
  if (word) grid = setHiddenWord(grid, word)

  for (const [x1, y1, x2, y2] of walls) {
    grid = toggleWallBetween(grid, x1, y1, x2, y2)
  }
  for (const [x, y, mod] of modifiers) {
    grid = setModifier(grid, x, y, mod)
  }
  for (const [x, y, sides] of liars) {
    grid = setLiarWalls(grid, x, y, {
      top: !!sides.top, right: !!sides.right, bottom: !!sides.bottom, left: !!sides.left,
    })
  }

  return grid
}

const LEVELS = [
  {
    name: 'Baby Steps',
    description: 'Just walls. You got this.',
    grid: buildLevel({
      size: 8,
      start: [0, 0],
      end: [7, 7],
      walls: [
        [0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 2, 1],
        [0, 1, 0, 2], [1, 1, 1, 2], [3, 0, 3, 1],
        [4, 1, 4, 2], [5, 1, 5, 2], [5, 2, 6, 2],
        [2, 3, 3, 3], [3, 3, 3, 4], [1, 4, 2, 4],
        [5, 3, 5, 4], [6, 4, 7, 4], [6, 4, 6, 5],
        [3, 5, 4, 5], [4, 5, 4, 6], [1, 6, 1, 7],
        [2, 6, 3, 6], [5, 6, 5, 7], [6, 6, 7, 6],
      ],
      word: 'HELLO',
    }),
  },

  {
    name: 'The Corridor',
    description: 'Longer path. Still just walls.',
    grid: buildLevel({
      size: 10,
      start: [0, 0],
      end: [9, 9],
      walls: [
        [1, 0, 1, 1], [1, 1, 1, 2], [1, 2, 1, 3],
        [0, 3, 1, 3], [2, 1, 3, 1], [3, 1, 3, 2],
        [3, 2, 3, 3], [3, 3, 4, 3], [5, 0, 5, 1],
        [5, 1, 5, 2], [5, 2, 6, 2], [7, 0, 7, 1],
        [7, 1, 7, 2], [7, 2, 7, 3], [8, 3, 8, 4],
        [6, 4, 7, 4], [5, 4, 5, 5], [4, 5, 4, 6],
        [3, 5, 3, 6], [2, 5, 2, 6], [2, 6, 2, 7],
        [1, 7, 1, 8], [3, 7, 3, 8], [4, 7, 5, 7],
        [6, 6, 6, 7], [7, 6, 7, 7], [8, 6, 8, 7],
        [5, 8, 5, 9], [6, 8, 7, 8], [8, 8, 8, 9],
      ],
      word: 'NICE',
    }),
  },

  {
    name: 'Trust Issues',
    description: 'Not every wall is real. Not every exit is the exit.',
    grid: buildLevel({
      size: 10,
      start: [0, 0],
      end: [9, 9],
      walls: [
        [1, 0, 1, 1], [2, 1, 2, 2], [3, 0, 4, 0],
        [4, 1, 4, 2], [6, 0, 6, 1], [7, 1, 8, 1],
        [0, 3, 1, 3], [2, 3, 2, 4], [4, 3, 5, 3],
        [6, 3, 6, 4], [8, 3, 8, 4], [1, 5, 1, 6],
        [3, 5, 4, 5], [5, 5, 5, 6], [7, 5, 7, 6],
        [9, 5, 9, 6], [2, 7, 3, 7], [4, 7, 4, 8],
        [6, 7, 7, 7], [8, 7, 8, 8], [3, 9, 4, 9],
        [6, 8, 6, 9],
      ],
      // Two tiles that claim to be the way out. Both send you home.
      modifiers: [
        [3, 2, 'fakeExit'],
        [7, 6, 'fakeExit'],
      ],
      // Walls drawn where there is nothing. Walk through them; that is the
      // lesson. Nothing here hides a real wall — the expensive direction of
      // the lie waits until you have learned to probe.
      liars: [
        [2, 5, { right: true }],
        [5, 2, { bottom: true }],
        [6, 6, { left: true }],
      ],
      word: 'LIAR',
    }),
  },
]

export { LEVELS, buildLevel }
