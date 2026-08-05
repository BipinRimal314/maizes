import { useMemo } from 'react'
import { isCompleted, completedCount } from '../engine/progress'
import { levelTags, groupIntoChapters } from '../engine/levelSummary'

/**
 * The level list.
 *
 * The tags describe what a level does to *you*, not which sprite it contains.
 * The old list tagged levels with the emoji of each motor modifier they held —
 * a snowflake for ice, a fart cloud — which advertised exactly the difficulty
 * the design document had already decided to delete.
 */

const CHAPTER_DESCRIPTIONS = {
  1: 'learn the controls. enjoy it while it lasts.',
  2: 'the exits lie and the floor is not always floor.',
  3: 'the fog rolls in. you cannot see, you cannot plan, and something is retracing your steps.',
  4: 'everything at once. curated by genetic algorithm, armed by reinforcement learning.',
}

function LevelCard({ level, onSelect }) {
  const done = isCompleted(level.name)

  return (
    <button className="level-card" onClick={() => onSelect(level.index)}>
      <div className="level-card__top">
        <span className="level-card__number">level {level.index + 1}</span>
        {done && <span className="level-card__done" title="completed">{'\u{2B50}'}</span>}
      </div>
      <span className="level-card__name">{level.name}</span>
      <div className="level-card__tags">
        {levelTags(level).map((tag) => (
          <span key={tag.text} className={`tag tag--${tag.kind}`}>{tag.text}</span>
        ))}
      </div>
    </button>
  )
}

function LevelSelect({ onSelectLevel, onBuild, allLevels, loading }) {
  const chapters = useMemo(() => groupIntoChapters(allLevels), [allLevels])

  if (loading) {
    return (
      <div className="loading">
        <div className="loading__title">mazochist</div>
        <div className="loading__sub">loading suffering…</div>
      </div>
    )
  }

  const done = completedCount()

  return (
    <div className="select">
      <header className="select__masthead">
        <h1 className="select__title">mazochist</h1>
        <p className="select__tagline">
          every maze is solvable. that is the cruel part.
        </p>
        {done > 0 && (
          <div className="select__progress">
            {done} of {allLevels.length} escaped
          </div>
        )}
      </header>

      {chapters.map((chapter) => (
        <section className="chapter" key={chapter.number}>
          <div className="chapter__head">
            <h2 className="chapter__name">{chapter.name}</h2>
            <p className="chapter__desc">{CHAPTER_DESCRIPTIONS[chapter.number] || ''}</p>
          </div>
          <div className="chapter__grid">
            {chapter.levels.map((level) => (
              <LevelCard key={level.index} level={level} onSelect={onSelectLevel} />
            ))}
          </div>
        </section>
      ))}

      <div className="select__footer">
        <button className="btn btn--primary" onClick={onBuild}>build your own maze</button>
      </div>
    </div>
  )
}

export default LevelSelect
