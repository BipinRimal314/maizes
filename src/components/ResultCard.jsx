import { formatClock, getGrade, GRADE_BACKGROUNDS } from '../engine/format'

/** The victory / shame screen. */
function ResultCard({ deaths, elapsedMs, hiddenWord, onNextLevel, onBack, backLabel }) {
  const seconds = Math.floor(elapsedMs / 1000)
  const { grade, label } = getGrade(deaths, seconds)
  const clean = deaths < 5

  return (
    <div className="result">
      <div className="result__card">
        <div className="result__body">
          <div className="result__emoji">
            {deaths < 5 ? '\u{1F389}' : deaths < 20 ? '\u{1F605}' : '\u{1F480}'}
          </div>

          <h2 className="result__headline">
            {clean ? 'you actually escaped!' : 'you escaped. eventually.'}
          </h2>
          <p className="result__sub">
            {clean ? 'show-off.' : '“at least you didn’t quit. yet.”'}
          </p>

          {hiddenWord && <div className="result__word">“{hiddenWord}”</div>}

          <div className="result__stats">
            <div className="result__stat">
              <div className="result__stat-label">time</div>
              <div className="result__stat-value">{formatClock(elapsedMs)}</div>
            </div>
            <div className="result__stat result__stat--deaths">
              <div className="result__stat-label">setbacks</div>
              <div className="result__stat-value">{deaths}</div>
            </div>
          </div>

          <div className="result__grade" style={{ background: GRADE_BACKGROUNDS[grade] }}>
            <div className="result__stat-label">rank</div>
            <div className="result__grade-letter">{grade}</div>
            <div className="result__grade-label">{label}</div>
          </div>

          <div className="result__actions">
            {onNextLevel && (
              <button className="btn btn--primary" onClick={onNextLevel}>next level</button>
            )}
            <button className="btn btn--ghost" onClick={onBack}>{backLabel}</button>
          </div>
        </div>

        <div className="result__footer">mazochist — lovingly crafted suffering</div>
      </div>
    </div>
  )
}

export default ResultCard
