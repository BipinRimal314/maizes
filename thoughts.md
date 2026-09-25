# Maizy — design direction

## Keep the game simple

Move, read the ground, follow Maizy's trail, reach the next place. Keep the overhead view and small yellow player silhouette. Let landscape, sound, and a few personal objects carry most of the story.

The current build is a generated maze game: each corn pickup returns the player to the start; unseen traps also send them back; later traps reset gathered corn, and a hunter can end an attempt. These rules make it difficult to feel that the father is following a continuous trail.

## Changes to prototype next

1. **Continuous collection.** Pick up corn without teleporting back to the entrance. Carry it to the exit. Rebuild the solver and hunter timing around this before replacing the existing campaign; its current proofs rely on the reset rule.
2. **Readable danger.** Introduce pits through a visible example, then use cracks, displaced soil, or sound as clues. Fog can conceal a route without making every failure arbitrary.
3. **Progress that survives learning.** In the main story, a fall should return the father to a nearby safe place and preserve collected corn. Establish exactly where each checkpoint is. Reserve stricter resets for an optional challenge mode.
4. **A trail with meaning.** Add one authored landmark per region to the generated layout. Paired corn recalls a shared habit; fireflies recall an unfinished promise. Put these on reachable ground and include them in generation validation.
5. **A shorter pursuit.** Prototype three to five selected crossings rather than repeating all thirteen regions. Use generous authored targets, then offer personal-best racing separately. The shipped copy still describes thirteen because that is what the current build actually requires.
6. **An earned reunion.** Let the player take a few steps beside Maizy after reaching her. Remove the HUD and let the same movement mechanic feel safe.

## First playable slice

Build three connected fields: the broken gate, a foggy junction with paired corn, and the firefly wood. Include continuous collection, one fair hazard, one remembered line, and a short safe ending. Evaluate this slice before extending the redesign across the full campaign.

Success means a new player can explain who left the trail, why the father trusts it, and why a failure happened. They should also be able to notice a story detail without being caught while reading it.

## Board and art

Use the available width for a rectangular field while maintaining readable paths on phones. The earlier notes requested a smaller circle and wider board; measure the current viewport and collision clearance before changing those again.

Aim for a small handmade landscape: dark soil, straw yellow, muted vegetation, warm lamplight, and restrained fireflies. Keep decorative foliage outside walkable paths. Give traversable terrain, walls, pits, and collectibles distinct silhouettes even without colour.

Use Blender for original props and small scene renders, exported to transparent PNGs for the existing 2D renderer. A consistent overhead camera and one lighting setup will help the assets belong together. A full 3D engine migration is unnecessary for this direction.

Start with a hat, corn, broken gate, sack, and cart. The hat must still read as a yellow circle at gameplay size; save the recognisable hat detail for the reveal. Prepare sprites at 64, 128, and 256 pixels and inspect the smallest size on a phone before making more.

See `ASSETS.md` for the download shortlist and Blender brief.

## Work completed versus proposed

Completed: a first rewrite of the story cards and in-game lines in JavaScript and Swift; revised story and design documents; an asset shortlist.

Proposed: the six gameplay changes, new sprites, sound integration, and the three-field slice. These require coordinated changes to the generator, solver, web engine, and native iOS engine. Existing mobile work is already in progress in this checkout.

## Web UI and pacing pass (2026-09-21)

Implemented: an illustrated dusk landscape for the story and journey menu, a prominent continue action, compact gameplay HUD, and responsive desktop/phone layouts. The main campaign now retains twenty of the original thirty fields. Every mechanic introduction and every chapter finale survives; retained fields have identical geometry and names. Existing save records stay intact, while web totals count only the current campaign.

The repetition audit found thirteen consecutive 18×11 fields in the old middle game. Shape changes did not change the collection-and-return task, and later regions mostly tightened the same pressure. This pass removes ten repeat crossings, but continuous collection and varied objectives remain separate gameplay work. The second act still has thirteen crossings.

The visual changes apply to the web UI and Android web build. Native iOS keeps its existing UI.

## Axe campaign (2026-09-22)

The web game now uses `public/campaign-v2.json`: one hundred distinct generated fields in thirteen story regions. `npm run campaign` regenerates this set, and `npm run build` validates/regenerates it before bundling. The earlier twenty-field campaign remains in `public/levels.json` for the native iOS client, which does not yet implement tools. Do not point the native client at the new campaign until its axe, ward, and dynamic-wall rules are ported.

Progression milestones: axe at 7, traps at 9, fog at 14, ghost at 30, sand at 46, snow at 54, fading memory at 62, ward at 71, and the 38×21 finale at 100. Later regions alternate tool routes, ordinary collection, pursuit, and a quiet crossing without the ghost. Adjacent candidates must differ in measured shape; every shipped candidate must pass the structural oracle and real movement simulation.

The axe is a pickup in each timber field. A complete cut across the maze blocks every path to corn and the exit, while leaving a safe route to the axe. Hold toward timber for 450 ms to chop automatically. Stone cannot be cut. Tool state and cleared timber survive a fall or corn pickup, but restart restores the original field. Dev invincibility and continuous collection still work.

The ghost moves at 0.048 cells per simulation step: about 29% of normal walking speed and 42% on snow. It wakes no sooner than 18 seconds, with a longer allowance derived from the solved route. A ward repels contact once and grants ten seconds before the ghost can return. It cannot be picked up again until the field restarts.

Stars reward completion, no falls, and a time goal at 1.8 times the solver's time, rounded up to a second. One star is enough to unlock the next field. There are no lives, purchases, or star gates. The new journey uses a separate browser/desktop save so old geometry and old best times are not mistaken for the new campaign. Legacy saves remain stored.

Dev shortcuts: `?dev=1&level=7`, `?dev=1&level=71`, and `?dev=1&level=100`. Direct level selection is ignored outside dev mode.
