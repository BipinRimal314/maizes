import { formatClock, threatPills } from '../engine/format'

/**
 * The status readout above the board. Pure presentation — it receives the HUD
 * snapshot and renders it, and knows nothing about the simulation.
 */
function GameHud({ hud }) {
  return (
    <>
      <div className="hud">
        <div className="hud__tile">
          <div className="hud__label">suffering duration</div>
          <div className="hud__value">{formatClock(hud.now)}</div>
        </div>
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
