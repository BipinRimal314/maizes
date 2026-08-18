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
  in stay remembered, dimmer than the circle you are standing in and clearly
  lighter than ground you have never touched — until the chapters where that
  stops being true.
- Ground is not all the same. Sun-baked flat runs the ball half again as fast;
  deep snow costs it nearly a third. Patches, not whole boards.
- Memory, on levels that have it, is a countdown rather than a promise. A cell
  you walked through dims as it ages and is gone entirely once the span runs
  out, so the trail rots at the far end while you are still walking it.
- The hunter, on levels that have one, wakes after a while and comes for you. It
  always knows where you are, and it is slower than you. **Touching it loses the
  level.** Returning to the start puts it back to sleep.

That is all of them. **A trap never costs you maize**, and that one rule removes
the whole class of "you must die to make progress, but dying undoes your
progress".

The two failure modes are deliberately not the same weight. A trap costs the
walk back and nothing else. The hunter costs the level — it is the only thing in
the game that can take picked maize away, which is what makes the countdown
worth watching rather than a number in the corner.

The hunter's sleep rule is the same kind of load-bearing clause. A chaser that
survives your respawn can sit on the start square and kill you the instant you
appear, which is not difficulty, it is a soft lock. Sleeping on every return
also means the hunter's clock and your current attempt are the same clock, so
the thing you have to reason about is exactly the thing on screen.

## The story

*Journey to Maizy.* You start knowing nothing: a man picking up corn that should
still be on the stalk, and a child's voice saying one word. Everything after
that is earned a chapter at a time.

Every beat is a conversation between two voices — the farmer, who tells you what
he is doing and consistently will not finish the sentence that matters, and the
voices, overheard or remembered or not really there, who say the part he skips.
The reveal happens in the gap between them.

The ladder is deliberately slow: corn does not walk → someone said "she" → a
girl was taken and the trail is on purpose → someone is counting it and it will
run out → her name → the hat, and the yellow shape you have been steering for
twenty levels → the camp and the cart → how long he has been out here. Then the
bargain, the refusal, and **if only you were faster**, which is where the second
run begins.

Eight fragments also land *during* levels, a few seconds in, in the quip line.
They arrive while the player is busy and cannot stop to study them, which is the
right delivery for something meant to feel half-heard.

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

### The campaign is a mystery

The level list shows what has been walked and exactly one step past it.
Everything beyond is a blank marker, and a chapter that has not been reached is
not drawn at all.

The mechanic tags are the reason. "fog", "hunted" and "fading" name three of the
revelations the story spends thirty levels earning — a player who reads them off
a list on day one has been handed the ending, and the chapter names give away
nearly as much.

Unlocking counts an **unbroken run from the start**, not a total, so finishing
level 12 in developer mode does not hand a real player levels 2 through 12 they
never walked.

`?dev` unlocks everything and puts the tags back; `?dev=0` turns it off again,
and the choice is remembered. It is deliberately not a keyboard easter egg — a
tester who stumbles onto a secret that reveals the whole campaign has had the
game spoiled by accident.

### Ground that changes the physics

Sand and snow are the first mechanic here that is not presentation, and the
first that can make a level *unfair* rather than merely ugly. Two things keep
them honest.

**Only acceleration is scaled, never friction.** Terminal velocity settles at
`ACCEL × FRICTION / (1 − FRICTION)`, so scaling acceleration scales top speed by
exactly that factor and leaves handling identical — the ball corners the way it
always did, it just gets there sooner or later. Scaling friction instead would
make sand slippery and snow sticky, changing how the maze is *steered* rather
than how fast it is crossed, and would put the "never overlaps a wall" property
back in play for the sake of a feeling.

**The hunter's speed cap is computed per grid, against the slowest ground on
it.** Deep snow costs the ball nearly a third of its top speed; a hunter allowed
two thirds of the *unslowed* ball would be faster than a player wading through
it. Since being caught now costs the whole level, that is not "hard", it is
unwinnable — and it would pass every structural check, because nothing about the
maze would be wrong. `fitHunter` clamps at generation time so the shipped level
records the speed that actually runs, rather than the tier's wish.

Patches are grown as blobs through open edges, never scattered as single cells:
one fast cell mid-corridor is noise you are across before it registers, while a
patch you can see coming and commit to is a decision. Nothing is laid on the
start, the exit, an ear of maize or a trap — the first three must be readable at
a glance, and tinting the ground over the fourth would be a tell.

### Terrain

Each chapter is walked over different ground: field, track, dusk, woods, night,
ridge, marsh, **enchanted**, ember. It repaints the board background, the grid,
the walls and the fog, and nothing else — the start, the exit, the maize and the ball keep
their colours everywhere, because those four are how the player reads a board
and re-tinting them per chapter would re-teach the vocabulary every time the
scenery changed. Presentation only; no level's proof depends on it.

