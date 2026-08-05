import { useState, useRef, useEffect, useCallback } from 'react'
import { createGrid, toggleWallBetween, toggleLiarBetween, setHiddenWord } from '../engine/maze'
import { encodeToHash } from '../utils/serialize'
import { setupCanvas, drawMaze } from '../engine/renderer'
import { useCellSize } from '../hooks/useCellSize'
import { TOOLS, OBSTACLES, applyCellTool } from '../engine/builderTools'

/**
 * The maze editor.
 *
 * The palette used to be ten motor modifiers — gravity wells, spinners, fart
 * tiles, ice — and could not place a single one of the mechanics the game
 * actually runs on. You could not author a trap, a mimic, a liar wall, a memory
 * wipe or a one-way gate, which is to say you could not build a Mazochist level
 * in the Mazochist level builder. That is the list now.
 */

const GRID_DIM = 16

function MazeBuilder({ onBack }) {
  const [grid, setGrid] = useState(() => createGrid(GRID_DIM, GRID_DIM))
  const [tool, setTool] = useState('wall')
  const [copied, setCopied] = useState(false)
  const [hiddenWord, setHiddenWordState] = useState('')

  const canvasRef = useRef(null)
  const lastCellRef = useRef(null)
  const drawingRef = useRef(false)

  const cellSize = useCellSize(grid.cols, grid.rows, 420)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = setupCanvas(canvas, grid.cols * cellSize, grid.rows * cellSize)
    drawMaze(ctx, grid, cellSize)
  }, [grid, cellSize])

  const cellFromEvent = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / cellSize)
    const y = Math.floor((e.clientY - rect.top) / cellSize)
    if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return null
    return { x, y }
  }, [cellSize, grid.cols, grid.rows])

  const isEdgeTool = tool === 'wall' || tool === 'liar'

  const onPointerDown = useCallback((e) => {
    const cell = cellFromEvent(e)
    if (!cell) return
    drawingRef.current = true
    lastCellRef.current = cell
    canvasRef.current.setPointerCapture?.(e.pointerId)
    if (!isEdgeTool) setGrid((g) => applyCellTool(g, tool, cell.x, cell.y))
  }, [cellFromEvent, isEdgeTool, tool])

  const onPointerMove = useCallback((e) => {
    if (!drawingRef.current) return
    const cell = cellFromEvent(e)
    if (!cell) return

    if (isEdgeTool) {
      const last = lastCellRef.current
      if (last && (last.x !== cell.x || last.y !== cell.y)) {
        const step = Math.abs(cell.x - last.x) + Math.abs(cell.y - last.y)
        if (step === 1) {
          const toggle = tool === 'wall' ? toggleWallBetween : toggleLiarBetween
          setGrid((g) => toggle(g, last.x, last.y, cell.x, cell.y))
        }
      }
    } else if (lastCellRef.current?.x !== cell.x || lastCellRef.current?.y !== cell.y) {
      setGrid((g) => applyCellTool(g, tool, cell.x, cell.y))
    }

    lastCellRef.current = cell
  }, [cellFromEvent, isEdgeTool, tool])

  const onPointerUp = useCallback(() => {
    drawingRef.current = false
    lastCellRef.current = null
  }, [])

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeToHash(setHiddenWord(grid, hiddenWord))}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('copy your maze link', url)
    }
  }, [grid, hiddenWord])

  const activeHint =
    [...TOOLS, ...OBSTACLES].find((t) => t.id === tool)?.hint || ''

  return (
    <div className="select" style={{ maxWidth: '52rem' }}>
      <header className="select__masthead">
        <h1 className="select__title">build a maze</h1>
        <p className="select__tagline">share the link. watch them fail.</p>
      </header>

      <div className="builder">
        <div className="builder__palette">
          <div className="builder__group">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`tool${tool === t.id ? ' tool--active' : ''}`}
                onClick={() => setTool(t.id)}
              >
                <span aria-hidden="true">{t.label}</span> {t.name}
              </button>
            ))}
          </div>
          <div className="builder__group">
            {OBSTACLES.map((t) => (
              <button
                key={t.id}
                className={`tool tool--${t.kind}${tool === t.id ? ' tool--active' : ''}`}
                onClick={() => setTool(t.id)}
              >
                <span aria-hidden="true">{t.label}</span> {t.name}
              </button>
            ))}
          </div>
          <p className="builder__hint">{activeHint}</p>
        </div>

        <div className="board">
          <canvas
            ref={canvasRef}
            className="board__canvas builder__canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <div className="builder__actions">
          <input
            className="builder__input"
            type="text"
            placeholder="hidden word, revealed on escape"
            value={hiddenWord}
            maxLength={24}
            onChange={(e) => setHiddenWordState(e.target.value)}
          />
          <button className="btn btn--primary" onClick={handleShare}>
            {copied ? 'copied!' : 'share maze'}
          </button>
          {onBack && (
            <button className="btn btn--ghost" onClick={onBack}>back to levels</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MazeBuilder
