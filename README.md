The web campaign has been revamped: 89 continuous exploration fields, 11 return-trip puzzles, 20 optional axe shortcuts, searchable ghosts and hiding places, 27 journal discoveries, and a three-marker finale. Existing unlocks remain; new records are separated by difficulty and dev mode. See [REVAMP.md](REVAMP.md) for the current design and playtest guide. The notes below include earlier campaign history.

# Current web campaign

The web game now has **100 fields**, an axe that clears timber, slower ghosts, and a single-use protective ward. Run `npm run dev`; use `?dev=1&level=7` to test the axe. `npm run build` regenerates and verifies `public/campaign-v2.json`. See `thoughts.md` for the progression and `HANDOFF.md` for platform status. Easy and Difficult are selectable on the level screen or in Pause (changing mid-field restarts it). Easy keeps maize after traps, halves trap counts rounded up, and uses 70% of the campaign ghost speed. Difficult adds traps only to empty dead ends, resets maize after traps, and uses 150% ghost speed with the existing outrun cap. Unlocks and existing progress are shared. The native iOS client retains the earlier campaign; the older design history below describes that build.

# Journey to Maizy

Thirty mazes. You cannot see most of them. You are a farmer following a
trail of dropped corn to the daughter who dropped it, something in the later
ones is looking for you, and towards the end you stop being able to trust your
own map.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # engine properties + every level re-judged
npm run levels    # regenerate the campaign
npm run stats     # read the playtest back, if telemetry is configured
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

That is all of them, with one turn of the screw: **once a field has a hunter
in it, a trap costs the maize too.** Before that a trap never costs you maize,
which removes the whole class of "you must die to make progress, but dying
undoes your progress" from the fields where a player is still learning what a
trap is. On a hunted field they know, and the stakes go up with them.

The two failure modes are deliberately not the same weight. A trap costs the
walk back and nothing else. The hunter costs the level — it is the only thing in
the game that can take picked maize away, which is what makes the countdown
worth watching rather than a number in the corner.

The hunter's sleep rule is the same kind of load-bearing clause. A chaser that
survives your respawn can sit on the start square and kill you the instant you
appear, which is not difficulty, it is a soft lock. Sleeping on every return
also means the hunter's clock and your current attempt are the same clock, so
the thing you have to reason about is exactly the thing on screen.

## Feel

Everything the board *shows* happening — the fall, the arrival, the pick, the
way opening, a knock on a wall, the hat going into the exit — is a timestamped
record in `engine/fx.js` that the renderer reads and the rules never do. A game
whose effects are stripped every step plays identically to one that keeps them,
and there is a test that says so. The title card holds the field paused, so
the time on the card is time spent walking.

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
Testing that through a mounted component would mean actually winning every
mazes.

### The campaign is a mystery

The level list shows what has been walked and exactly one step past it.
Everything beyond is a blank marker, and a chapter that has not been reached is
not drawn at all.

The mechanic tags are the reason. "fog", "hunted" and "fading" name three of the
revelations the story spends the whole campaign earning — a player who reads them off
a list on day one has been handed the ending, and the chapter names give away
nearly as much.

Unlocking counts an **unbroken run from the start**, not a total, so finishing
level 12 in developer mode does not hand a real player levels 2 through 12 they
never walked.

`?dev` unlocks everything and puts the tags back; `?dev=0` turns it off again,
and the ordinary URL always starts normal play. Dev mode is never remembered in storage. It is deliberately not a keyboard easter egg — a
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
bargain screen showed a number. A number is not twenty-six fields; it is a
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

Finishing the campaign freezes your best times as **par**, and the second run
asks you to beat them. The freeze is the whole mechanic: read the live bests
instead and the target moves every time you improve, so beating your own time
becomes impossible by construction. `progress.js` snapshots `par` when the run
starts and never touches it again.

Act two races **one field per chapter — the last of each, eleven in all** — and
not the whole campaign again. Demanding all of it was asking for a second full
playthrough at the exact moment the player has just been told they were too
slow, which is the likeliest place in the game to lose them. The set is derived
from the level list rather than named, so re-cutting the campaign cannot leave
it pointing at fields that no longer exist.

And the deadline act two turns on is now **shown in act one**. The bandits name
first light five fields in, it is half-heard the field before that, echoed at
the ridge, and the level list carries a running total of time walked from the
first field onward. A game may only judge a number it showed you; "if only you
were faster" over a campaign that never mentioned speed is a rule invented after
the exam.

## The campaign

Twenty-six levels in eleven chapters. Traps arrive at level 4, fog at 6, the
hunter at 11, sand at 16, snow at 18, fading memory at 20, and none of them ever
leaves:

