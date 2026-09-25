import { drawLandmarks } from './landmarks.js'
/**
 * Canvas rendering. The only module that thinks in pixels.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * `ballDrawMetrics` keeps the ball's ink inside its collision radius. The
 * physics clamps the centre to exactly one radius from a wall, so a rim stroked
 * *on* that radius puts half its width into the wall and the ball looks like it
 * is clipping through when the collision is exact to 1e-9. It is a function so a
 * test can assert the relationship instead of someone eyeballing a screenshot.
 *
 * Walls are drawn thin and without a downward shadow offset for the same
 * reason: ink that leans into the player's cell reads as penetration.
 */

import { TOP, RIGHT, BOTTOM, LEFT, wallsAt, key, SAND, SNOW } from './grid.js'
import { wakeProgress } from './hunter.js'
import { fxProgress, latestFx } from './fx.js'

// easing, for the handful of things that move on their own
const easeOut = (t) => 1 - (1 - t) ** 3
const easeIn = (t) => t ** 3
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2
const clamp01 = (t) => Math.max(0, Math.min(1, t))

const COLORS = {
  start: '#2f6f74',
  startGlyph: 'rgba(255,255,255,0.35)',
  exit: '#48e08a',
  exitGlow: 'rgba(72, 224, 138, 0.8)',
  exitLocked: '#4a4a44',
  maize: '#f7b733',
  maizeDeep: '#d8901a',
  maizeHusk: '#5fae4a',
  maizeGlow: 'rgba(247, 183, 51, 0.7)',
  maizeTaken: 'rgba(255,255,255,0.16)',
  hat: '#ffd23f',
  hatHot: '#fffbe8',
  hatBand: '#7a4a12',
  hatRim: 'rgba(255, 240, 190, 0.9)',
  hatGlow: 'rgba(255, 210, 63, 0.85)',
  trapFlash: '#ff5347',
  trapWash: 'rgba(255, 83, 71, 0.18)',   // dev overlay only

  captureFlash: '#ffc53d',
  hunter: '#f2f0ff',
  hunterEye: '#241426',
  hunterAura: '229, 57, 53',
}

/**
 * Terrain: the ground a chapter is walked over.
 *
 * Presentation only — it repaints the board and nothing else, so no level's
 * proof depends on it.
 *
 * LIT FROM WITHIN
 *
 * Every ground here is dark and every wall emits light. That is not a mood
 * choice, it is what the game already is: most of the board is under fog at any
 * moment, and fog over a cream page can only ever be a grey smear laid on top
 * of a drawing. Fog over a dark ground is simply the dark you have not reached
 * yet, which is the thing the fiction has been describing for eleven chapters.
 *
 * The Lit Wood was drawn this way first and was, by a distance, the only board
 * in the game that looked designed. This is that chapter's principle taken
 * everywhere, with a hue per terrain so the journey still visibly moves.
 *
 * The start, the exit, the maize and the ball keep their own colours on every
 * terrain — those four are how the player reads the board, and re-tinting them
 * per chapter would re-teach the vocabulary every time the scenery changed.
 */
const TERRAINS = {
  field:  { bg: '#14100a', grid: '#221b10', wall: '#f0b357', glow: 'rgba(240, 179, 87, 0.39)', fog: '10, 8, 5' },
  track:  { bg: '#17110a', grid: '#251c11', wall: '#e0a049', glow: 'rgba(224, 160, 73, 0.36)', fog: '12, 9, 5' },
  dusk:   { bg: '#100e1a', grid: '#1c1930', wall: '#b9a8e8', glow: 'rgba(185, 168, 232, 0.39)', fog: '8, 7, 14' },
  woods:  { bg: '#0b120d', grid: '#152018', wall: '#a8cf9a', glow: 'rgba(168, 207, 154, 0.36)', fog: '5, 9, 6' },
  night:  { bg: '#0a0e1a', grid: '#141a2c', wall: '#a8c4e8', glow: 'rgba(168, 196, 232, 0.39)', fog: '5, 7, 13' },
  ridge:  { bg: '#121316', grid: '#1e2026', wall: '#e6e2d6', glow: 'rgba(230, 226, 214, 0.33)', fog: '9, 10, 12' },
  marsh:  { bg: '#0a1010', grid: '#14201c', wall: '#8fbf8a', glow: 'rgba(143, 191, 138, 0.33)', fog: '5, 8, 8' },
  ember:  { bg: '#170a08', grid: '#26120d', wall: '#ff8a4c', glow: 'rgba(255, 138, 76, 0.41)', fog: '11, 5, 4' },

  desert: { bg: '#1a1008', grid: '#2a1c0e', wall: '#f5c169', glow: 'rgba(245, 193, 105, 0.39)', fog: '13, 8, 4' },
  snow:   { bg: '#0a1220', grid: '#142034', wall: '#dcecff', glow: 'rgba(220, 236, 255, 0.39)', fog: '5, 9, 16' },

  // where it started: the coldest light in the game, and the only green one
  enchanted: {
    bg: '#0d0b1a',
    grid: '#1b1733',
    wall: '#7df9e2',
    glow: 'rgba(80, 240, 205, 0.47)',
    fog: '6, 5, 14',
  },
}

const terrainOf = (grid) => TERRAINS[grid?.terrain] ?? TERRAINS.field

/**
 * Ground that changes the physics, and therefore has to be visible.
 *
 * Everything else a terrain does is decoration. These two are not: sand throws
 * the ball along half again as fast and snow costs it nearly a third, so a
 * player who cannot see the edge of a patch is being asked to explain a corner
 * they just overshot. Filled flat under the walls, no border — a patch is a
 * place, not an object sitting on the board.
 */
const SURFACE_TINTS = {
  [SAND]: 'rgba(232, 168, 56, 0.16)',
  [SNOW]: 'rgba(150, 200, 240, 0.18)',
}

/** Texture colours distinguish ground from solid collision walls. */
const SURFACE_EDGES = {
  [SAND]: 'rgba(245, 190, 95, 0.75)',
  [SNOW]: 'rgba(160, 215, 255, 0.75)',
}

