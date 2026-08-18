import maizeUrl from '../assets/maize.png'
import TrailMap from './TrailMap.jsx'

/**
 * One story card.
 *
 * Deliberately dumb: it renders a beat and calls back when the player is done
 * reading. All of the sequencing lives in App, so a beat cannot accidentally
 * decide what happens next.
 *
 * The two voices are set differently on purpose. The farmer is body text; the
 * voices are indented, lighter and italic, as though heard past him rather than
 * from him. The whole story is carried by the gap between what he says and what
 * they say, so if the reader cannot tell them apart at a glance there is no
 * gap — just a paragraph.
 */
function Story({ beat, maize = null, trail = null, onDone, actionLabel }) {
  return (
    <div className="result">
      <div className="card card--story">
        {beat.title && <h2 className="story__title">{beat.title}</h2>}

        <div className="story__lines">
          {beat.lines.map((line, i) => (
            <p
              key={`${line.v}-${i}-${line.text.slice(0, 12)}`}
              className={line.v === 'v' ? 'story__voice' : 'story__narrator'}
            >
              {line.text}
            </p>
          ))}
        </div>

        {trail && <TrailMap levels={trail} />}

        {maize !== null && (
          <div className="story__tally">
            <img src={maizeUrl} alt="" className="story__ear" />
            <span className="story__count">{maize}</span>
            <span className="story__unit">ears gathered</span>
          </div>
        )}

        <div className="card__actions">
          <button className="btn btn--primary" onClick={onDone}>
            {actionLabel ?? beat.action ?? 'go on'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Story
