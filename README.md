# Mazochist

Twenty mazes. You cannot see most of them.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # engine properties + every level re-judged
npm run levels    # regenerate the campaign
npm run build
```

## The rules, in full

- Capture every flag. Capturing one sends you back to the start.
- Traps are invisible. Stepping on one sends you back to the start.
- With every flag captured, reach the exit.
- Fog, on levels that have it, shows only what is near you. Cells you have stood
  in stay dimly remembered.

That is all of them. **Captured flags are never lost**, including on death —
that one rule removes the whole class of "you must die to make progress, but
dying undoes your progress".

## Levels are proven, not authored

No maze geometry is written by hand. A level is generated from a seed, then
**judged**. If it fails any check it is discarded and the next seed is tried.
Levels are never patched into fairness — the previous version of this game did
that, and every patch had an edge it did not cover.

Two simulated players do the judging, and they have deliberately different jobs:

| | knows | job |
|---|---|---|
| `playPerfectly` | the whole maze, every trap | **correctness.** If a player who knows everything cannot finish without dying, the level is unfair. It drives the real physics, so it also proves the ball can physically walk the route. |
| `playBlind` | only what it has walked into; learns traps by dying | **difficulty.** Never a correctness gate. |

Keeping those apart is the point. When one simulated player did both jobs, a
level it failed through its own timidity was indistinguishable from an
unwinnable one, and a whole debugging round went into the wrong bug.

Every level must satisfy, before it ships:

- a route to the exit exists, at least half the board's span long
- start and exit are far apart *across the board*, not just through corridors —
  an exit two cells away behind a wall is not a hard level
- **nothing lethal stands between the player and anything they must touch** —
  neither a flag nor the exit may require dying to reach
- no cell is walled off entirely
- a perfect player finishes with **zero** deaths
- a blind player finishes at all, and dies fewer than 25 times

`src/generate/levels.test.js` re-runs all of it against the shipped
`public/levels.json`, so the guarantee is checked against the artifact rather
than against the process that made it.

## Layout

```
src/
  engine/          no React in here
    grid.js        walls as a mirrored bitmask; the only writer is setWall
    physics.js     ball movement, in cell units, on a fixed timestep
    loop.js        fixed-timestep loop — simulation speed is not refresh rate
    game.js        the three rules, and nothing else
    render.js      the only module that thinks in pixels
  generate/
    maze.js        seeded carve + loop injection
    analysis.js    graph facts: routes, safe reachability, branch depth
    solvers.js     the two simulated players
    oracle.js      every rule a level must satisfy
    generate.js    build, judge, keep or discard
  ui/              React shell: input, sizing, HUD, level list
  scripts/         build-time campaign generation
```

Three invariants hold the engine together:

**Simulation runs on a fixed timestep.** Physics is in cell units and steps in
fixed 1/60s chunks however often the browser paints. Rendering follows the
display; difficulty does not.

**React renders about ten times a second.** The game is a mutable object driven
by `requestAnimationFrame`. Only a small flat snapshot crosses into React.

**Walls are mirrored, and `setWall` is the only writer.** Collision trusts the
cell under the ball to carry every wall that can stop it, which is only safe
while the two sides of every shared edge agree.

## What the property tests cover

`fast-check` drives random input over randomly generated mazes and asserts:

- the ball never makes a cell transition the maze forbids (diagonals only
  through a genuinely open corner)
- the ball's circle never overlaps a wall, to 1e-9 — a weaker check passes while
  the ball visibly sits inside walls, which is what "clipping" actually looked
  like
- a sealed cell cannot be escaped
- speed never exceeds the cap

`ballDrawMetrics` in `render.js` exists so a test can assert that the ball's ink
stays inside its collision radius. Ink drawn past that radius reads as clipping
even when collision is exact.
