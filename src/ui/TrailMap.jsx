import maizeUrl from '../assets/maize.png'
import { TERRAINS } from '../engine/render.js'
import { isDone } from './progress.js'

/**
 * Everything he has walked, in one picture.
 *
 * The premise promised this and the game never delivered it — the bargain
 * showed a number. A number is not thirty-nine fields; it is a receipt for
 * them.
 *
 * Chapters run left to right as bands of the ground they were walked over,
 * sized by how many levels each holds and coloured from the same terrain table
 * the board itself uses, so the strip is literally the journey recoloured. The
 * ears counted underneath are only the ones actually picked, which is why the
 * total on the bargain screen is the player's total and not the game's.
 */
function TrailMap({ levels, compact = false }) {
  const chapters = []
  for (const level of levels) {
    if (!chapters.length || chapters.at(-1).name !== level.chapter) {
      chapters.push({ name: level.chapter, terrain: level.terrain, levels: [] })
    }
    chapters.at(-1).levels.push(level)
  }

  const walked = (level) => isDone(level.name)
  const earsIn = (chapter) =>
    chapter.levels.reduce((sum, l) => sum + (walked(l) ? l.f.length : 0), 0)
  const total = chapters.reduce((sum, c) => sum + earsIn(c), 0)
  const reached = chapters.filter((c) => c.levels.some(walked))

  return (
    <div className={`trail${compact ? ' trail--compact' : ''}`}>
      <div className="trail__strip">
        {chapters.map((chapter) => {
          const ground = TERRAINS[chapter.terrain] ?? TERRAINS.field
          const ears = earsIn(chapter)
          const been = chapter.levels.some(walked)
          return (
            <div
              className={`trail__leg${been ? ' is-walked' : ''}`}
              key={chapter.name}
              style={{ flexGrow: chapter.levels.length, background: ground.bg }}
              title={`${chapter.name} — ${ears} gathered`}
            >
              <span className="trail__marks">
                {chapter.levels.map((level) => (
                  <span
                    key={level.name}
                    className={`trail__mark${walked(level) ? ' is-walked' : ''}`}
                    style={{ background: walked(level) ? ground.wall : 'transparent',
                             borderColor: ground.wall }}
                  />
                ))}
              </span>
              {been && ears > 0 && <span className="trail__ears">{ears}</span>}
            </div>
          )
        })}
      </div>

      <div className="trail__names">
        {chapters.map((chapter) => (
          <span
            className={`trail__name${chapter.levels.some(walked) ? ' is-walked' : ''}`}
            key={chapter.name}
            style={{ flexGrow: chapter.levels.length }}
          >
            {chapter.levels.some(walked) ? chapter.name : ''}
          </span>
        ))}
      </div>

      <div className="trail__total">
        <img src={maizeUrl} alt="" className="trail__ear" />
        <span className="trail__count">{total}</span>
        <span className="trail__unit">
          gathered across {reached.length} {reached.length === 1 ? 'place' : 'places'}
        </span>
      </div>
    </div>
  )
}

export default TrailMap