`enchanted` — The Lit Wood — is the only dark one. Everywhere else is daylight
or dusk seen through fog; there the ground itself is black and the walls are the
only light in it. A terrain may carry a `glow`, which lays a wide coloured bloom
under the walls before the crisp line goes on top. The bloom is stroked twice,
because canvas shadows do not accumulate within a single stroke and one blurred
pass reads as a smudge rather than as light. The sharp wall still goes down last:
a wall is a collision boundary before it is decoration, and the player has to see
exactly where it is.

### The trail map

The premise promised that the player is shown everything they gathered, and the
bargain screen showed a number. A number is not thirty-nine fields; it is a
receipt for them.

`TrailMap.jsx` draws the whole journey as one strip: chapters as bands of the
ground they were walked over, taken from the same terrain table the board uses
and sized by how many levels each holds, so the picture is the journey
recoloured rather than a chart about it. Ground not yet reached is dimmed, and
the ears counted are only the ones actually picked — the total on the bargain
screen is the player's, not the game's.

### Two endings

A game that cannot be failed has no stakes, and one that fails you by accident
has no respect. So the losing ending is **chosen**: a quiet "stop looking" on
the finale, offered only while the run is still winnable, never handed out for
being slow.

It is not a dead end either. Conceding records where he stopped; beat every
field afterwards and the rescue still lands. Someone who put the game down in a
bad mood should not find the ending locked behind a button they pressed.

### The voices are two people

Both are meant to be recognisable before they are named.

The big bandit **counts** — ears, rows, steps, carts, days, miles — every time
he speaks, across five chapters, so that when he counts the maize at the camp
the player already knows whose voice that is. A test asserts the tic appears
often enough to earn its payoff.

Maizy **thins out** as the distance grows: whole sentences at the gate,
fragments by the marsh, one word in the wood, and nothing at all when you
finally reach the fires. That silence at the camp is the point of the arc, and
it is tested too.

### The speedrun

Finishing the campaign freezes your best time on every level as its **par**, and
the second run asks you to beat all thirty. The freeze is the whole mechanic:
read the live bests instead and the target moves every time you improve, so
beating your own time becomes impossible by construction. `progress.js` snapshots
`par` when the run starts and never touches it again.

## The campaign

Thirty-nine levels in eleven chapters. Fog arrives at level 8, the hunter at level 16,
fading memory at level 25, and none of them ever leaves:

| levels | chapter | maize | traps | fog | hunter | memory |
|---|---|---|---|---|---|---|
| 1–4 | Warm Up | 1 | — | — | — | ∞ |
| 5–7 | Two Trips | 2 | 2 | — | — | ∞ |
| 8–11 | First Light | 2 | 2 | 4.5 | — | ∞ |
| 12–15 | The Fog | 2 | 3 | 2.9 | — | ∞ |
| 16–19 | Company | 2 | 3 | 2.9 | slow | ∞ |
| 20–24 | No Mercy | 3 | 5 | 2.4 | faster | ∞ |
| 25–27 | The Dry Reach | 3 | 5 | 2.4 | yes | ∞ |
| 28–30 | The White Mile | 3 | 5 | 2.4 | yes | ∞ |
| 31–33 | Forgetting | 3 | 5 | 2.4 | yes | 7.0s |
| 34–36 | The Lit Wood | 3 | 5 | 2.4 | yes | 4.0s |
| 37–39 | Nothing Stays | 3 | 5 | 2.4 | yes | 2.5s |

Sand arrives at 25, snow at 28, and neither leaves.

The fog only ever tightens, and only on a chapter that is not introducing
something else. The chapters that bring the hunter and fading memory inherit the
radius of the one before them untouched — one new variable at a time is the
whole reason a player can tell what got harder.

Level 8 is identical to level 7 in every way except the fog. Level 16 is
identical to level 15 in every way except the hunter. Level 25 is identical to
level 24 in every way except that its memory fades. One new variable at a time,
so a player who suddenly finds it hard knows exactly what changed — and the
variable only ever tightens after that, the way the fog radius does.

## Every level asks its own question

A level is a **tier** and an **intent**. The tier says which mechanics are
switched on; the intent says what shape of problem they are arranged into.

That second axis is new, and it exists because of a measurement: the campaign
before it had thirty-nine levels carrying **eleven** distinct configurations.
Within a chapter, levels were generated from one tier and different random
seeds — the walls moved and nothing else did, so twenty-eight of thirty-nine
re-ran something the player had already been taught.

| intent | the question it asks | how it is measured |
|---|---|---|
| `artery` | will you commit to one long route? | route length ÷ board span, few junctions |
| `warren` | can you hold a map in your head? | junctions per cell of route |
| `detour` | is that ear worth the trip? | degrees of arc the maize is spread over |
| `gauntlet` | can you be careful at speed? | share of traps on or beside the route |
| `bottleneck` | can you time what is waiting? | cells the level cannot be finished without |
| `circuit` | how fast, given a wrong turn is cheap? | edges beyond a spanning tree |

