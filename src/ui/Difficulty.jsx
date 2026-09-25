import { DIFFICULTIES } from '../engine/difficulty.js'

export default function Difficulty({ value = 'easy', onChange, restart = false }) {
  return (
    <fieldset className="difficulty">
      <legend>Difficulty</legend>
      <div className="difficulty__choices">
        {Object.entries(DIFFICULTIES).map(([id, mode]) => (
          <button key={id} type="button" aria-pressed={value === id}
            onClick={() => onChange?.(id)}>{mode.label}</button>
        ))}
      </div>
      <p>{DIFFICULTIES[value].description}{restart ? ' Changing difficulty restarts this field.' : ' Unlocks are shared. Times and stars belong to this difficulty. Earlier unlocks are kept; new runs earn new records.'}</p>
    </fieldset>
  )
}
