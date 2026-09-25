# Maizy asset shortlist

Verified against the publisher pages on 2026-09-21. Download these two free packs first. Both pages identify their assets as CC0. Keep the supplied licence file with each download. No packs have been downloaded or integrated in this pass.

| Pack | Use | Source |
| --- | --- | --- |
| Kenney Nature Kit | Source trees, rocks, and foliage for the Blender art prototype; select a few shapes and unify their materials before rendering. | https://kenney.nl/assets/nature-kit |
| Kenney Impact Sounds | Audition quiet wood/ground impacts for collisions and physical feedback. Final sound choices require listening to the files. | https://kenney.nl/assets/impact-sounds |

Optional: [Kenney Foliage Sprites](https://kenney.nl/assets/foliage-sprites), also listed as CC0, if we need 2D grass/foliage elements. Do not add it simply to increase visual density.

Keep archives and originals under a local `art/source/` directory while evaluating them. Only ship selected, optimised exports under `src/assets/`; record source URL, original filename, licence, and modifications for each selected file. Mirror the final exports into the native app's asset catalog when integrated.

## Original assets for Blender

Model these specifically for Maizy so the objects carrying the story share a visual language:

- Yellow straw hat: plain circular silhouette at gameplay scale; bent brim visible in the story reveal.
- Corn ear: readable yellow mass, two or three green husk shapes. Replace the existing sprite only when the new render reads clearly at actual size.
- Broken gate: establish the disturbance at home without a paragraph of explanation.
- Cloth sack and handcart: connect the harvest, bargain, and pursuit.
- Small shawl: use in a story vignette rather than as another collectible.

Use an orthographic overhead camera for gameplay props, transparent backgrounds, warm neutral lighting, and one consistent shadow direction. Export 64/128/256 px variants; retain the `.blend` source. Prepare story vignettes separately so the gameplay sprites stay legible.

Blender is installed on this machine. No Blender scene or renders were created in this writing/design pass. The first useful Blender deliverable is one hat-and-corn style sheet, not an entire environment.

## Audio to develop after the slice

The existing game has procedural audio. Keep it while testing pacing. Later, audition or record corn husks, cloth movement, restrained footsteps, a distant cart, wind, and night insects. The impact pack is a starting point for physical sounds; it is not a complete ambience library.

Let a recognisable cart sound motivate the pursuit. Let the wood grow quiet enough to hear the fireflies' environment without a constant music swell. Commission or select music only after the length and emotional pacing of the slice are known.