| levels | chapter | maize | traps | fog | hunter | memory |
|---|---|---|---|---|---|---|
| 1–3 | Warm Up | 1 | — | — | — | ∞ |
| 4–5 | Two Trips | 2 | 2 | — | — | ∞ |
| 6–8 | First Light | 2 | 2 | 4.5 | — | ∞ |
| 9–10 | The Fog | 2 | 3 | 2.9 | — | ∞ |
| 11–13 | Company | 2 | 3 | 2.9 | yes | ∞ |
| 14–15 | No Mercy | 3 | 5 | 2.4 | yes | ∞ |
| 16–17 | The Dry Reach | 3 | 5 | 2.4 | yes | ∞ |
| 18–19 | The White Mile | 3 | 5 | 2.4 | yes | ∞ |
| 20–21 | Forgetting | 3 | 5 | 2.4 | yes | 7.0s |
| 22–23 | The Lit Wood | 3 | 5 | 2.4 | yes | 4.0s |
| 24–26 | Nothing Stays | 3 | 5 | 2.4 | yes | 2.5s |

**Why twenty-six and not thirty-nine.** The campaign was thirty-nine, and its
back half was one board painted six ways: levels 20 to 39 were identical in
size, ears, traps, fog radius and hunter, with fading memory the only variable
left to spend across six chapters. Shape distinctness does not rescue that,
because a player perceives size, threat count and new verbs — not maze topology.
The cut is to the length that leaves every chapter a variable of its own.

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
re-ran something the player had already been taught. (That fixed the *shape*
repetition. The *mechanical* repetition in the back half survived it, and is
what the cut to twenty-six addresses.)

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

Result: every level a distinct configuration, with no in-chapter pair inside
0.55 on the shape vector — where it used to be 0.17.

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

## Running it as a program

```bash
npm run desktop         # dev, with hot reload
npm run desktop:build   # a bundle for whatever OS you are on
```

Wrapped in **Tauri**, not Electron. The macOS bundle is **4.3 MB** against the
hundred-odd Electron would cost, because Tauri uses the webview the operating
system already has instead of shipping a browser. The game is a static bundle
and a canvas; it does not need its own Chromium.

That trade has a real cost worth stating: the three platforms run three
different webviews — WKWebView, WebView2 and WebKitGTK — so rendering and audio
are not guaranteed identical the way a bundled Chromium would guarantee them.
Every API this game uses is long-settled (canvas 2D, Web Audio, pointer events,
`requestAnimationFrame`), and `OffscreenCanvas` already falls back, so the
exposure is small — but it is not zero, and it is the reason the CI matrix runs
the full test suite on all three rather than building blindly.

**Tauri cannot cross-compile.** Each bundle must be produced on the OS it
targets, so `.github/workflows/desktop.yml` is a matrix of real runners
producing `.dmg`, `.msi`/`.exe`, `.deb`/`.rpm`/`.AppImage`. It builds on a `v*`
tag or on demand, and sets `VITE_NO_DEV=1` so a shipped build can never have
developer mode switched on.

### The save became a file

localStorage in a packaged app is still tied to a webview origin, and can be
cleared by the webview, an update, or the OS tidying up. Losing a finished
campaign to a housekeeping job is not something to shrug at, so on the desktop
the save is a real file in the app-data directory.

The awkward part is that the game reads progress *synchronously*, several times
a render, and a file read is asynchronous. So the file is read once at boot —
the first render is gated on it — and every write is a debounced flush of the
whole snapshot. Finishing a level writes three times in a row (the win, the best
time, the beat marked seen), and three file writes for one event is three
chances to be interrupted mid-write.

`persist.js` falls back to localStorage in a browser, and every failure path
returns empty rather than throwing. A save that throws on load is a game that
will not start, which is a far worse bug than a lost campaign — there are tests
for corrupt JSON, storage that throws, and storage that is missing entirely.

### Controller and volume

A gamepad drives the same `game.input` the keyboard and the touch stick write
into, so nothing downstream knows which one moved the hat. Polled on the
animation frame the loop is already running rather than on a timer of its own,
and it releases the inputs if the pad is unplugged mid-press — otherwise the hat
keeps walking into a wall forever. `readPad` is a pure function so the deadzone
and the d-pad can be tested without a controller.

Master volume sits in the pause menu beside the mute toggle, remembered across
sessions.

## Lit from within

Every ground is dark and every wall emits light. Not a mood choice — it is what
the game already was and had not admitted.

Most of the board is under fog at any moment, and fog over a cream page can only
ever be a grey smear laid on top of a drawing. Fog over a dark ground is simply
the dark you have not reached yet, which is the thing the fiction spends eleven
chapters describing. The Lit Wood was drawn this way first and was, by a
distance, the only board in the game that looked designed; this is that
chapter's principle taken everywhere, with a hue per terrain so the journey
still visibly moves.

