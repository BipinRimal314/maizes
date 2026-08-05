/**
 * Player telemetry — records behavioral data per level attempt.
 * Stored in localStorage. Used for Phase 4 adaptive difficulty.
 *
 * Tracks: movement patterns, deaths, hesitation, backtracking,
 * trap hit rate, time per section, decision speed at intersections.
 */

const STORAGE_KEY = 'mazochist_telemetry'
const MAX_SESSIONS = 200

function createSession(levelIndex, levelName, era) {
  return {
    levelIndex,
    levelName,
    era,
    startedAt: Date.now(),
    endedAt: null,
    completed: false,
    deaths: 0,
    deathPositions: [],
    trapHits: 0,
    fakeExitHits: 0,
    totalSteps: 0,
    backtracks: 0,
    pathHistory: [],        // sampled positions every 500ms
    hesitations: 0,         // times player stopped moving for >2s
    directionChanges: 0,
    firstMoveDirection: null,
    timeToFirstDeath: null,
    timeToCompletion: null,
    gatesPassed: 0,
    cellsVisited: new Set(),
  }
}

function recordPosition(session, x, y) {
  const now = Date.now()
  const last = session.pathHistory[session.pathHistory.length - 1]

  // sample every 500ms
  if (last && now - last.t < 500) return session

  const cellKey = `${Math.floor(x)},${Math.floor(y)}`
  const newVisited = new Set(session.cellsVisited)
  newVisited.add(cellKey)

  // detect backtrack (visiting a cell we've been to recently)
  let backtracks = session.backtracks
  if (last) {
    const lastKey = `${Math.floor(last.x)},${Math.floor(last.y)}`
    if (cellKey !== lastKey && session.cellsVisited.has(cellKey)) {
      backtracks++
    }
  }

  // detect hesitation (no movement for >2s)
  let hesitations = session.hesitations
  if (last && now - last.t > 2000) {
    const dx = Math.abs(x - last.x)
    const dy = Math.abs(y - last.y)
    if (dx < 2 && dy < 2) {
      hesitations++
    }
  }

  // detect direction change
  let directionChanges = session.directionChanges
  if (session.pathHistory.length >= 2) {
    const prev = session.pathHistory[session.pathHistory.length - 2]
    const dx1 = Math.sign(last.x - prev.x)
    const dy1 = Math.sign(last.y - prev.y)
    const dx2 = Math.sign(x - last.x)
    const dy2 = Math.sign(y - last.y)
    if ((dx1 !== dx2 || dy1 !== dy2) && (dx2 !== 0 || dy2 !== 0)) {
      directionChanges++
    }
  }

  // first move direction
  let firstMove = session.firstMoveDirection
  if (!firstMove && last) {
    const dx = x - last.x
    const dy = y - last.y
    if (Math.abs(dx) > Math.abs(dy)) {
      firstMove = dx > 0 ? 'right' : 'left'
    } else if (Math.abs(dy) > 0) {
      firstMove = dy > 0 ? 'down' : 'up'
    }
  }

  return {
    ...session,
    totalSteps: session.totalSteps + 1,
    pathHistory: [...session.pathHistory, { x, y, t: now }],
    cellsVisited: newVisited,
    backtracks,
    hesitations,
    directionChanges,
    firstMoveDirection: firstMove,
  }
}

function recordDeath(session, x, y, cause) {
  const now = Date.now()
  return {
    ...session,
    deaths: session.deaths + 1,
    deathPositions: [...session.deathPositions, { x, y, cause, t: now }],
    trapHits: cause === 'trap' ? session.trapHits + 1 : session.trapHits,
    fakeExitHits: cause === 'fakeExit' ? session.fakeExitHits + 1 : session.fakeExitHits,
    timeToFirstDeath: session.timeToFirstDeath || (now - session.startedAt),
  }
}

function recordGatePass(session) {
  return { ...session, gatesPassed: session.gatesPassed + 1 }
}

function endSession(session, completed) {
  const now = Date.now()
  return {
    ...session,
    endedAt: now,
    completed,
    timeToCompletion: completed ? now - session.startedAt : null,
  }
}

function sessionToStorable(session) {
  return {
    ...session,
    cellsVisited: session.cellsVisited.size,
    pathHistory: session.pathHistory.length,
    deathPositions: session.deathPositions,
  }
}

function saveSession(session) {
  const storable = sessionToStorable(session)
  const existing = loadAllSessions()
  existing.push(storable)

  // keep only last MAX_SESSIONS
  const trimmed = existing.slice(-MAX_SESSIONS)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full — trim harder
    const halved = trimmed.slice(-Math.floor(MAX_SESSIONS / 2))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(halved))
  }
}

function loadAllSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function getPlayerProfile() {
  const sessions = loadAllSessions()
  if (sessions.length === 0) return null

  const completed = sessions.filter((s) => s.completed)
  const recent = sessions.slice(-20)

  return {
    totalSessions: sessions.length,
    completionRate: completed.length / sessions.length,
    avgDeaths: sessions.reduce((a, s) => a + s.deaths, 0) / sessions.length,
    avgTrapHits: sessions.reduce((a, s) => a + s.trapHits, 0) / sessions.length,
    avgBacktracks: sessions.reduce((a, s) => a + s.backtracks, 0) / sessions.length,
    avgHesitations: sessions.reduce((a, s) => a + s.hesitations, 0) / sessions.length,
    avgDirectionChanges: sessions.reduce((a, s) => a + s.directionChanges, 0) / sessions.length,
    preferredFirstMove: mostCommon(sessions.map((s) => s.firstMoveDirection).filter(Boolean)),
    recentCompletionRate: recent.filter((s) => s.completed).length / recent.length,
    recentAvgDeaths: recent.reduce((a, s) => a + s.deaths, 0) / recent.length,
    // skill estimate: higher = better player
    skillEstimate: Math.min(1.0, (completed.length / Math.max(sessions.length, 1)) * 0.5
      + (1 / Math.max(sessions.reduce((a, s) => a + s.deaths, 0) / sessions.length, 1)) * 0.5),
  }
}

function mostCommon(arr) {
  if (arr.length === 0) return null
  const counts = {}
  for (const v of arr) {
    counts[v] = (counts[v] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export {
  createSession,
  recordPosition,
  recordDeath,
  recordGatePass,
  endSession,
  saveSession,
  loadAllSessions,
  getPlayerProfile,
}
