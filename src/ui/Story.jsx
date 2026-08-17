import maizeUrl from '../assets/maize.png'

/**
 * One story card.
 *
 * Deliberately dumb: it renders a beat and calls back when the player is done
 * reading. All of the sequencing lives in App, so a beat cannot accidentally
 * decide what happens next.
 */
function Story({ beat, maize = null, onDone, actionLabel }) {
  return (
    <div className="result">
      <div className="card card--story">
        {beat.title && <h2 className="story__title">{beat.title}</h2>}

        <div className="story__lines">
          {beat.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

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
