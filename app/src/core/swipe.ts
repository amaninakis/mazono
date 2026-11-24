/** How far (in CSS pixels) a finger moves before we tell a sideways drag from a scroll. */
export const DRAG_SLOP = 8

/**
 * Which way a finger is moving: 'x' for a sideways drag (ours), 'y' for scrolling the page,
 * undefined while it has hardly moved yet.
 */
export function dragAxis(deltaX: number, deltaY: number): 'x' | 'y' | undefined {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DRAG_SLOP) {
    return undefined
  }

  return Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
}

/**
 * The step a finished drag asks for, as when turning a page: dragging left brings the next
 * (later) value, +1; dragging right the previous one, -1. It takes a third of the width, or a
 * quick flick (`velocity` in px per ms, in the same direction); anything less springs back, 0.
 */
export function dragResult(deltaX: number, width: number, velocity: number): -1 | 0 | 1 {
  const far = Math.abs(deltaX) > width / 3
  const flick = Math.abs(velocity) > 0.4 && Math.abs(deltaX) > 16 && velocity * deltaX > 0
  if (!far && !flick) {
    return 0
  }

  return deltaX < 0 ? 1 : -1
}

/**
 * How far the value moves for a finger that moved `deltaX`: along with it when there is a
 * value that way, and only a little (a third, at most 40 px) when there is not, like a rubber
 * band.
 */
export function dragOffset(deltaX: number, canGo: boolean) {
  if (canGo) {
    return deltaX
  }

  return Math.max(-40, Math.min(40, deltaX / 3))
}
