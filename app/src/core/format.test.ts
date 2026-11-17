import { describe, expect, it } from 'vitest'
import { ratioTicks } from './format'

describe('ratioTicks', () => {
  it('puts the lines on whole ratios and widens the axis to them', () => {
    const { range, ticks } = ratioTicks(0.19, 0.31)

    expect(ticks.map((value) => Math.round(1 / value))).toEqual([6, 5, 4, 3])
    expect(range[0]).toBeCloseTo(1 / 6)
    expect(range[1]).toBeCloseTo(1 / 3)
  })

  it('uses halves for a narrow range', () => {
    const { ticks } = ratioTicks(0.21, 0.24)

    expect(ticks.map((value) => 1 / value)).toEqual([5, 4.5, 4])
  })
})