An intent is knobs plus a `want`. The knobs reshape the maze before anything is
placed in it — `circuit` injects four times the loops of `artery` — and the
`want` is a predicate the finished level must satisfy. The thresholds come from
the measured spread of the levels this replaces, so each intent is demonstrably
reachable and demonstrably not the average.

**The shape check runs before the physics.** Both throw candidates away, and one
costs a hundred thousand simulation steps while the other costs a breadth-first
search. Asking the cheap question first is the difference between a two-second
build and a several-minute one.

Two rules keep it honest, both checked against the shipped file rather than the
process that made it:

- **No two levels in a chapter may sit within 0.55 of each other** on the shape
  vector. Calibrated rather than guessed — generating with intents and no
  distinctness rule gives a floor of 0.33 and a lower quartile of 0.63. The
  first attempt used 0.9, which simply failed to build the campaign.
- **Each chapter opens on the intent the previous one closed with**, so on the
  level where a mechanic arrives the shape of the problem is the shape just
  finished. One new variable at a time, extended to level design.

Result: thirty-nine levels, **thirty-nine distinct configurations**, closest
in-chapter pair 0.56 apart where it used to be 0.17.

## Teaching without telling

The explanation curve used to run backwards. The opening — one ear on an open
board with nothing hidden — carried captions explaining itself, and nine of the
eleven chapter cards announced their own mechanic before the player had met it.
*"Wider, darker, and something in it still looking for me"* hands you the ghost
in advance.

The rule now is **silence early, instruments late, tutorials never.**

- **Warm Up has no caption at all.** Four levels that explain themselves need no
  help, and a caption there is noise.
- **A blurb says where the farmer is and how he is holding up.** Never what is
  new. A test asserts no blurb contains any of the words that would give a
  mechanic away.
- **The ghost countdown stays.** It arrives at level 16 alongside the thing it
  measures, and by then four systems are being timed at once. A gauge you read
  while playing is not a lesson you are told.
- **Surface patches are outlined**, not just tinted. A flat tint was legible on
  an empty board and stopped being so once fog, a hunter and a rotting trail
  landed on top of it — and a patch whose edge you cannot see is a physics
  change you cannot plan for.

### The level a mechanic arrives on has to demonstrate it

`teaching.js` adds one constraint to the *first* level of each mechanic, and to
no other level in the game. A first encounter should be impossible to miss and
survivable when you do miss it; everything after may be as quiet and as cruel
as it likes.

| lesson | what the level must do |
|---|---|
| `fog` | put an ear inside the lit circle, so the first thing learned is that the light travels with you |
| `hunter` | leave three seconds of it coming, from wherever you stand when it wakes — measured as the graph radius against its speed |
| `sand` / `snow` | lay at least three cells of the patch **across the route**, never on a branch you might skip |
| `memory` | make one trip out last longer than the memory span, or nothing is seen to fade |
| `traps` | be a board where a blind player actually finds one |

Two of these shape the campaign and three are regression guards, which is worth
saying plainly rather than implying all five are doing equal work. `fog` and the
ground lessons reject real candidates — four fog seeds, and roughly one sand
level in seven would fail. `hunter`, `memory` and `traps` pass on every level
that reaches them, because those mechanics already introduce themselves well.
They earn their place by failing loudly if that stops being true: shrink a
board, speed the hunter up, or lengthen a memory span, and the level it arrives
on is refused rather than quietly becoming an ambush.

`teaching.test.js` shows every lesson both passing and failing on hand-built
mazes, because a check that cannot fail is not a check.

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
- a perfect player finishes with **zero** deaths and is **never caught**
- a perfect player finishes inside 40 seconds — a cap on patience, not on
  difficulty. `artery` and `bottleneck` produce long committed routes on
  purpose, but unbounded they produced a hundred-cell corridor taking a minute
  of optimal play on a board that also carries a hunter and a rotting memory.
  Losing one of those at the fifty-fifth second is tedious, not hard
- a blind player finishes at all, dies fewer than 25 times, and is caught fewer
  than 6 times

`src/generate/levels.test.js` re-runs all of it against the shipped
`public/levels.json`, so the guarantee is checked against the artifact rather
than against the process that made it.

### How the hunter stays inside that guarantee

The hunter is the one mechanic that can kill you while you stand still, so it
gets no exemption from any of the above. It is not special-cased in the oracle
at all — it lives in the engine, and *both* simulated players therefore face it
for free. "A perfect player finishes without losing" already means "the hunter
never catches an optimal player", and that is checked rather than asserted.

Now that a catch costs the whole attempt, the blind player restarts on one and
keeps what it learned about the traps — a real player who lost still remembers
where the ground gave way — and a level whose blind player is caught more than
six times is discarded as too hunter-hard.

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
    metrics.js     the shape of a level, and how far apart two levels are
    solvers.js     the two simulated players
    oracle.js      every rule a level must satisfy
    generate.js    build, judge, fit a hunter, judge again, keep or discard
  ui/              React shell: input, sizing, HUD, level list, finale
    story.js       the narrative, and which beat a level earns
    TrailMap.jsx   the whole journey as one strip of ground
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
