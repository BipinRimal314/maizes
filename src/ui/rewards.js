/** Replay goals never gate the next field or the story. */
export function targetMs(level) {
  const seconds = level.difficulty?.perfectSeconds
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1.8) * 1000 : null
}
export function starsFor(level, run) {
  if (!run) return 0
  const target = targetMs(level)
  return 1 + (run.deaths === 0 ? 1 : 0) + (target !== null && run.ms <= target ? 1 : 0)
}
