/** How far (in CSS pixels) a finger has to move sideways for a swipe. */
export const SWIPE_DISTANCE = 36

/**
 * The step a finished finger movement asks for. A swipe to the left brings the next (later)
 * value, +1, as when turning a page; a swipe to the right the previous (earlier) one, -1.
 * Too short a movement, or one more up-and-down than sideways (the page scrolling), is 0.
 */
export function swipeStep(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const sideways = Math.abs(deltaX)
  if (sideways < SWIPE_DISTANCE || sideways < 1.5 * Math.abs(deltaY)) {
    return 0
  }

  return deltaX < 0 ? 1 : -1
}
