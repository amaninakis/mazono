import type { ShallowRef } from 'vue'
import { watch } from 'vue'
import { swipeStep } from '../core/swipe'

/**
 * Swipe sideways on `target` to step its value: `onStep(1)` for a swipe to the left (later),
 * `onStep(-1)` for one to the right (earlier). Only fingers and pens swipe; a mouse keeps
 * selecting text and pressing buttons as usual. Up-and-down movements still scroll the page
 * (the element gets `touch-action: pan-y` from the `.swipeable` class).
 */
export function useSwipe(
  target: Readonly<ShallowRef<HTMLElement | null>>,
  onStep: (step: 1 | -1) => void,
) {
  let start: { id: number; x: number; y: number } | undefined
  let swipedAt = 0

  function onDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' || !event.isPrimary) {
      return
    }
    start = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  function onUp(event: PointerEvent) {
    if (!start || event.pointerId !== start.id) {
      return
    }
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y)
    start = undefined
    if (step !== 0) {
      swipedAt = Date.now()
      onStep(step)
    }
  }

  function onCancel() {
    start = undefined
  }

  /** A swipe that ends on a button or a day must not press it too. */
  function onClick(event: MouseEvent) {
    if (Date.now() - swipedAt < 400) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  watch(
    target,
    (element, _old, onCleanup) => {
      if (!element) {
        return
      }
      element.classList.add('swipeable')
      element.addEventListener('pointerdown', onDown)
      element.addEventListener('pointerup', onUp)
      element.addEventListener('pointercancel', onCancel)
      element.addEventListener('click', onClick, true)
      onCleanup(() => {
        element.removeEventListener('pointerdown', onDown)
        element.removeEventListener('pointerup', onUp)
        element.removeEventListener('pointercancel', onCancel)
        element.removeEventListener('click', onClick, true)
      })
    },
    { immediate: true },
  )
}
