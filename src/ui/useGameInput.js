import { useEffect } from 'react'

/**
 * Keyboard and touch input.
 *
 * Writes straight into `game.input`, which the fixed-timestep loop samples. No
 * React state is involved — a keypress must not re-render anything.
 *
 * The touch handling is the part that was actually broken. The original bound
 * `touchmove` to `window` with `{ passive: false }` and called preventDefault
 * unconditionally, which killed scrolling on every page in the app including
 * the level list. It also measured the drag from the very first touch point and
 * never recentred, so after one long swipe the stick was pinned to a corner.
 * Here the listeners live on the board element only, `touch-action: none` in
 * CSS stops the browser gesture, and the origin follows the finger.
 */

const KEY_MAP = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
}

const DEAD_ZONE = 8    // px before a drag counts as a direction
const STICK_RANGE = 34 // px past which the origin is dragged along

function clearInput(input) {
  input.up = false
  input.down = false
  input.left = false
  input.right = false
}

function useGameInput(game, boardRef, actions = {}) {
  const { onRestart, onTogglePause, onBack } = actions

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const direction = KEY_MAP[e.key]
      if (direction) {
        game.input[direction] = true
        e.preventDefault()
        return
      }

      if (e.key === 'r' || e.key === 'R') {
        onRestart?.()
        e.preventDefault()
      } else if (e.key === 'p' || e.key === 'P') {
        onTogglePause?.()
        e.preventDefault()
      } else if (e.key === 'Escape') {
        onBack?.()
        e.preventDefault()
      }
    }

    const onKeyUp = (e) => {
      const direction = KEY_MAP[e.key]
      if (!direction) return
      game.input[direction] = false
    }

    // A window that loses focus mid-press would otherwise keep that key held.
    const onBlur = () => clearInput(game.input)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [game, onRestart, onTogglePause, onBack])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    let pointerId = null
    let originX = 0
    let originY = 0

    const onPointerDown = (e) => {
      if (pointerId !== null) return

      /*
       * The stick is the canvas, not everything layered over it.
       *
       * Without this the pause menu is unclickable, and in a way no jsdom test
       * catches. A press on a menu button bubbles to the board, the board calls
       * setPointerCapture, and the capture retargets the pointerup to the board
       * — so the browser dispatches the click to the board rather than to the
       * button under the finger. jsdom does not implement that retargeting, so
       * a synthetic .click() in a test kept working the whole time the real
       * menu did nothing.
       */
      if (!(e.target instanceof Element) || e.target.tagName !== 'CANVAS') return

      pointerId = e.pointerId
      originX = e.clientX
      originY = e.clientY
      board.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return

      let dx = e.clientX - originX
      let dy = e.clientY - originY

      // drag the origin behind the finger so the stick can always be re-aimed
      const distance = Math.hypot(dx, dy)
      if (distance > STICK_RANGE) {
        const excess = distance - STICK_RANGE
        originX += (dx / distance) * excess
        originY += (dy / distance) * excess
        dx = (dx / distance) * STICK_RANGE
        dy = (dy / distance) * STICK_RANGE
      }

      game.input.left = dx < -DEAD_ZONE
      game.input.right = dx > DEAD_ZONE
      game.input.up = dy < -DEAD_ZONE
      game.input.down = dy > DEAD_ZONE
    }

    const onPointerEnd = (e) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      clearInput(game.input)
    }

    board.addEventListener('pointerdown', onPointerDown)
    board.addEventListener('pointermove', onPointerMove)
    board.addEventListener('pointerup', onPointerEnd)
    board.addEventListener('pointercancel', onPointerEnd)
    return () => {
      board.removeEventListener('pointerdown', onPointerDown)
      board.removeEventListener('pointermove', onPointerMove)
      board.removeEventListener('pointerup', onPointerEnd)
      board.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [game, boardRef])
}

export { useGameInput, KEY_MAP }
