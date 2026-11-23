import { describe, expect, it } from 'vitest'
import { SWIPE_DISTANCE, swipeStep } from './swipe'

describe('swipe steps', () => {
  it('goes to the later value on a swipe to the left', () => {
    expect(swipeStep(-80, 4)).toBe(1)
  })

  it('goes to the earlier value on a swipe to the right', () => {
    expect(swipeStep(80, -4)).toBe(-1)
  })

  it('ignores a tap or a short movement', () => {
    expect(swipeStep(0, 0)).toBe(0)
    expect(swipeStep(SWIPE_DISTANCE - 1, 0)).toBe(0)
    expect(swipeStep(SWIPE_DISTANCE, 0)).toBe(-1)
  })

  it('ignores a movement that is mostly up or down, so the page can scroll', () => {
    expect(swipeStep(-60, 50)).toBe(0)
    expect(swipeStep(60, -120)).toBe(0)
    expect(swipeStep(-90, 50)).toBe(1)
  })
})
