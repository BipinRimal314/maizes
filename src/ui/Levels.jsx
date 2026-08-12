import { isDone, bestFor, doneCount } from './progress.js'

/** The level list, grouped by chapter. */
function Levels({ levels, onPick }) {
  const chapters = []
  for (const [index, level] of levels.entries()) {
    let chapter = chapters[chapters.length - 1]
    if (!chapter || chapter.name !== level.chapter) {
      chapter = { name: level.chapter, blurb: level.blurb, levels: [] }
      chapters.push(chapter)
    }
    chapter.levels.push({ ...level, index })
  }

  const done = doneCount()

  return (
    <div className="levels">
      <header className="levels__head">
        <h1 className="levels__title">puzzles</h1>
        <p className="levels__tag">why is it called puzzles? that&rsquo;s the puzzle.</p>
        {done > 0 && <p className="levels__progress">{done} of {levels.length} escaped</p>}
      </header>

      {chapters.map((chapter) => (
        <section className="chapter" key={chapter.name}>
          <h2 className="chapter__name">{chapter.name}</h2>
          <p className="chapter__blurb">{chapter.blurb}</p>
          <div className="chapter__grid">
            {chapter.levels.map((level) => {
              const best = bestFor(level.name)
              return (
                <button className="card-level" key={level.name} onClick={() => onPick(level.index)}>
                  <span className="card-level__top">
                    <span className="card-level__n">{level.index + 1}</span>
                    {isDone(level.name) && <span className="card-level__done">{'\u{2B50}'}</span>}
                  </span>
                  <span className="card-level__tags">
                    <span className="tag tag--flag">{level.grid.flags.length} flags</span>
                    {level.grid.traps.length > 0 && (
                      <span className="tag tag--trap">{level.grid.traps.length} traps</span>
                    )}
                    {level.grid.fog !== null && <span className="tag tag--fog">fog</span>}
                    {level.grid.hunter && <span className="tag tag--hunter">hunted</span>}
                  </span>
                  {best && <span className="card-level__best">best: {best.deaths} deaths</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default Levels