function drawSurfaces(ctx, grid, cellSize) {
  if (!grid.surface) return
  // Texture stays inside each tile. A continuous patch outline looks like a
  // collision wall, even though the player can cross it freely.
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const kind = grid.surface[y * grid.cols + x]
      if (!SURFACE_TINTS[kind]) continue
      const px = x * cellSize
      const py = y * cellSize
      ctx.fillStyle = SURFACE_TINTS[kind]
      ctx.fillRect(px, py, cellSize, cellSize)
      ctx.fillStyle = SURFACE_EDGES[kind]
      const grain = Math.max(1, cellSize * 0.025)
      for (const [dx, dy] of [[0.25, 0.3], [0.7, 0.5], [0.4, 0.75]]) {
        ctx.fillRect(px + dx * cellSize, py + dy * cellSize,
          grain * (kind === SAND ? 2 : 1), grain)
      }
    }
  }
}

const WALL_WIDTH = 0.06
const MARKER_INSET = 0.14
/**
 * How much fog is left over a cell you have already walked.
 *
 * This was 0.76 — a trail that cleared less than a quarter of the sheet. It
 * read as "dimly remembered" on the original warm, light fog and as nothing at
 * all once the terrains arrived: on `night`, at rgba(22, 26, 40), three
 * quarters of near-black over your own path is just black, and the tighter fog
 * radius made that path the main thing you navigate by. A remembered cell has
 * to be obviously lighter than an unwalked one, and obviously darker than the
 * circle you are standing in.
 */
/**
 * How much fog is left over ground you have already walked.
 *
 * Thinner than it was, and it had to go this way rather than the other. Once
 * walls started casting shadows, sight collapsed to the room you are standing
 * in plus whatever corridors happen to line up — so the trail behind you
 * stopped being flavour and became the map. A veil that read as "dimly
 * remembered" over a cream board reads as nothing at all over near-black.
 *
 * What separates seeing from remembering is no longer brightness, which is why
 * this can afford to be thin: what he can see is *warm*, because he is carrying
 * the light. What he remembers is the same ground gone cold.
 */
const MEMORY_ALPHA = 0.35

/** Ink geometry for the ball. `outerEdge` must never exceed the collision radius. */
function ballDrawMetrics(radius, cellSize) {
  const r = radius * cellSize
  const rimWidth = Math.max(1.25, cellSize * 0.06)
  const rimRadius = Math.max(r * 0.4, r - rimWidth / 2)
  return { fillRadius: r, rimRadius, rimWidth, outerEdge: rimRadius + rimWidth / 2 }
}

function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const w = Math.round(cssWidth * dpr)
  const h = Math.round(cssHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}


/**
 * One ear of maize, drawn rather than blitted.
 *
 * This used to be an illustrated PNG, and on a board made of flat strokes it
 * read as a sticker dropped on a diagram — a shaded, textured object among
 * lines with no shading anywhere else. It was the one thing in the game that
 * looked like it came from somewhere else, and on the dark grounds it would be
 * the only thing not made of light.
 *
 * So it is geometry now, in the board's own language: two flat tones, a husk,
 * and a bloom in the same idiom as the walls. The sprite is still used in the
 * story cards and the trail map, where it is big and sits on paper rather than
 * on the board — it was never wrong there.
 */
const MAIZE_SCALE = 0.86

/**
 * `now` is optional. With it the ear lifts and settles, slowly and out of
 * phase with its neighbours — about an eightieth of a cell, enough that the
 * eye registers something alive without being able to point at it.
 */
function drawMaizeIcon(ctx, x, y, cellSize, now = null) {
  const s = cellSize
  const phase = x * 1.7 + y * 2.3
  // a slow, small lift and nothing else — no wobble, no pulsing light
  const breath = now === null ? 0 : Math.sin(now / 520 + phase)
  const cx = (x + 0.5) * s
  const cy = (y + 0.5) * s + breath * s * 0.012
  const r = s * MAIZE_SCALE * 0.5

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.38)

  ctx.shadowColor = COLORS.maizeGlow
  ctx.shadowBlur = s * 0.2

  // husk, one leaf swept back off the cob
  ctx.fillStyle = COLORS.maizeHusk
  ctx.beginPath()
  ctx.ellipse(-r * 0.42, r * 0.16, r * 0.26, r * 0.66, -0.24, 0, Math.PI * 2)
  ctx.fill()

  // the cob
  ctx.fillStyle = COLORS.maize
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.40, r * 0.82, 0, 0, Math.PI * 2)
  ctx.fill()

  // kernel rows: three short bands, enough to read as an ear and no more.
  // Any more detail than this smears at the size a cell actually gets.
  ctx.shadowBlur = 0
  ctx.strokeStyle = COLORS.maizeDeep
  ctx.lineWidth = Math.max(1, s * 0.035)
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const t of [-0.34, 0, 0.34]) {
    ctx.moveTo(-r * 0.26, r * t)
    ctx.lineTo(r * 0.26, r * t)
  }
  ctx.stroke()

  ctx.restore()
}

