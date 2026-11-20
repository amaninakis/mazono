import { describe, expect, it } from 'vitest'
import { formatNumber, ratioTicks } from './format'

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

describe('formatNumber with fixed decimals', () => {
  it('pads charges to two decimals', () => {
    expect(formatNumber(11.7, 'el-GR', 2, 2)).toBe('11,70')
    expect(formatNumber(11.666, 'el-GR', 2, 2)).toBe('11,67')
    expect(formatNumber(11.7, 'el-GR')).toBe('11,7')
  })
})