The decision it replaces was "commission tilesets", four weeks and real money.
Look at any fogged shot from `npm run shots`: seventy to ninety per cent of the
board is masked. Illustrated tiles would have bought detail the game
deliberately denies the player.

### The hierarchy was upside down

Ranked by how loud each thing was on screen, before:

| loudest first | what it is | how much it matters |
|---|---|---|
| start marker | saturated tile, white ▶ glyph | irrelevant two seconds in |
| maize | shaded illustrated sprite | important |
| the ball | 12px dot with a highlight | *the whole game* |
| exit | pale grey ⊠ on cream | ends the level |

The exit was the lowest-contrast object in the game. Now: the start is a dim
ring, the exit is lit and breathes, the maize is drawn rather than blitted, and
the ball is a hat.

### The ball is a hat

Chapter five spends the entire emotional payload of the game on this shape — *it
is my hat, and it is the only part of me that has kept going in a straight
line*. For thirteen levels before that it was a circle with a specular
highlight, which is to say a token, and a reveal only lands on a shape somebody
had already been looking at.

It carries a near-white catchlight because four of the eleven grounds light
their walls in amber, and on those an amber hat is a warm shape among warm
shapes. Wherever the player is, the brightest thing on screen is them.

All of its ink stays inside `fillRadius`. The physics clamps the centre to
exactly one radius from a wall, so ink outside that radius reads as clipping
through a wall that is in fact colliding exactly — `ballDrawMetrics` exists so a
test can assert that relationship instead of someone eyeballing a screenshot.

### The maize is drawn, not blitted

It was an illustrated PNG, and on a board of flat strokes it read as a sticker
dropped on a diagram — the one object in the game with shading, among lines with
no shading anywhere. On a lit ground it would have been the only thing not made
of light. It is geometry now: two flat tones, a husk, three kernel rows and a
bloom in the same idiom as the walls. Any more detail than that smears at the
size a cell actually gets.

The sprite is still used in the story cards and the trail map, where it is large
and sits on paper rather than on the board. It was never wrong there.

### In the field, it is night

The play screen takes a dark palette; the level list, the story cards and the
trail map stay warm paper. Every token is a re-point of the variable the light
theme already sets, so no element on that screen needed a second rule.

The split is not only pragmatic. The cards are his voice, remembered and written
down. The field is the dark he is actually walking through.

## The hat is a lantern

Fog used to be a radial gradient: a soft disc centred on the player that did not
care where the walls were, so you saw *through* them. Now the walls occlude it.
You see down a corridor and not through its wall; a dead end goes black as you
pass it; turning a corner is a reveal rather than a redraw.

Built as a second offscreen — a disc of light with a shadow quad cut out of it
for every wall segment inside the reach — then punched out of the fog sheet in
one composite. Only cells within the light are considered, and only the TOP and
LEFT of each is cast, because every interior wall is shared and casting it twice
is wasted work rather than a darker shadow.

**Order is the whole point: shadows cut into *sight*, never into *memory*.** A
corridor you have already walked stays remembered when a wall later comes
between you and it, because you did see it — and the difference between what a
man can see and what he can still remember is the game's actual subject. So the
two are separate passes and only one of them is occluded.

What separates them on screen is no longer brightness but temperature. What he
can see is **warm**, because he is carrying the light: the same sight mask is
re-used for an additive wash, strongest at his feet and gone by the edge of his
reach. What he remembers is that ground gone cold. That is why `MEMORY_ALPHA`
could be thinned rather than thickened.

### Why this was safe to build

`fog` appears nowhere in `solvers.js` or `oracle.js`. The simulated players have
their own map and no vision model at all, so tightening or loosening what a
human can see **cannot make a shipped level unbeatable**. It is the one large
visual change in the game that carries zero risk to the proof, which is why it
was the one to make first.

### Two numbers moved, and why

- **`LANTERN_REACH = 2.2`.** `grid.fog` was tuned for light that ignored walls:
  2.4 meant 2.4 cells of sight in every direction, corridor or not. Once walls
  occlude, that same number lights one room and nothing else, because in a maze
  almost every direction is a wall. Occlusion took over the job of limiting
  sight, so the raw reach grew to suit. Same numbers in `levels.json`, different
  meaning.
- **`MEMORY_ALPHA` 0.45 → 0.35.** Sight collapsed to the room you are in plus
  whatever corridors line up, so the trail behind you stopped being flavour and
  became the map. This had to go thinner, not thicker — a test caught it going
  the wrong way.

### Cost

2.96 ms/frame on the largest board the game ships (18×11 at 48 px), measured
through a *software* canvas; browsers are hardware-accelerated. The frame budget
is 16.7 ms. Canvas 2D holds this comfortably, which is why there is still no
WebGL renderer in this repo.

## Making it kinder without making it a lie