function drawMaze(ctx, game, cellSize) {
  const { grid } = game
  const ground = terrainOf(grid)
  const width = grid.cols * cellSize
  const height = grid.rows * cellSize

  ctx.fillStyle = ground.bg
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = ground.grid
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (let x = 0; x <= grid.cols; x++) { ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, height) }
  for (let y = 0; y <= grid.rows; y++) { ctx.moveTo(0, y * cellSize); ctx.lineTo(width, y * cellSize) }
  ctx.stroke()

  drawSurfaces(ctx, grid, cellSize)

  /*
   * Start: dim, and quieter than everything else on the board.
   *
   * It used to be the loudest object here — a saturated tile with a white play
   * glyph on it — which put the most visual weight in the game on the one cell
   * that stops mattering two seconds in. It is a ring now, and it says only
   * "you began here".
   */
  ctx.strokeStyle = COLORS.start
  ctx.lineWidth = Math.max(1.5, cellSize * 0.06)
  ctx.beginPath()
  ctx.arc((grid.start.x + 0.5) * cellSize, (grid.start.y + 0.5) * cellSize,
    cellSize * 0.26, 0, Math.PI * 2)
  ctx.stroke()

  /*
   * Exit: the brightest thing on the board once it opens, and breathing.
   *
   * It was the *lowest* contrast object in the game — pale grey on cream — which
   * is a strange thing to do to the only cell that ends the level. Locked, it is
   * a dull closed ring; open, it is lit and pulses slowly, so it reads from the
   * edge of the fog as somewhere to go rather than as more scenery.
   */
  const ex = (grid.end.x + 0.5) * cellSize
  const ey = (grid.end.y + 0.5) * cellSize
  ctx.save()
  if (game.exitOpen) {
    const pulse = 0.86 + 0.14 * Math.sin(game.now / 520)
    ctx.shadowColor = COLORS.exitGlow
    ctx.shadowBlur = cellSize * 0.4 * pulse
    ctx.fillStyle = COLORS.exit
    ctx.globalAlpha = pulse
    ctx.beginPath()
    ctx.arc(ex, ey, cellSize * 0.28, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.strokeStyle = COLORS.exitLocked
    ctx.lineWidth = Math.max(1.5, cellSize * 0.07)
    ctx.beginPath()
    ctx.arc(ex, ey, cellSize * 0.26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ex - cellSize * 0.13, ey - cellSize * 0.13)
    ctx.lineTo(ex + cellSize * 0.13, ey + cellSize * 0.13)
    ctx.stroke()
  }
  ctx.restore()

  // maize. A picked one leaves a faint ring, so the cell still reads as
  // somewhere you had to go without competing with the ones still to get.
  for (const flag of grid.flags) {
    if (game.captured.has(key(flag.x, flag.y))) {
      ctx.strokeStyle = COLORS.maizeTaken
      ctx.lineWidth = Math.max(1, cellSize * 0.05)
      ctx.beginPath()
      ctx.arc((flag.x + 0.5) * cellSize, (flag.y + 0.5) * cellSize,
        cellSize * 0.18, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      drawMaizeIcon(ctx, flag.x, flag.y, cellSize, game.now)
    }
  }

  // walls
  const traceWalls = () => {
    ctx.beginPath()
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const w = wallsAt(grid, x, y)
        const px = x * cellSize
        const py = y * cellSize
        if (w & TOP) { ctx.moveTo(px, py); ctx.lineTo(px + cellSize, py) }
        if (w & LEFT) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellSize) }
        if (w & RIGHT) { ctx.moveTo(px + cellSize, py); ctx.lineTo(px + cellSize, py + cellSize) }
        if (w & BOTTOM) { ctx.moveTo(px, py + cellSize); ctx.lineTo(px + cellSize, py + cellSize) }
      }
    }
    ctx.stroke()
  }

  ctx.lineWidth = Math.max(2, cellSize * WALL_WIDTH)
  ctx.lineCap = 'round'

  /*
   * Neon, on the terrains that ask for it: a wide coloured bloom laid down
   * first, then the crisp line on top of it. Stroked twice under the shadow
   * because one pass of a blurred stroke is too faint to read as light —
   * canvas shadows do not accumulate within a single stroke, so the second
   * pass is what makes it glow rather than smudge.
   *
   * The crisp line still goes down last. Glow alone is a blurry maze, and the
   * wall is a collision boundary before it is decoration — the player has to
   * be able to see exactly where it is.
   */
  /*
   * One pass, tight. It was two passes at a wider blur, and the walls read as
   * tubes of light with the corridors lost between the halos. The wall is a
   * line that happens to be lit, not a lamp.
   */
  if (ground.glow) {
    ctx.save()
    ctx.shadowColor = ground.glow
    ctx.shadowBlur = cellSize * 0.3
    ctx.strokeStyle = ground.glow
    traceWalls()
    ctx.restore()
  }

  ctx.strokeStyle = ground.wall
  traceWalls()
}

/**
 * The small yellow thing going on ahead of you in the dark.
 *
 * Chapter five spends the whole emotional payload of the game on this shape —
 * "it is my hat, and it is the only part of me that has kept going in a
 * straight line". For twenty levels before that it was a circle with a white
 * rim and a specular highlight, which is to say: a token. A reveal only lands
 * on a shape somebody had already been looking at.
 *
 * So it is a hat now, and it is the light source. The brim is an ellipse and
 * the crown a smaller dome above it, both kept strictly inside `fillRadius` —
 * `ballDrawMetrics` exists because the physics clamps the centre to exactly one
 * radius from a wall, so any ink outside that radius reads as the player
 * clipping through a wall that is in fact colliding exactly.
 */
/**
 * How the hat is carried this frame, from what the ball is doing.
 *
 * Tilt leans it into horizontal motion; bob is the walk. Both are read off the
 * velocity, so a hat that has stopped is level and still — nothing here
 * animates on a timer while the player is not doing anything. `scale` is the
 * arrival: 0 the instant it lands back at the start, swelling past 1 and
 * settling, so a respawn reads as something appearing rather than as the
 * previous frame having been a mistake.
 *
 * The bob is vertical only and a fiftieth of a cell at full walk. Vertically
 * the ball always has a wall's-worth of clearance in the corridor it is
 * walking along; sideways it may be pressed against one, and ink past the
 * collision radius there reads as clipping (see `ballDrawMetrics`).
 */
function hatPose(game) {
  const { ball, fx } = game
  const speed = Math.hypot(ball.vx, ball.vy)
  const walk = Math.min(1, speed / 0.16)
  const pose = { scale: 1, tilt: 0, bob: 0 }

  pose.tilt = Math.max(-0.18, Math.min(0.18, ball.vx * 1.1))
  if (walk > 0.25) pose.bob = Math.sin(game.now / 60) * walk * 0.02

  const spawn = fx.length > 0 ? latestFx(game, 'spawn') : null
  if (spawn) pose.scale = easeOutBack(fxProgress(spawn, game.now))

  return pose
}

