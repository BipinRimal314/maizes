# Journey to Maizy — campaign revamp

The web campaign retains 100 fields and existing unlocks, with new layouts and rules. Old best times are preserved as historical completion data, but do not award stars against the new layouts.

## What changes the decisions

- **89 continuous fields:** corn stays collected without sending the farmer home. Route order matters and the ghost’s clock keeps running.
- **11 return-trip fields:** deliberately keep the old collection reset. Their introduction and field guide explain the different rule.
- **20 optional timber shortcuts:** the longer route is verified open without the axe. Cutting saves at least five grid steps on a route to an objective, but the noise attracts an active ghost.
- **Required timber fields:** retain the early axe-before-corn lesson and later gating puzzles.
- **Quiet discoveries:** keep breathing room between hunted stretches. There are 27 authored discoveries across the campaign, saved in a journal accessible from Pause and the level screen.
- **Search and cover:** ghosts see down open corridors, remember the last seen position, investigate chopping, and search adjacent corridors after reaching the remembered spot. Turning corners breaks sight. Standing still in marked green brush hides the farmer; contact still catches him. Easy sight is five cells, Difficult nine.
- **Readable traps:** cracks and disturbed soil are drawn in the world, underneath fog. Dev mode alone retains red crosses and full-map reveal.
- **Final field:** requires three of Maizy’s trail markers and all maize, with an axe, timber, ghost, shelters, and ward. The journal discoveries focus on trust and her resourcefulness.

Death/catch, chopping, falling timber, discoveries, pickups, and ghost wake have distinct audio cues. Timber breaking also flashes the cleared tile. Lessons appear once per mechanic; Pause always contains a field guide. Dev tutorials are tracked separately.

## Saves and testing

The existing `maizes:journey-v2` save retains shared normal-play unlocks and historical story completion. New performance records, journals, and pursuit targets live under revision-specific Easy/Difficult profiles, with separate dev profiles. Dev wins do not grant new normal-play unlocks. Earlier unlabelled records cannot reliably be classified as dev or real runs, so existing unlocks are retained rather than deleted.

The generator validates all 100 fields; tests run the real movement/chopping simulation on both difficulty variants. Tests also cover continuous versus return pickups, sight blocked by walls, remembered positions, sound investigation, hiding without immunity, required finale markers, persistent journals, and record isolation. Browser checks cover desktop and phone, introduction flow, journal, search state, pickups, and normal/dev separation.

## What still needs human playtesting

The campaign still uses deterministic generated mazes; it is not 100 individually handcrafted puzzles. Solvability and route savings do not establish enjoyment. Compare fields 7 (axe), 16 (return trips), 23 (shortcut), 30 (search), 33 (quiet discovery), 71 (ward), and 100 (finale). Check whether clues are legible, shelters are useful, chopping is worth its noise, and long fields feel tense rather than tiring. The ghost uses corridor sight and a simple local search, not a complete patrol simulation. Sound output still needs listening on target devices.

These changes target the React web game and wrappers using its build. The separate native Swift game has not been ported.