The pause menu has three dials — **hold the board steady**, **see further**,
**ghost hangs back** — and reduced motion is taken from the system on first run,
so a player who has already told their machine what they need does not have to
find a menu to say it again.

The board jolts, the air is opaque, a drone rises as the thing behind you
closes, and it never stops. Those are four reasons to put the game down that
have nothing to do with whether someone wanted to know how it ends.

**The dials cannot reach the proof, and that is the design.** Everything here
rests on every level having been judged beatable by a simulated player, and the
one way to lose that guarantee is to let a setting reach the simulation. So:

1. Every dial is monotone in the player's favour. A wider view and a slower
   hunter cannot turn a solved level unsolvable, and the jolt was never in the
   simulation at all.
2. Nothing in the engine reads the stored settings. `createGame(grid, assist)`
   defaults to `NEUTRAL`, and the solvers call it with **one argument**, as they
   always have — so a shipped campaign is judged against the game as designed,
   whatever is in this player's browser.

`engine/assist.test.js` has a block named *assist cannot reach the proof*. If it
ever fails, a campaign was judged against somebody's accessibility settings.
That is also why the dials live in `engine/` rather than `ui/`: the renderer and
the hunter are what read them, and an engine module importing from the React
shell would be the dependency pointing the wrong way.

Changing a dial takes effect on the next attempt, not the one in progress —
`game.assist` is read by the hunter when it is built, and quietly slowing
something already chasing you would be the game changing its own rules mid-run.

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

## Sound, and feel

Everything is procedural — an oscillator or a filtered noise buffer. No assets.

**Footfalls carry the ground.** Sand and snow already change the physics, so
making them change the footstep teaches the mechanic with nothing written down:
you hear the drag before you have finished wondering why the corner came up
wrong. Sand is bright and dry, ordinary earth is a dull thud, snow is quieter
and lower, and the three are deliberately far apart in brightness. A footfall
fires once per cell crossed, never per frame — sixty a second is a buzz, not a
walk.

**The ghost is audible before it is visible.** A low layer under the ambience
that swells as it closes, which gives the player the one thing a countdown
cannot: which way to run. Pushed from the HUD tick rather than the frame loop,
because it is ramped anyway and audio has no business on the hot path.

**Each terrain has its own air** — a filtered wind bed and a drone, quiet enough
to be noticed only when it changes, which is once a chapter.

The one-shots are fire-and-forget. Those three are a small persistent graph, and
`stopAmbience` on unmount is not housekeeping — a leaked looping node plays
until the tab is closed.

Two pieces of feel:

- **A tail behind the hat**, sampled every few steps rather than every one; at
  full rate it is a solid line, which reads as a smear instead of movement. It
  quietly does a job on the sand too, where the same input covers more ground.
- **A jolt when it goes wrong**, applied to the canvas transform rather than to
  the DOM node — a transform on the element would reflow the page sixty times a
  second. Losing the level shakes harder than losing the walk back.

## Changing the words

**Every line the player reads is in `src/content.js`.** Nothing in that file
does anything — it is data, imported by the engine for the in-level lines and by
the story layer for the cards between levels. Edit a line, reload, done.

| in that file | what it is |
|---|---|
| `PROLOGUE`, `CHAPTER_BEATS`, `BARGAIN`, `TOO_LATE`, `SPEEDRUN_BRIEF`, `ENDING`, `LOST_HER` | the story cards, in the order they are shown |
| `WHISPERS` | fragments heard mid-level, keyed by level name |
| `DEATH_QUIPS`, `CAUGHT_QUIPS` | what the farmer says when it goes wrong |
| `PICKED_ONE`, `PICKED_LAST`, `GHOST_WOKE` | the other in-level lines |

`n('...')` is the farmer and `v('...')` is a voice — the reveal happens in the
gap between them, so a new line belongs to one of those two and not to a
narrator explaining things.

The one exception is chapter **names and blurbs**, which live in
`src/scripts/buildLevels.js` because they are baked into `levels.json` when the
campaign is generated. Change one and run `npm run levels`.

`src/ui/story.js` is now only the sequencing — which beat is owed when — so a
rewrite never means reading logic and a logic change never means scrolling past
prose.

### The cards type themselves out

A wall of text arriving whole reads as something to get past; typed, the farmer
has a pace, and the pauses between his lines and the voices are where the
counterpoint lands. The voices type slower, because they are not sure.

Any key or click fills the card in — nobody should be held at reading speed on
their second time through — and `prefers-reduced-motion` shows the whole thing
at once rather than typing it more slowly.

The visible text is **derived from a cursor**, not accumulated into an array.
The first version appended to state as it went and, when React double-invoked
the effect, produced `['T', undefined, 'papa']` — two overlapping writers
interleaving into one array. A cursor cannot interleave.

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
