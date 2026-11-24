import { describe, expect, it } from 'vitest'
import { DRAG_SLOP, dragAxis, dragOffset, dragResult } from './swipe'

describe('dragging a value sideways', () => {
  it('waits for a clear direction, so the page can still scroll', () => {
    expect(dragAxis(DRAG_SLOP - 1, 0)).toBeUndefined()
    expect(dragAxis(-20, 5)).toBe('x')
    expect(dragAxis(6, 20)).toBe('y')
  })

  it('turns the page after a third of the width: left for later, right for earlier', () => {
    expect(dragResult(-120, 300, 0)).toBe(1)
    expect(dragResult(120, 300, 0)).toBe(-1)
    expect(dragResult(-90, 300, 0)).toBe(0)
  })

  it('also turns on a quick flick in the same direction, but not on a tiny one', () => {
    expect(dragResult(-40, 300, -0.8)).toBe(1)
    expect(dragResult(40, 300, 0.8)).toBe(-1)
    expect(dragResult(-40, 300, 0.8)).toBe(0)
    expect(dragResult(-10, 300, -2)).toBe(0)
  })

  it('follows the finger, or stretches a little where there is nothing more', () => {
    expect(dragOffset(-150, true)).toBe(-150)
    expect(dragOffset(-60, false)).toBe(-20)
    expect(dragOffset(300, false)).toBe(40)
  })
})
