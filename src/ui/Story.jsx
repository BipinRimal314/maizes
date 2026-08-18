import { useEffect } from 'react'
import maizeUrl from '../assets/maize.png'
import TrailMap from './TrailMap.jsx'
import { useTypewriter } from './useTypewriter.js'

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
  const { shown, done, skip } = useTypewriter(beat.lines)

  /*
   * Any key or click fills the card in. Bound to the window rather than to the
   * card so it works wherever the pointer happens to be — a player hammering
   * space to get on with it should not have to aim first.
   */
  useEffect(() => {
    if (done) return undefined
    const fill = (e) => {
      if (e.target?.closest?.('button')) return   // let the button be a button
      skip()
    }
    window.addEventListener('keydown', fill)
    window.addEventListener('pointerdown', fill)
    return () => {
      window.removeEventListener('keydown', fill)
      window.removeEventListener('pointerdown', fill)
    }
  }, [done, skip])

  return (
    <div className="result">
      <div className="card card--story">
        {beat.title && <h2 className="story__title">{beat.title}</h2>}

        <div className="story__lines">
          {beat.lines.map((line, i) => (
            shown[i] === undefined ? null : (
              <p
                key={`${line.v}-${i}-${line.text.slice(0, 12)}`}
                className={
                  `${line.v === 'v' ? 'story__voice' : 'story__narrator'}`
                  + `${!done && i === shown.length - 1 ? ' is-typing' : ''}`
                }
              >
                {shown[i]}
              </p>
            )
          ))}
        </div>

        {done && trail && <TrailMap levels={trail} />}

        {done && maize !== null && (
          <div className="story__tally">
            <img src={maizeUrl} alt="" className="story__ear" />
            <span className="story__count">{maize}</span>
            <span className="story__unit">ears gathered</span>
          </div>
        )}

        <div className="card__actions">
          <button
            className={`btn btn--primary${done ? '' : ' is-waiting'}`}
            onClick={done ? onDone : skip}
          >
            {done ? (actionLabel ?? beat.action ?? 'go on') : 'skip'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Story