function drawBall(ctx, ball, cellSize, pose = null) {
  const scale = pose?.scale ?? 1
  if (scale <= 0.02) return
  const x = ball.x * cellSize
  const y = (ball.y + (pose?.bob ?? 0)) * cellSize
  const { fillRadius: r0, rimRadius: rim0, rimWidth } = ballDrawMetrics(ball.radius, cellSize)
  const fillRadius = r0 * scale
  const rimRadius = rim0 * scale

  ctx.save()
  if (pose?.tilt) {
    ctx.translate(x, y)
    ctx.rotate(pose.tilt)
    ctx.translate(-x, -y)
  }

  // the glow it carries, which is what makes it findable under fog
  ctx.save()
  ctx.shadowColor = COLORS.hatGlow
  ctx.shadowBlur = cellSize * 0.32
  ctx.fillStyle = COLORS.hat

  // brim: as wide as the ink is allowed to be, and no wider
  ctx.beginPath()
  ctx.ellipse(x, y + fillRadius * 0.26, fillRadius, fillRadius * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()

  // crown, sitting on the brim
  ctx.beginPath()
  ctx.ellipse(x, y - fillRadius * 0.18, fillRadius * 0.56, fillRadius * 0.54, 0, Math.PI, 0)
  ctx.fill()
  ctx.restore()

  // the band, which is what makes it read as a hat rather than a blob
  ctx.fillStyle = COLORS.hatBand
  ctx.beginPath()
  ctx.ellipse(x, y + fillRadius * 0.12, fillRadius * 0.58, fillRadius * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = COLORS.hatRim
  ctx.lineWidth = rimWidth
  ctx.beginPath()
  ctx.ellipse(x, y + fillRadius * 0.26, rimRadius, rimRadius * 0.52, 0, 0, Math.PI * 2)
  ctx.stroke()

  /*
   * A near-white catchlight on the crown.
   *
   * Four of the eleven grounds light their walls in amber — field, track,
   * desert, ember — and on those an amber hat is a warm shape among warm
   * shapes. This is the one pixel-cluster on the board that is nearly white,
   * so wherever the player is, the brightest thing on screen is them.
   */
  ctx.fillStyle = COLORS.hatHot
  ctx.beginPath()
  ctx.ellipse(x - fillRadius * 0.16, y - fillRadius * 0.30,
    fillRadius * 0.20, fillRadius * 0.14, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * The hunter, drawn as a ghost with eyes that track the ball.
 *
 * The eyes are not decoration. The hunter always walks the shortest path to
 * you, so where it is looking is exactly where it is about to go, and a player
 * who reads that can get around it. Making the pursuit legible is what keeps
 * this from being the mechanic that just kills you from off screen.
 */
function drawHunter(ctx, game, cellSize) {
  const hunter = game.hunter
  if (!hunter || !hunter.active) return

  const x = hunter.x * cellSize
  // it drifts rather than walks: a slow rise and fall that no footfall matches
  const y = (hunter.y + Math.sin(game.now / 360) * 0.03) * cellSize
  const r = hunter.radius * cellSize

  // a soft aura, so it reads through fog at the edge of the lit circle
  const aura = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4)
  aura.addColorStop(0, `rgba(${COLORS.hunterAura}, 0.22)`)
  aura.addColorStop(1, `rgba(${COLORS.hunterAura}, 0)`)
  ctx.fillStyle = aura
  ctx.beginPath()
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2)
  ctx.fill()

  // body: domed head, four-lobed skirt
  const skirt = 4
  ctx.fillStyle = COLORS.hunter
  ctx.beginPath()
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0)
  ctx.lineTo(x + r, y + r * 0.62)
  for (let i = 0; i < skirt; i++) {
    const from = x + r - (i * 2 * r) / skirt
    const to = x + r - ((i + 1) * 2 * r) / skirt
    ctx.quadraticCurveTo((from + to) / 2, y + r * (i % 2 === 0 ? 1.05 : 0.2), to, y + r * 0.62)
  }
  ctx.closePath()
  ctx.fill()

  // eyes, aimed at the ball
  const dx = game.ball.x - hunter.x
  const dy = game.ball.y - hunter.y
  const distance = Math.max(Math.hypot(dx, dy), 1e-6)
  const gaze = Math.min(distance, 1) / 1
  const px = (dx / distance) * r * 0.22 * gaze
  const py = (dy / distance) * r * 0.22 * gaze

  for (const side of [-1, 1]) {
    const ex = x + side * r * 0.36
    const ey = y - r * 0.18
    ctx.fillStyle = COLORS.hunterEye
    ctx.beginPath()
    ctx.ellipse(ex, ey, r * 0.3, r * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.hunter
    ctx.beginPath()
    ctx.arc(ex + px, ey + py, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * The tell before the hunter wakes: the board's edge reddens over the last few
 * seconds. A chaser that simply appears is a gotcha; one that announces itself
 * is a deadline, which is the mechanic we actually wanted.
 */
function drawWakeWarning(ctx, game, cellSize) {
  const hunter = game.hunter
  if (!hunter || hunter.active) return

  const progress = wakeProgress(hunter, game.now)
  if (progress <= 0) return

  const width = game.grid.cols * cellSize
  const height = game.grid.rows * cellSize
  const pulse = 0.6 + 0.4 * Math.sin((game.now / 1000) * Math.PI * 3)
  const depth = Math.min(width, height) * 0.16

  ctx.save()
  ctx.globalAlpha = progress * pulse * 0.42
  for (const [x0, y0, x1, y1] of [
    [0, 0, depth, 0], [width, 0, width - depth, 0],
    [0, 0, 0, depth], [0, height, 0, height - depth],
  ]) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    gradient.addColorStop(0, `rgba(${COLORS.hunterAura}, 0.85)`)
    gradient.addColorStop(1, `rgba(${COLORS.hunterAura}, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}

let fogCanvas = null
let sightCanvas = null

function scratchCanvas(existing, width, height) {
  const canvas = existing ?? (typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : document.createElement('canvas'))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return canvas
}

function getFogCanvas(width, height) {
  fogCanvas = scratchCanvas(fogCanvas, width, height)
  return fogCanvas
}

function getSightCanvas(width, height) {
  sightCanvas = scratchCanvas(sightCanvas, width, height)
  return sightCanvas
}

/**
 * The shape the lantern actually reaches: a disc of light with the shadow of
 * every wall between it and the player cut back out of it.
 *
 * Returned as a mask — opaque where the player can see, clear where they
 * cannot — so the caller can punch it out of the fog in one composite.
 *
 * Only the walls inside the light are considered. A shadow is cast by
 * projecting each wall segment's two ends directly away from the light and far
 * enough off the board that the quad between them covers everything behind it;
 * `SHADOW_THROW` is in cells and only has to exceed the diagonal of the largest
 * board, which is 38x21 (about 43.4).
 *
 * This is presentation and nothing else. `fog` appears nowhere in `solvers.js`
 * or `oracle.js` — the simulated players have their own map and no vision model
 * at all — so tightening or loosening what the player can see cannot make a
 * shipped level unbeatable. That is the only reason this was safe to build.
 */
const SHADOW_THROW = 60

/**
 * How much further the lantern throws than the old disc did.
 *
 * `grid.fog` was tuned for light that ignored walls: a radius of 2.4 cells
 * meant 2.4 cells of sight in every direction, corridor or not. Once walls
 * occlude, that same number leaves the player lighting one room and nothing
 * else, because in a maze almost every direction is a wall.
 *
 * So occlusion takes over the job of limiting sight and the raw reach grows to
 * suit. What the player loses is seeing *through* walls; what they gain is
 * seeing *along* a corridor. Same numbers in `levels.json`, different meaning —
 * and no risk either way, because no solver has ever consulted them.
 */
const LANTERN_REACH = 2.2

function buildSight(width, height, grid, lightX, lightY, radius) {
  const canvas = getSightCanvas(width, height)
  const sctx = canvas.getContext('2d')

  sctx.globalCompositeOperation = 'source-over'
  sctx.clearRect(0, 0, width, height)

  const gradient = sctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.62, 'rgba(0,0,0,1)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  sctx.fillStyle = gradient
  sctx.beginPath()
  sctx.arc(lightX, lightY, radius, 0, Math.PI * 2)
  sctx.fill()

  // cull to the cells the light could possibly touch
  const cell = width / grid.cols
  const reach = radius / cell + 1
  const cx = lightX / cell
  const cy = lightY / cell
  const minX = Math.max(0, Math.floor(cx - reach))
  const maxX = Math.min(grid.cols - 1, Math.ceil(cx + reach))
  const minY = Math.max(0, Math.floor(cy - reach))
  const maxY = Math.min(grid.rows - 1, Math.ceil(cy + reach))

  sctx.globalCompositeOperation = 'destination-out'
  sctx.fillStyle = '#000'
  sctx.beginPath()

  const throwFar = SHADOW_THROW * cell
  const castFrom = (ax, ay, bx, by) => {
    const adx = ax - lightX
    const ady = ay - lightY
    const bdx = bx - lightX
    const bdy = by - lightY
    const alen = Math.hypot(adx, ady) || 1e-6
    const blen = Math.hypot(bdx, bdy) || 1e-6
    sctx.moveTo(ax, ay)
    sctx.lineTo(ax + (adx / alen) * throwFar, ay + (ady / alen) * throwFar)
    sctx.lineTo(bx + (bdx / blen) * throwFar, by + (bdy / blen) * throwFar)
    sctx.lineTo(bx, by)
    sctx.closePath()
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w = wallsAt(grid, x, y)
      const px = x * cell
      const py = y * cell
      // TOP and LEFT only, plus the two outer edges: every interior wall is
      // shared, and casting it twice is wasted work rather than a darker shadow
      if (w & TOP) castFrom(px, py, px + cell, py)
      if (w & LEFT) castFrom(px, py, px, py + cell)
      if (x === grid.cols - 1 && (w & RIGHT)) castFrom(px + cell, py, px + cell, py + cell)
      if (y === grid.rows - 1 && (w & BOTTOM)) castFrom(px, py + cell, px + cell, py + cell)
    }
  }

  sctx.fill()
  sctx.globalCompositeOperation = 'source-over'
  return canvas
}


/**
 * Fog as a composited mask: a dark sheet, holes punched where the player has
 * been, and a soft radial hole around them. Filling one opaque rectangle per
 * cell gives the lit area a hard stair-stepped border and makes a remembered
 * cell hard to tell from a lit one.
 *
 * On `memory` levels the punched holes close again with age, so the trail
 * behind you rots at the far end while you are still walking. `grid.memory` is
 * how many milliseconds a cell stays remembered; null means forever, which is
 * every level up to the chapter that takes it away.
 */
function drawFog(ctx, game, cellSize) {
  const { grid, ball } = game
  if (grid.fog === null || game.dev) return

  const width = grid.cols * cellSize
  const height = grid.rows * cellSize
  const canvas = getFogCanvas(width, height)
  const fctx = canvas.getContext('2d')

  fctx.clearRect(0, 0, width, height)
  fctx.fillStyle = `rgba(${terrainOf(grid).fog}, 1)`
  fctx.fillRect(0, 0, width, height)

  fctx.globalCompositeOperation = 'destination-out'
  const hole = 1 - MEMORY_ALPHA
  fctx.fillStyle = `rgba(0,0,0,${hole})`

  for (const [id, seenAt] of game.visited) {
    let strength = 1
    if (grid.memory !== null) {
      const age = game.now - seenAt
      if (age >= grid.memory) continue          // forgotten completely
      // ease out, so a cell dims gently for most of its life and then goes
      strength = (1 - age / grid.memory) ** 0.65
    }
    const comma = id.indexOf(',')
    const x = +id.slice(0, comma)
    const y = +id.slice(comma + 1)
    if (grid.memory !== null) fctx.fillStyle = `rgba(0,0,0,${hole * strength})`
    fctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
  }

  /*
   * Now what he can see from where he is standing.
   *
   * Built in its own pass and then punched out in one composite, rather than
   * drawn straight into the fog, and the order is the whole point: shadows have
   * to cut into *sight* without touching *memory*. A corridor you have already
   * walked stays remembered when a wall later comes between you and it —
   * because you did see it, and the game's whole subject is the difference
   * between what a man can see and what he can still remember.
   */
  const bx = ball.x * cellSize
  const by = ball.y * cellSize
  // assist widens the hole and nothing else; the fog was never in the proof
  const radius = (grid.fog + game.assist.fogBonus) * LANTERN_REACH * cellSize
  const sight = buildSight(width, height, grid, bx, by, radius)
  fctx.globalCompositeOperation = 'destination-out'
  fctx.drawImage(sight, 0, 0)
  fctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(canvas, 0, 0)

  /*
   * And then the warmth.
   *
   * Punching a hole in the fog says "there is no fog here". It does not say
   * "someone is holding a light", which is the entire fiction — so the same
   * shape is re-used as a mask for a warm additive wash, strongest at his feet
   * and gone by the edge of his reach.
   *
   * Warm on every terrain, including the cold ones, and especially the cold
   * ones: a yellow light on ice-blue walls is the whole of the White Mile in
   * one frame. It is drawn on the main context after the fog rather than into
   * it, because fog is something taken away and this is something added.
   */
  const sctx = sight.getContext('2d')
  sctx.globalCompositeOperation = 'source-in'
  const warmth = sctx.createRadialGradient(bx, by, 0, bx, by, radius)
  warmth.addColorStop(0, 'rgba(255, 206, 122, 0.20)')
  warmth.addColorStop(0.45, 'rgba(255, 186, 96, 0.10)')
  warmth.addColorStop(1, 'rgba(255, 170, 80, 0)')
  sctx.fillStyle = warmth
  sctx.fillRect(0, 0, width, height)
  sctx.globalCompositeOperation = 'source-over'

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(sight, 0, 0)
  ctx.restore()
}

/**
 * The cell where it happened, held for a moment.
 *
 * A soft fill that fades, rather than the opaque slab it was: at full strength
 * a red tile was the loudest thing on a board made of thin light, and it sat
 * on top of the fall animation it was meant to be underneath.
 */
function drawFlash(ctx, game, cellSize) {
  const flash = game.flash
  if (!flash || game.now >= flash.until) return

  const remaining = (flash.until - game.now) / 450
  const alpha = Math.max(0, Math.min(1, remaining)) * 0.28
  const inset = cellSize * MARKER_INSET

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = flash.kind === 'trap' ? COLORS.trapFlash : COLORS.captureFlash
  roundRect(ctx, flash.x * cellSize + inset, flash.y * cellSize + inset,
    cellSize - inset * 2, cellSize - inset * 2, cellSize * 0.2)
  ctx.fill()
  ctx.restore()
}

// ------------------------------------------------------------------ effects

/**
 * A handful of motes thrown out from a point, on a fixed spread so the same
 * event always looks the same. Each one decelerates and fades; `gravity` pulls
 * kernels down and lets dust hang.
 */
function drawMotes(ctx, cx, cy, count, progress, cellSize, { color, reach, size, gravity = 0, seed = 0 }) {
  const eased = easeOut(progress)
  ctx.fillStyle = color
  ctx.globalAlpha = (1 - progress) ** 1.4
  for (let i = 0; i < count; i++) {
    const angle = ((i + 0.5) / count) * Math.PI * 2 + seed
    const throwLen = reach * (0.7 + 0.3 * Math.sin(i * 2.9 + seed)) * cellSize
    const x = cx + Math.cos(angle) * throwLen * eased
    const y = cy + Math.sin(angle) * throwLen * eased + gravity * progress * progress * cellSize
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.8, size * cellSize * (1 - progress * 0.6)), 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A ring that grows and thins. */
function drawRing(ctx, cx, cy, progress, cellSize, { color, from, to, width }) {
  const eased = easeOut(progress)
  ctx.strokeStyle = color
  ctx.globalAlpha = (1 - progress) ** 1.2
  ctx.lineWidth = Math.max(1, width * cellSize * (1 - progress * 0.7))
  ctx.beginPath()
  ctx.arc(cx, cy, (from + (to - from) * eased) * cellSize, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * Effects that belong to the ground: drawn under the fog, so a knock in a
 * corridor you cannot see stays unseen.
 */
function drawFxUnder(ctx, game, cellSize) {
  if (game.fx.length === 0) return
  ctx.save()
  for (const fx of game.fx) {
    const p = fxProgress(fx, game.now)
    if (p >= 1) continue
    const cx = (fx.kind === 'bump' ? fx.x : fx.x + 0.5) * cellSize
    const cy = (fx.kind === 'bump' ? fx.y : fx.y + 0.5) * cellSize

    if (fx.kind === 'bump') {
      // dust off the wall, thrown back the way the hat came
      drawMotes(ctx, cx, cy, 3, p, cellSize,
        { color: 'rgba(255, 236, 200, 0.5)', reach: 0.16, size: 0.03, seed: fx.axis === 'x' ? 0.4 : 1.2 })
    } else if (fx.kind === 'unpick') {
      // an ear going back where it lay: the pick, run backwards and dimmer
      drawRing(ctx, cx, cy, 1 - p, cellSize, { color: COLORS.maizeTaken, from: 0.2, to: 0.55, width: 0.05 })
      ctx.globalAlpha = 0.35 * p
      drawMaizeIcon(ctx, fx.x, fx.y, cellSize)
    } else if (fx.kind === 'pick') {
      // the ear comes up: kernels out, a ring, and the ear itself swelling away
      drawRing(ctx, cx, cy, p, cellSize, { color: COLORS.maize, from: 0.2, to: 0.55, width: 0.05 })
      drawMotes(ctx, cx, cy, 6, p, cellSize,
        { color: COLORS.maize, reach: 0.42, size: 0.04, gravity: 0.3, seed: 0.3 })
      if (p < 0.35) {
        // the ear itself, swelling and going: re-plotted at a larger cell
        // size around the same centre rather than ctx.scale'd, so the
        // headless stubs that lack `scale` still run the frame
        const size = cellSize * (1 + easeOut(p / 0.35) * 0.35)
        ctx.globalAlpha = 1 - p / 0.35
        drawMaizeIcon(ctx, cx / size - 0.5, cy / size - 0.5, size)
      }
    }
  }
  ctx.restore()
}

/**
 * Effects that belong to the player and the story: over the fog, because the
 * fall, the way opening and the ghost waking are things he knows happened
 * whether or not he can see the ground they happened on.
 */
function drawFxOver(ctx, game, cellSize) {
  if (game.fx.length === 0) return
  ctx.save()
  for (const fx of game.fx) {
    const p = fxProgress(fx, game.now)
    if (p >= 1) continue
    const cx = (fx.x + 0.5) * cellSize
    const cy = (fx.y + 0.5) * cellSize

    if (fx.kind === 'fall') {
      /*
       * Down the hole: the ground opens, the hat drops through it shrinking
       * and turning, the hole closes. Caught is the same fall in the ghost's
       * colour — the board is stopped under the overlay, so it holds.
       */
      const open = p < 0.3 ? easeOut(p / 0.3) : 1 - easeIn((p - 0.3) / 0.7)
      ctx.globalAlpha = 0.9
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.beginPath()
      ctx.ellipse(cx, cy + cellSize * 0.08, cellSize * 0.34 * open, cellSize * 0.2 * open, 0, 0, Math.PI * 2)
      ctx.fill()

      const drop = clamp01(p / 0.55)
      if (drop < 1) {
        const ghost = {
          x: fx.x + 0.5,
          y: fx.y + 0.5 + easeIn(drop) * 0.25,
          radius: game.ball.radius,
        }
        drawBall(ctx, ghost, cellSize, { scale: 1 - easeIn(drop), tilt: drop * (fx.caught ? -1.2 : 0.8), bob: 0 })
      }
      drawMotes(ctx, cx, cy, 4, p, cellSize, {
        color: fx.caught ? `rgba(${COLORS.hunterAura}, 0.7)` : 'rgba(120, 90, 60, 0.7)',
        reach: 0.36, size: 0.04, gravity: 0.45, seed: 0.7,
      })
    } else if (fx.kind === 'unlock') {
      // the way on is open: one ring from where the last ear was, drawn over
      // the fog so the moment registers on a board that is mostly dark
      drawRing(ctx, cx, cy, p, cellSize, { color: COLORS.exit, from: 0.3, to: 3.2, width: 0.07 })
    } else if (fx.kind === 'wake') {
      drawRing(ctx, cx, cy, p, cellSize, { color: `rgba(${COLORS.hunterAura}, 0.8)`, from: 0.3, to: 1.6, width: 0.07 })
    }
  }
  ctx.restore()
}

/** How long the hat takes to go into the exit once the level is won. */
const OUTRO_MS = 720

/**
 * The end of the field: the hat sinks into the open exit and the exit's light
 * goes out across the board. Runs on `game.outro`, the one clock that advances
 * after a win, because the time on the card has to be the time you finished.
 */
function drawOutro(ctx, game, cellSize) {
  const t = clamp01(game.outro / OUTRO_MS)
  const ex = (game.grid.end.x + 0.5) * cellSize
  const ey = (game.grid.end.y + 0.5) * cellSize

  ctx.save()
  drawRing(ctx, ex, ey, t, cellSize, { color: COLORS.exit, from: 0.3, to: 3.6, width: 0.08 })
  ctx.globalAlpha = (1 - t) * 0.3
  ctx.fillStyle = COLORS.exitGlow
  ctx.beginPath()
  ctx.arc(ex, ey, cellSize * (0.3 + easeOut(t) * 0.8), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * The touch stick, where the finger is. Drawn last and lightly: it is the
 * player's own thumb, not part of the field.
 */
function drawStick(ctx, game, cellSize) {
  const stick = game.stick
  if (!stick) return
  const ox = stick.x * cellSize
  const oy = stick.y * cellSize
  ctx.save()
  ctx.globalAlpha = 0.14
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1, cellSize * 0.035)
  ctx.beginPath()
  ctx.arc(ox, oy, cellSize * 0.85, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 0.26
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(ox + stick.dx * cellSize, oy + stick.dy * cellSize, cellSize * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * The tail behind the hat.
 *
 * Drawn under the ball and fading to nothing, so speed reads as speed. It also
 * quietly does a job on the sand: the same input covers more ground there, and
 * a longer smear is the cheapest possible way to show that.
 */
function drawTrail(ctx, game, cellSize) {
  const trail = game.trail
  if (!trail || trail.length < 2) return

  const radius = game.ball.radius * cellSize
  ctx.save()
  ctx.fillStyle = COLORS.hat
  for (let i = 0; i < trail.length; i++) {
    const age = (i + 1) / trail.length      // 0 oldest, 1 newest
    ctx.globalAlpha = age * 0.34
    ctx.beginPath()
    ctx.arc(trail[i].x * cellSize, trail[i].y * cellSize, radius * age * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * One frame. Order matters: fog goes over the maze, and the hunter goes over
 * the fog — it is never hidden by it. Being unable to see the maze is the game;
 * being unable to see the thing chasing you is just noise.
 *
 * The whole frame is offset while `game.shake` is running down. It is applied
 * here rather than to the canvas element so nothing in the page reflows — a
 * transform on the DOM node would shove the layout around sixty times a second.
 */
/**
 * Dev overlay: the two things a field deliberately hides.
 *
 * Traps are invisible by design and maize sits under the fog, which is the
 * whole tension of a walk — and precisely what makes a field impossible to
 * *tune* by playing it, since the designer is denied the same information as
 * the player. This puts both back.
 *
 * Drawn after `drawFog`, which is the entire trick: the overlay punches through
 * the dark rather than the fog needing to know anything about it.
 *
 * Gated on `game.dev`, set once from `isDevMode()` in Play — the engine does
 * not read the flag itself, because nothing in `engine/` imports from `ui/`.
 */
function drawDevOverlay(ctx, game, cellSize) {
  if (!game.dev) return
  const { grid } = game

  ctx.save()

  // traps: the tile is washed and then crossed. The wash reads at a glance on a
  // scrolling board, the cross survives being small on a 38-wide one.
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1.5, cellSize * 0.07)
  for (const trap of grid.traps) {
    const px = trap.x * cellSize
    const py = trap.y * cellSize
    const inset = cellSize * 0.24
    ctx.fillStyle = COLORS.trapWash
    ctx.fillRect(px, py, cellSize, cellSize)
    ctx.strokeStyle = COLORS.trapFlash
    ctx.beginPath()
    ctx.moveTo(px + inset, py + inset)
    ctx.lineTo(px + cellSize - inset, py + cellSize - inset)
    ctx.moveTo(px + cellSize - inset, py + inset)
    ctx.lineTo(px + inset, py + cellSize - inset)
    ctx.stroke()
  }

  // Remaining maize gets a subtle highlight in the full-map debug view.
  ctx.globalAlpha = 0.55
  for (const flag of grid.flags) {
    if (game.captured.has(key(flag.x, flag.y))) continue
    drawMaizeIcon(ctx, flag.x, flag.y, cellSize, game.now)
  }

  ctx.restore()
}

/** Tools and timber share the board's cell coordinates and collision map. */
function drawTools(ctx, game, cellSize) {
  const s = cellSize
  ctx.save()
  for (const id of game.wood ?? []) {
    const [x, y] = id.split(',').map(Number)
    const px = x * s, py = y * s
    for (let plank = 0; plank < 3; plank++) {
      ctx.fillStyle = plank % 2 ? '#845a31' : '#a07740'
      ctx.fillRect(px + s * .08, py + s * (.1 + plank * .27), s * .84, s * .23)
      ctx.fillStyle = '#d1ab70'
      ctx.fillRect(px + s * .17, py + s * (.16 + plank * .27), s * .025, s * .025)
      ctx.fillRect(px + s * .79, py + s * (.16 + plank * .27), s * .025, s * .025)
    }
    if (game.chopping?.id === id) {
      ctx.fillStyle = '#f4dc8f'
      ctx.fillRect(px + s * .1, py + s * .88, s * .8 * Math.min(1, game.chopping.ms / 450), s * .045)
    }
  }
  const tool = (at, kind) => {
    if (!at) return
    const x = (at.x + .5) * s, y = (at.y + .5) * s
    ctx.save()
    ctx.translate(x, y)
    ctx.shadowColor = kind === 'axe' ? '#e9c98d' : '#a2e7d8'
    ctx.shadowBlur = s * .2
    ctx.lineWidth = Math.max(2, s * .06)
    ctx.strokeStyle = kind === 'axe' ? '#ddbd80' : '#a2e7d8'
    ctx.beginPath()
    if (kind === 'axe') {
      ctx.moveTo(-s * .2, s * .28)
      ctx.lineTo(s * .12, -s * .24)
      ctx.stroke()
      ctx.fillStyle = '#e5ece0'
      ctx.beginPath()
      ctx.moveTo(-s * .04, -s * .21)
      ctx.lineTo(s * .29, -s * .31)
      ctx.lineTo(s * .31, -s * .02)
      ctx.lineTo(s * .1, -.08 * s)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.moveTo(0, -s * .3)
      ctx.lineTo(s * .23, 0)
      ctx.lineTo(0, s * .3)
      ctx.lineTo(-s * .23, 0)
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#c4f5e9'
      ctx.fillRect(-s * .035, -s * .09, s * .07, s * .18)
    }
    ctx.restore()
  }
  if (!game.hasAxe) tool(game.grid.axe, 'axe')
  if (!game.charmPicked) tool(game.grid.charm, 'ward')
  ctx.restore()
}

function drawScene(ctx, game, cellSize) {
  const shaking = game.shake > 0
  const camera = game.camera
  const moved = shaking || Boolean(camera && (camera.x !== 0 || camera.y !== 0))
  if (moved) {
    ctx.save()
    if (camera) {
      // the ground behind a scrolled board, so a shake never shows the page
      ctx.fillStyle = terrainOf(game.grid).bg
      ctx.fillRect(0, 0, 1e5, 1e5)
      ctx.translate(-camera.x * cellSize, -camera.y * cellSize)
    }
    if (shaking) {
      const force = (game.shake / 420) * cellSize * 0.14
      ctx.translate((Math.random() - 0.5) * force, (Math.random() - 0.5) * force)
    }
  }

  drawMaze(ctx, game, cellSize)
  drawLandmarks(ctx, game, cellSize)
  drawTools(ctx, game, cellSize)
  drawFxUnder(ctx, game, cellSize)
  drawTrail(ctx, game, cellSize)
  if (game.won) {
    // going in: the hat shrinks into the exit and turns as it goes
    const t = clamp01(game.outro / OUTRO_MS)
    drawBall(ctx, game.ball, cellSize, { scale: 1 - easeIn(t), tilt: t * 0.9, bob: 0 })
  } else {
    drawBall(ctx, game.ball, cellSize, hatPose(game))
  }
  drawFog(ctx, game, cellSize)
  drawDevOverlay(ctx, game, cellSize)
  drawHunter(ctx, game, cellSize)
  drawWakeWarning(ctx, game, cellSize)
  drawFlash(ctx, game, cellSize)
  drawFxOver(ctx, game, cellSize)
  if (game.won) drawOutro(ctx, game, cellSize)
  drawStick(ctx, game, cellSize)

  if (moved) ctx.restore()
}

export {
  COLORS, TERRAINS, SURFACE_TINTS, SURFACE_EDGES, terrainOf, drawSurfaces,
  WALL_WIDTH, MAIZE_SCALE, LANTERN_REACH, OUTRO_MS, setupCanvas, ballDrawMetrics,
  drawMaizeIcon, hatPose,
  drawScene, drawMaze, drawBall, drawTrail, drawFog, drawHunter, drawWakeWarning,
  drawFxUnder, drawFxOver, drawOutro, drawStick, drawDevOverlay,
}
