import { useState, useEffect } from 'react'

/**
 * Pick a cell size that fits the board on screen.
 *
 * The original hardcoded `const CELL_SIZE = 30`, so a 12x12 level was a 360px
 * postage stamp on a desktop monitor while a 20x20 level overflowed a phone
 * with no way to scroll to the rest of it. Physics is in cell units now, so
 * this only affects presentation and can change at any time — including
 * mid-level on an orientation change.
 */

const MIN_CELL = 14
const MAX_CELL = 46

function measure(cols, rows, reservedHeight) {
  const availableWidth = Math.min(window.innerWidth - 32, 900)
  const availableHeight = window.innerHeight - reservedHeight

  const size = Math.floor(Math.min(availableWidth / cols, availableHeight / rows))
  return Math.max(MIN_CELL, Math.min(MAX_CELL, size))
}

function useCellSize(cols, rows, reservedHeight = 260) {
  const [cellSize, setCellSize] = useState(() => measure(cols, rows, reservedHeight))

  useEffect(() => {
    const update = () => setCellSize(measure(cols, rows, reservedHeight))
    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [cols, rows, reservedHeight])

  return cellSize
}

export { useCellSize, MIN_CELL, MAX_CELL }
