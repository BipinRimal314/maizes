# Maizes

Thirty mazes. You cannot see most of them. You are a farmer following a trail of
dropped corn to the daughter who dropped it, something in the later ones is
looking for you, and towards the end you stop being able to trust your own map.

Why is it called Maizes? That's the puzzle.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # engine properties + every level re-judged
npm run levels    # regenerate the campaign
npm run build
```

## The rules, in full

- Pick every ear of maize. Picking one sends you back to the start.
- Traps are invisible. Stepping on one sends you back to the start.
- With every ear picked, reach the exit.
- Fog, on levels that have it, shows only what is near you. Cells you have stood
  in stay dimly remembered — until the chapters where that stops being true.
- Memory, on levels that have it, is a countdown rather than a promise. A cell
  you walked through dims as it ages and is gone entirely once the span runs
  out, so the trail rots at the far end while you are still walking it.
- The hunter, on levels that have one, wakes after a while and comes for you. It
  always knows where you are, and it is slower than you. Touching it sends you
  back to the start. **Returning to the start puts it back to sleep.**

That is all of them. **Picked maize is never lost**, including on death — that
one rule removes the whole class of "you must die to make progress, but dying
undoes your progress".

The hunter's sleep rule is the same kind of load-bearing clause. A chaser that
survives your respawn can sit on the start square and kill you the instant you
appear, which is not difficulty, it is a soft lock. Sleeping on every return
also means the hunter's clock and your current attempt are the same clock, so
the thing you have to reason about is exactly the thing on screen.

## The story

*Journey to Maizy.* Bandits took the corn and the farmer's daughter with it. She
leaves a trail of ears in the dark; he follows it. At the end of it he trades
every ear he gathered for her, and is told he is too late — **if only you were
faster** — which is where the second run begins.

The whole thing lives in `src/ui/story.js` and `Story.jsx` and touches neither
the engine nor the generator. A beat is a card between levels; not one line of
it can change what a level is or whether it can be finished. That separation is
deliberate: this repo rests on levels being provably beatable, and a story that
could reach into the rules is a story that could break the proof.

`beatsAfterLevel` is a pure function, separate from the component, because it is
the fiddliest part: it has to tell the last level of a chapter from the last
level of the game, and the end of the first run from the end of the second.
Testing that through a mounted component would mean actually winning thirty
mazes.

### The speedrun

Finishing the campaign freezes your best time on every level as its **par**, and
the second run asks you to beat all thirty. The freeze is the whole mechanic:
read the live bests instead and the target moves every time you improve, so
beating your own time becomes impossible by construction. `progress.js` snapshots
`par` when the run starts and never touches it again.

## The campaign

Thirty levels in eight chapters. Fog arrives at level 8, the hunter at level 16,
fading memory at level 25, and none of them ever leaves:

| levels | chapter | maize | traps | fog | hunter | memory |
|---|---|---|---|---|---|---|
| 1–4 | Warm Up | 1 | — | — | — | ∞ |
| 5–7 | Two Trips | 2 | 2 | — | — | ∞ |
| 8–11 | First Light | 2 | 2 | 4.5 | — | ∞ |
| 12–15 | The Fog | 2 | 3 | 3.5 | — | ∞ |
| 16–19 | Company | 2 | 3 | 3.5 | slow | ∞ |
| 20–24 | No Mercy | 3 | 5 | 3.0 | faster | ∞ |
| 25–27 | Forgetting | 3 | 5 | 3.0 | faster | 7.0s |
| 28–30 | Nothing Stays | 3 | 5 | 3.0 | faster | 2.5s |

Level 8 is identical to level 7 in every way except the fog. Level 16 is
identical to level 15 in every way except the hunter. Level 25 is identical to
level 24 in every way except that its memory fades. One new variable at a time,
so a player who suddenly finds it hard knows exactly what changed — and the
variable only ever tightens after that, the way the fog radius does.

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
  neither an ear of maize nor the exit may require dying to reach
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

### Fading memory is the one thing here that is not proven

Every other mechanic on this list is checked by simulation. Fading memory is
deliberately not, and it is worth being plain about why rather than letting the
"every level is proven" claim quietly cover something it does not.

Memory is **presentation only**. It changes which cells the fog compositor
re-covers; it changes nothing the simulation permits. `memory.test.js` asserts
exactly that — the same inputs on the same maze produce identical positions,
deaths and captures with the memory span set and unset — so it cannot make a
level unwinnable, and the oracle's guarantees carry over untouched.

What it does change is how hard a level is **for a human**, and that the solvers
cannot measure. `playBlind` keeps its own record of what it has seen and has
perfect recall of it; modelling human forgetting is not something a
breadth-first search is honest about. So the `blindDeaths` figure for the last
six levels reflects their traps and their hunter, not their memory span. They
are harder than that number says. That is a limitation of the estimate, not a
gap in the correctness proof.

## Playtesting

A build handed to testers records what happened, so the difficulty ramp can be
argued from their runs rather than from mine.

```bash
cp .env.example .env.local     # fill in the two Supabase values
npm run build
```

**With no env vars set, telemetry is entirely inert** — no requests, no stored
ids, and the notice on the level list does not render. That is the default for
local development and for anyone who clones this.

Set up:

1. Create a Supabase project.
2. Run `supabase/migrations/0001_play_events.sql` in its SQL editor.
3. Put the project URL and the **anon** key in `.env.local`, and set
   `VITE_BUILD` to something like `playtest-1` so data from before a retune
   stays separable.

Four events per tester: `level_started`, `level_won`, `level_quit`,
`campaign_finished`. The quit event is the one worth having — a tester who gives
up on level 28 tells you more than one who finishes level 3, and they are
exactly the tester who never files feedback. It fires on unmount, so leaving by
menu, by key and by closing the tab all count.

Read the results with the two views the migration creates:

```sql
select * from level_funnel;      -- started / won / quit / avg deaths, per level
select * from player_progress;   -- how far each tester got
```

### What it does and does not collect

`player_id` is a random uuid minted in the browser. There is no name, no email,
no free text field, and no IP column — a tester who clears storage becomes a new
player, which is the right trade for not holding anything about them. The level
list says all of this in plain words and offers a one-click opt-out.

The anon key ships inside a public page, so it is assumed hostile: RLS grants it
`INSERT` and nothing else, and there is deliberately no `SELECT` policy, so a
reader of the page cannot pull back other testers' rows. Read the table with the
service role key, which never leaves your machine. `.env.local` is gitignored.

A failed send is queued in localStorage and retried on the next load; a failed
queue write is swallowed. Telemetry may cost a row, never a frame.

## Layout

```
src/
  engine/          no React in here
    grid.js        walls as a mirrored bitmask; the only writer is setWall
    physics.js     ball movement, in cell units, on a fixed timestep
    hunter.js      the ghost: pathing, waking, and the two fairness invariants
    loop.js        fixed-timestep loop — simulation speed is not refresh rate
    game.js        the rules, and nothing else
    render.js      the only module that thinks in pixels
  assets/
    maize.png      the ear sprite; see Credits
  generate/
    maze.js        seeded carve + loop injection
    analysis.js    graph facts: routes, safe reachability, branch depth
    solvers.js     the two simulated players
    oracle.js      every rule a level must satisfy
    generate.js    build, judge, fit a hunter, judge again, keep or discard
  ui/              React shell: input, sizing, HUD, level list, finale
    story.js       the narrative, and which beat a level earns
    progress.js    bests, beats seen, and the speedrun's frozen par
    telemetry.js   playtest events; inert unless configured
  scripts/         build-time campaign generation
```

Boards are landscape (13x8 up to 18x11), not square, because the screen is: a
square maze on a wide window is a postage stamp with a margin either side. Cell
counts were held roughly constant across that change so the tiers stayed as hard
as they were — 14x14 became 18x11, 196 cells against 198.

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
- fading memory changes no position, death or capture — it is a drawing rule,
  and a run with it set matches a run without it exactly

`ballDrawMetrics` in `render.js` exists so a test can assert that the ball's ink
stays inside its collision radius. Ink drawn past that radius reads as clipping
even when collision is exact.

## Credits

The maize sprite (`src/assets/maize.png`) is an RPG icon from
[freegameassets.com](https://www.freegameassets.com/fantasy-rpg-icons?q=corn).
Check their current licence terms before shipping this anywhere public — the
rest of this repo is mine to give away, that file is not.

Everything else on the board is drawn in `render.js`.
