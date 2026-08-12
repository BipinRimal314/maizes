# Puzzles

Twenty-four mazes. You cannot see most of them. Something in the later ones is
looking for you.

Why is it called Puzzles? That's the puzzle.

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
- The hunter, on levels that have one, wakes after a while and comes for you. It
  always knows where you are, and it is slower than you. Touching it sends you
  back to the start. **Returning to the start puts it back to sleep.**

That is all of them. **Captured flags are never lost**, including on death —
that one rule removes the whole class of "you must die to make progress, but
dying undoes your progress".

The hunter's sleep rule is the same kind of load-bearing clause. A chaser that
survives your respawn can sit on the start square and kill you the instant you
appear, which is not difficulty, it is a soft lock. Sleeping on every return
also means the hunter's clock and your current attempt are the same clock, so
the thing you have to reason about is exactly the thing on screen.

## The campaign

Twenty-four levels in six chapters. Fog arrives at level 8, the hunter at
level 16, and neither ever leaves:

| levels | chapter | flags | traps | fog | hunter |
|---|---|---|---|---|---|
| 1–4 | Warm Up | 1 | — | — | — |
| 5–7 | Two Trips | 2 | 2 | — | — |
| 8–11 | First Light | 2 | 2 | 4.5 | — |
| 12–15 | The Fog | 2 | 3 | 3.5 | — |
| 16–19 | Company | 2 | 3 | 3.5 | slow |
| 20–24 | No Mercy | 3 | 5 | 3.0 | faster |

Level 8 is deliberately identical to level 7 in every way except the fog. Level
16 is deliberately identical to level 15 in every way except the hunter — same
board size, same flags, same traps, same fog radius. One new variable at a time,
so a player who suddenly finds it hard knows exactly what changed.

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

### How the hunter stays inside that guarantee

The hunter is the one mechanic that can kill you while you stand still, so it
gets no exemption from any of the above. It is not special-cased in the oracle
at all — it lives in the engine, and *both* simulated players therefore face it
for free. "A perfect player finishes with zero deaths" already means "the hunter
never catches an optimal player", and that is checked rather than asserted.

Its timer is derived, never guessed. Levels in a hunted tier are generated and
judged **twice**:

1. **Without a hunter.** This proves the maze on its own, and measures
   `perfectLegMs` — the longest single trip out from the start that optimal play
   actually takes on this exact maze, driven through the real physics. Legs are
   the right unit because capturing a flag teleports you back to the start, so a
   leg is precisely the interval the hunter's clock measures.
2. **With the hunter installed**, waking at `perfectLegMs × margin` (1.9 in
   *Company*, 1.8 in *No Mercy*, whose hunter is faster instead). Same rules, no
   exemptions. A level whose perfect player now dies is discarded like any other
   failure.

So the hunter is, by construction, something only a slow player meets — and
because construction is not proof, the second pass checks it anyway.

Two further invariants are property-tested in `src/engine/hunter.test.js`:

- **It cannot reach through a wall.** It walks the same graph the ball does, and
  a catch additionally requires the two cells to be the same or joined by an
  open edge. Proximity alone is not enough.
- **It cannot out-run the ball.** `HUNTER_SPEED_CAP` is measured against the
  ball's real terminal velocity — `ACCEL × FRICTION / (1 − FRICTION)`, about
  0.164 cells per step — and *not* against the `MAX_SPEED` constant of 0.42,
  which friction means the ball never actually reaches. Sizing a chaser against
  a speed the player cannot hit would make it faster than the thing it chases.

It is also always drawn over the fog. Being unable to see the maze is the game;
being unable to see the thing chasing you is just noise. Its eyes track the
ball, because it always walks the shortest path to you — so where it is looking
is where it is about to go, and a player who reads that can get around it.

## Layout

```
src/
  engine/          no React in here
    grid.js        walls as a mirrored bitmask; the only writer is setWall
    physics.js     ball movement, in cell units, on a fixed timestep
    hunter.js      the chaser: pathing, waking, and the two fairness invariants
    loop.js        fixed-timestep loop — simulation speed is not refresh rate
    game.js        the rules, and nothing else
    render.js      the only module that thinks in pixels
  generate/
    maze.js        seeded carve + loop injection
    analysis.js    graph facts: routes, safe reachability, branch depth
    solvers.js     the two simulated players
    oracle.js      every rule a level must satisfy
    generate.js    build, judge, fit a hunter, judge again, keep or discard
  ui/              React shell: input, sizing, HUD, level list, finale
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
- the hunter never leaves the maze, never crosses a closed edge, and never moves
  further in one step than its own speed

`ballDrawMetrics` in `render.js` exists so a test can assert that the ball's ink
stays inside its collision radius. Ink drawn past that radius reads as clipping
even when collision is exact.
