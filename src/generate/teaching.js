/**
 * What a level owes the player the first time a mechanic appears.
 *
 * The oracle next door decides whether a level is *fair*. This decides whether
 * it is *legible* — and only on the one level in the whole campaign where each
 * mechanic arrives.
 *
 * The method is borrowed rather than invented: a first encounter should be
 * impossible to miss and survivable when you do miss it. You are not told that
 * the ground is slower here, you are made to walk through it while nothing else
 * is competing for your attention. Everything after that first level may be as
 * quiet and as cruel as it likes, because by then you know.
 *
 * These are checks, not repairs, like everything else in this directory. A
 * candidate that would teach badly is discarded and the next seed is tried.
 *
 * Two of these shape the campaign and three are regression guards, which is
 * worth saying plainly. `fog` and the two ground lessons reject real candidates
 * — four fog seeds and roughly one sand seed in seven fail them. `hunter`,
 * `memory` and `traps` currently pass on every level that reaches them, because
 * the mechanics happen to introduce themselves well already. They earn their
 * place by failing loudly if that stops being true: shrink a board, speed the
 * hunter up, or lengthen a memory span, and the level that arrives first will
 * be refused rather than quietly becoming an ambush.
 */

import { SAND, SNOW } from '../engine/grid.js'
import { findPath, distancesFrom } from './analysis.js'

/** Steps of simulation per second — the hunter's speed is per step. */
const STEPS_PER_SECOND = 60

/** How long the hunter must be in sight before it can possibly reach you. */
const HUNTER_WARNING_SECONDS = 3

/** Patch cells that must lie on the route, not beside it, to count as taught. */
const MIN_SURFACE_ON_ROUTE = 3

/**
 * The graph radius: the worst case of "how far is the furthest cell from here".
 *
 * The hunter spawns at the cell furthest from the player, so this is the
 * shortest head start the level can ever give — wherever the player happens to
 * be standing when it wakes.
 */
function graphRadius(grid) {
  let radius = Infinity
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      let furthest = 0
      for (const distance of distancesFrom(grid, { x, y }).values()) {
        if (distance > furthest) furthest = distance
      }
      if (furthest < radius) radius = furthest
    }
  }
  return radius
}

/** Cells of one surface kind sitting on the main route. */
function surfaceOnRoute(grid, kind) {
  const route = findPath(grid, grid.start, grid.end)
  if (!route) return 0
  return route.filter((cell) => grid.surface[cell.y * grid.cols + cell.x] === kind).length
}

const LESSONS = {
  /**
   * Fog. There must be something worth walking to already inside the lit
   * circle, so the first thing you learn is that the light travels with you —
   * rather than that the game has gone dark and you are lost in it.
   */
  fog: (grid) => {
    if (grid.fog === null) return 'the level has no fog to teach'
    const nearest = Math.min(...grid.flags.map((flag) =>
      Math.hypot(flag.x - grid.start.x, flag.y - grid.start.y)
    ))
    return nearest <= grid.fog * 1.25
      ? null
      : `nothing to see from the start: nearest ear is ${nearest.toFixed(1)} cells, fog reaches ${grid.fog}`
  },

  /**
   * The hunter. It has to be watchable before it is dangerous — three seconds
   * of it coming, from wherever you are standing when it wakes. Being caught
   * costs the whole level now, so the first one must be a demonstration rather
   * than an ambush.
   */
  hunter: (grid) => {
    if (!grid.hunter) return 'the level has no hunter to teach'
    const cellsPerSecond = grid.hunter.speed * STEPS_PER_SECOND
    const needed = Math.ceil(HUNTER_WARNING_SECONDS * cellsPerSecond)
    const radius = graphRadius(grid)
    return radius >= needed
      ? null
      : `it can be on you in ${(radius / cellsPerSecond).toFixed(1)}s from somewhere on this board`
  },

  /**
   * Ground that changes the physics. The patch has to lie across the way
   * through, wide enough to be felt — a corner clipped at speed teaches
   * nothing, and one on a branch you never take teaches less than that.
   */
  sand: (grid) => {
    const on = surfaceOnRoute(grid, SAND)
    return on >= MIN_SURFACE_ON_ROUTE
      ? null
      : `only ${on} cells of sand lie on the way through`
  },

  snow: (grid) => {
    const on = surfaceOnRoute(grid, SNOW)
    return on >= MIN_SURFACE_ON_ROUTE
      ? null
      : `only ${on} cells of snow lie on the way through`
  },

  /**
   * Fading memory. One trip out has to outlast the span, or the trail never
   * visibly closes and the mechanic introduces itself as nothing at all.
   */
  memory: (grid, difficulty) => {
    if (grid.memory === null) return 'the level has no fading memory to teach'
    const leg = difficulty?.perfectLegMs ?? 0
    return leg > grid.memory * 1.2
      ? null
      : `a trip out takes ${(leg / 1000).toFixed(1)}s and memory lasts ${(grid.memory / 1000).toFixed(1)}s, so nothing is seen to fade`
  },

  /**
   * Traps. The lesson is that the floor lies, and it cannot be learned on a
   * board where the floor never gets the chance to.
   */
  traps: (grid, difficulty) => {
    if (grid.traps.length === 0) return 'the level has no traps to teach'
    return (difficulty?.blindDeaths ?? 0) >= 1
      ? null
      : 'a player walking it blind never once found a trap'
  },
}

/**
 * Judge how well a level teaches `lesson`. Returns null when it teaches it, or
 * a sentence saying what is missing.
 */
function checkTeaching(grid, lesson, difficulty) {
  const check = LESSONS[lesson]
  if (!check) throw new Error(`unknown lesson: ${lesson}`)
  return check(grid, difficulty)
}

export {
  LESSONS,
  checkTeaching,
  graphRadius,
  surfaceOnRoute,
  HUNTER_WARNING_SECONDS,
  MIN_SURFACE_ON_ROUTE,
  STEPS_PER_SECOND,
}
