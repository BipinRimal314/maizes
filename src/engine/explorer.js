/**
 * A simulated player who cannot see the maze.
 *
 * The autoplay test walks the known solution, which is the one thing a real
 * player on a fog level cannot do. This explorer behaves the way the fog forces
 * you to behave: it only knows cells it has stood in, it heads for the nearest
 * unexplored opening, and it backtracks out of dead ends because there is no
 * other way out of one.
 *
 * That last part is why it exists. The apparition punishes backtracking, and
 * fog compels it, so the two mechanics can be in direct conflict on the same
 * level without any single-mechanic test noticing.
 */

const SIDES = [
  { name: 'top', dx: 0, dy: -1, opposite: 'bottom' },
  { name: 'right', dx: 1, dy: 0, opposite: 'left' },
  { name: 'bottom', dx: 0, dy: 1, opposite: 'top' },
  { name: 'left', dx: -1, dy: 0, opposite: 'right' },
]
const GATE_BLOCKS = { up: 'bottom', down: 'top', left: 'right', right: 'left' }

function cellAt(grid, x, y) {
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
  return grid.cells[y * grid.cols + x]
}

/**
 * Can the ball actually leave `cell` this way? Uses true walls, as reality does.
 *
 * `lethal` is the set of cells the player has learned kill them. Traps are
 * invisible by design and the whole loop is "die once, remember where" — an
 * explorer without that memory walks into the same trap forever and tells you
 * nothing about whether the level is fair.
 */
function passable(grid, x, y, side, closedGates, lethal) {
  const cell = cellAt(grid, x, y)
  if (!cell || cell.walls[side.name]) return false
  if (cell.gate && closedGates.has(`${x},${y}`) && GATE_BLOCKS[cell.gate.direction] === side.name) {
    return false
  }
  const next = cellAt(grid, x + side.dx, y + side.dy)
  if (!next || next.walls[side.opposite]) return false
  if (lethal && lethal.has(`${x + side.dx},${y + side.dy}`)) return false
  return true
}

/**
 * Breadth-first search over cells the explorer has already stood in, to the
 * nearest cell with an unexplored neighbour. Returns the next step to take.
 */
function nextStepToward(grid, from, known, closedGates, goal, lethal) {
  const key = (x, y) => `${x},${y}`
  const previous = new Map([[key(from.x, from.y), null]])
  const queue = [from]

  let target = null
  while (queue.length) {
    const at = queue.shift()

    if (goal && at.x === goal.x && at.y === goal.y) { target = at; break }
    if (!goal) {
      // frontier: a known cell with a passable exit into somewhere unknown
      for (const side of SIDES) {
        if (!passable(grid, at.x, at.y, side, closedGates, lethal)) continue
        if (!known.has(key(at.x + side.dx, at.y + side.dy))) { target = at; break }
      }
      if (target) break
    }

    for (const side of SIDES) {
      if (!passable(grid, at.x, at.y, side, closedGates, lethal)) continue
      const nx = at.x + side.dx
      const ny = at.y + side.dy
      const k = key(nx, ny)
      // may only route through cells already explored
      if (!known.has(k) || previous.has(k)) continue
      previous.set(k, key(at.x, at.y))
      queue.push({ x: nx, y: ny })
    }
  }

  if (!target) return null

  // Standing on the frontier already: step into the unknown rather than
  // targeting the cell we are in, which would mean issuing no input at all and
  // deadlocking on the spot.
  if (target.x === from.x && target.y === from.y) {
    if (goal) return target
    for (const side of SIDES) {
      if (!passable(grid, from.x, from.y, side, closedGates, lethal)) continue
      const nx = from.x + side.dx
      const ny = from.y + side.dy
      if (!known.has(key(nx, ny))) return { x: nx, y: ny }
    }
    return null
  }

  // walk the chain back to the first step away from `from`
  let cursor = key(target.x, target.y)
  let step = cursor
  while (previous.get(cursor) !== null && previous.get(cursor) !== undefined) {
    step = cursor
    cursor = previous.get(cursor)
  }

  const [sx, sy] = step.split(',').map(Number)
  return { x: sx, y: sy }
}

/**
 * Drive a game with an exploring player. Returns what happened, including why
 * they died, which is the point of the exercise.
 */
function explore(game, stepGame, { maxSteps = 60000 } = {}) {
  const { grid } = game
  const known = new Set([`${Math.floor(game.ball.x)},${Math.floor(game.ball.y)}`])
  const lethal = new Set()
  const deathsByCause = {}
  let steps = 0
  let previousDeaths = 0

  const originalOnDeath = game.onDeath
  game.onDeath = (cause, at) => {
    deathsByCause[cause] = (deathsByCause[cause] || 0) + 1
    // learn where it killed you — traps and mimics stay put
    if (at && (cause === 'trap' || cause === 'mimic')) lethal.add(`${at.x},${at.y}`)
    if (originalOnDeath) originalOnDeath(cause, at)
  }

  while (steps < maxSteps && !game.won) {
    const cx = Math.floor(game.ball.x)
    const cy = Math.floor(game.ball.y)
    known.add(`${cx},${cy}`)

    if (game.deaths > previousDeaths) {
      previousDeaths = game.deaths
      // knowledge survives death; that is the whole memorisation loop
    }

    // head for the exit once every flag is captured, otherwise keep exploring
    const goal = game.exitUnlocked ? grid.end : null
    let target = nextStepToward(grid, { x: cx, y: cy }, known, game.closedGates, goal, lethal)

    // nothing left to explore: make for the exit regardless
    if (!target) target = nextStepToward(grid, { x: cx, y: cy }, known, game.closedGates, grid.end, lethal)

    // Everything left is behind something known to be lethal. A real player
    // takes the hit rather than sitting there forever, so the explorer does
    // too — otherwise "stuck" conflates "the level is impossible" with "the
    // simulated player was too cautious", and only the first is a bug.
    if (!target) {
      target = nextStepToward(grid, { x: cx, y: cy }, known, game.closedGates, null, null)
        || nextStepToward(grid, { x: cx, y: cy }, known, game.closedGates, grid.end, null)
    }
    if (!target) break

    const tx = target.x + 0.5
    const ty = target.y + 0.5
    const dx = tx - game.ball.x
    const dy = ty - game.ball.y
    const threshold = 0.05

    game.input.left = dx < -threshold
    game.input.right = dx > threshold
    game.input.up = dy < -threshold
    game.input.down = dy > threshold

    stepGame(game)
    steps++
  }

  game.onDeath = originalOnDeath

  return {
    won: game.won,
    steps,
    deaths: game.deaths,
    deathsByCause,
    trapsLearned: lethal.size,
    explored: known.size,
    seconds: game.now / 1000,
  }
}

export { explore, nextStepToward, passable }
