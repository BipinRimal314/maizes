import {
  totals, speedrunActive, speedrunFinished, speedrunProgress, maizeCollected, speedrunGaveUp,
} from './progress.js'
import TrailMap from './TrailMap.jsx'

function duration(ms) {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * The end of the campaign.
 *
 * Totals come from the stored best run of each level rather than from this
 * sitting, so they survive a reload and mean something — "your best of every
 * level, added up" is a number worth chasing down.
 */
function Finale({ levels = [], total, onBack, onConcede = null }) {
  const stats = totals()
  const complete = stats.levels >= total
  const rescued = speedrunFinished()
  const conceded = speedrunGaveUp()
  const racing = speedrunActive() && !rescued
  const run = racing ? speedrunProgress(levels) : null

  return (
    <div className="result">
      <div className="card card--finale">
        <div className="card__emoji">
          {rescued ? '\u{1F33D}' : conceded ? '\u{1F342}' : racing ? '\u{1F3C3}' : '\u{1F3C1}'}
        </div>
        <h2 className="card__title">
          {rescued
            ? 'you got her back.'
            : conceded
              ? 'he went home.'
              : racing ? 'still running.' : 'that\u2019s all of them.'}
        </h2>
        <p className="card__sub">
          {rescued
            ? 'every field, twice, and the second time fast enough.'
            : conceded
              ? 'the fields are still there. so is the gate, and the gap in the hedge.'
            : racing
              ? `${run.beaten} of ${run.total} fields beaten. the rest are still slower than they were.`
              : complete
                ? 'thirty mazes, every ear of maize in them, and the thing in the dark. all of it.'
                : 'you reached the end. some levels back there are still waiting for you.'}
        </p>

        <div className="card__stats">
          <div className="stat">
            <span className="stat__label">cleared</span>
            <span className="stat__value">{stats.levels}<span className="hud__of">/{total}</span></span>
          </div>
          <div className="stat">
            <span className="stat__label">best time</span>
            <span className="stat__value">{duration(stats.ms)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">{levels.length > 0 ? 'maize' : 'deaths'}</span>
            <span className="stat__value">
              {levels.length > 0 ? maizeCollected(levels) : stats.deaths}
            </span>
          </div>
        </div>

        <p className="card__note">
          {stats.flawless > 0
            ? `${stats.flawless} of them without dying once.`
            : 'not one clean run. there is still something left to do.'}
        </p>

        {levels.length > 0 && <TrailMap levels={levels} compact />}

        {rescued
          ? (
            <p className="card__punchline">
              &ldquo;thank you for helping me reach my daughter.&rdquo;
              <br />
              <span className="card__punchline-answer">&mdash; the farmer</span>
            </p>
          )
          : (
            <p className="card__punchline">
              so why is it called <em>maizes</em>?
              <br />
              <span className="card__punchline-answer">that&rsquo;s the puzzle.</span>
            </p>
          )}

        <div className="card__actions">
          <button className="btn btn--primary" onClick={onBack}>levels</button>
          {/* only while the run is still winnable: an ending you choose, never
              one you are handed for being slow */}
          {racing && !conceded && onConcede && (
            <button className="btn" onClick={onConcede}>stop looking</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Finale
