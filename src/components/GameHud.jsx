import { formatClock, threatPills } from '../engine/format'

/**
 * The status readout above the board.
 *
 * Flags get their own tile. They used to be folded into the death counter —
 * capturing one incremented `deaths`, so the tile labelled "setbacks" went up
 * when the player did exactly what the level asked. Progress and failure are
 * two different numbers and now look like it.
 */
function GameHud({ hud }) {
  const hasFlags = hud.flagsTotal > 0

  return (
    <>
      <div className={`hud${hasFlags ? ' hud--three' : ''}`}>
        <div className="hud__tile">
          <div className="hud__label">suffering duration</div>
          <div className="hud__value">{formatClock(hud.now)}</div>
        </div>

        {hasFlags && (
          <div className={`hud__tile hud__tile--flags${hud.exitUnlocked ? ' hud__tile--complete' : ''}`}>
            <div className="hud__label">flags</div>
            <div className="hud__value hud__value--flags">
              {hud.flagsCaptured}<span className="hud__of">/{hud.flagsTotal}</span>
            </div>
          </div>
        )}

        <div className="hud__tile">
          <div className="hud__label">setbacks</div>
          <div className="hud__value hud__value--deaths">
            {hud.deaths}
            {hud.deaths > 0 && <span className="hud__aside">(ouch)</span>}
          </div>
        </div>
      </div>

      <div className="pills">
        {threatPills(hud).map((pill) => (
          <span key={pill.key} className={pill.className}>{pill.text}</span>
        ))}
      </div>
    </>
  )
}

export default GameHud
