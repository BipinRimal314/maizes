# Journey to Maizy

## The story we are telling

A farmer follows a trail of corn left by his kidnapped daughter. At first he recognises the missing harvest. Then he recognises her way of marking a turn: two ears together, something they used to do to find their way home. The player guides a yellow circle through the fields. Partway through, it is revealed to be the farmer's hat, seen from above.

The rescue is something father and daughter do together. Maizy watches the road, saves what corn she can, and chooses where a sign will help. Her father knows how to work the land; following her asks him to trust someone he is used to protecting.

His regret is ordinary and specific. Last summer she wanted to show him the fireflies. He said there was work to finish. Now her trail takes him into that wood. We do not need a speech explaining what he has learned.

## Character and voice

The father speaks plainly. He notices broken gates, scraped hands, cold ashes, and the weight of a sack. Fear affects what he notices and what he leaves unsaid. Avoid elaborate rustic curses, constant cryptic denial, and a profound sentence after every event.

Maizy has practical knowledge and curiosity. Her signs are deliberate. Her dialogue should include things she wants, remembers, and does, not only calls for help. At the reunion, she asks whether he found her marks.

The bandit leader counts supplies, carts, and distances. His concern is getting the stolen goods away. His cruelty is taking the corn before admitting the cart has already left. He needs only a few lines.

Some voices are remembered; others are overheard. Keep their context understandable. The current hunter remains an unexplained threat; the revised design should establish it as a pursuing lookout before treating its presence as part of the plot.

## The journey

1. **The field:** a broken gate, spilled corn, a familiar pair of ears at a turn. Establish a small personal connection before explaining the abduction.
2. **Beyond the farm:** overheard bandits reveal that they took the girl. Her marks become a conversation across the distance.
3. **Fog and pursuit:** the father needs help finding his feet. Reveal the hat through the player's viewpoint, without claiming that it moves separately from him.
4. **Wind and snow:** the journey takes a physical toll. The shawl inside his coat is useful evidence of his concern, not a repeated symbol in every scene.
5. **The firefly wood:** a place she wanted to share with him. He follows her chosen direction instead of his own familiar route.
6. **The abandoned camp:** cold ashes show that he is behind. A fresh mark gives him a reason to continue.
7. **The bargain:** he offers all the recovered corn for his daughter. The bandit takes it, then says she left on the first cart.
8. **The pursuit:** fresh wheel tracks lead away. The road bends around familiar fields; he can cross them faster than the cart can go around. There is no rewind and no resurrection. The current thirteen-field time challenge represents these shortcuts.
9. **The reunion:** she recognises the hat. Her first question is whether he found her marks. End with the father's original line: “Thank you for helping me reach my daughter.”

## Depth through play — proposed design

Make a few marks visibly intentional: paired corn at a junction, husks pointing towards shelter, a strip of cloth where the corn runs out. These are authored story landmarks, distinct from the generated collectible placement. Each should communicate direction or character before asking the player to read.

An optional quiet moment in each region can recall one concrete memory. It must not cost time in the rescue challenge. Never make a player choose between reading about Maizy and saving her.

At the end, a short walk together would let the player experience the rescue. She could lead him back through the lights. This is a proposed epilogue, not implemented gameplay.

## Failure and second chances

Falls are setbacks, not canonical deaths. Avoid blaming the player for the kidnapping or saying that one slow attempt kills Maizy. A failed pursuit attempt can be retried.

The current game has an optional ending where the father stops looking. Its revised text is restrained. For the redesign, replace the prominent surrender choice with “Rest here” and allow continuation; a permanent tragic ending needs more justification than a difficult maze.

## Implementation status

The first copy pass is in `src/content.js` and its native mirror, `ios/Maizes/Content.swift`. It preserves existing chapter IDs, progression, and timing rules. The environmental signs, lookout presentation, rest flow, and playable epilogue above are design proposals. They are not present in the engine yet.

## The hundred-field build

The story now spans one hundred web levels, with each existing chapter ending at a regional milestone. The original hat reveal follows field 37, and the bargain follows field 100. The thirteen-crossing pursuit remains the second act, rather than asking for all one hundred fields again.

The axe introduces the father's practical abilities early: finding a route is sometimes only the first part of opening it. Its first lesson is at field 7, away from the ghost. The ward arrives much later, in the firefly wood at field 71, as a brief means of protection rather than a weapon that removes pursuit altogether. Both have short playable lessons that pause the clock until the player is ready.
