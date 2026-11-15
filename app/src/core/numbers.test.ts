import { describe, expect, it } from 'vitest'
import { parsePastedNumber } from './numbers'

describe('parsePastedNumber', () => {
  it('drops currency signs, units and words', () => {
    expect(parsePastedNumber('255 €', 'el-GR')).toBe(255)
    expect(parsePastedNumber('255,00€', 'el-GR')).toBe(255)
    expect(parsePastedNumber('EUR 99.90', 'en-US')).toBe(99.9)
    expect(parsePastedNumber('12,5 kg', 'el-GR')).toBe(12.5)
    expect(parsePastedNumber('Σύνολο: 48,36 €', 'el-GR')).toBe(48.36)
  })

  it('understands thousands separators in either style', () => {
    expect(parsePastedNumber('€ 1.234,56', 'el-GR')).toBe(1234.56)
    expect(parsePastedNumber('$1,234.56', 'en-US')).toBe(1234.56)
    expect(parsePastedNumber('1,234.56', 'el-GR')).toBe(1234.56)
    expect(parsePastedNumber('1 234,50 €', 'el-GR')).toBe(1234.5)
    expect(parsePastedNumber('3.000.000', 'en-US')).toBe(3_000_000)
  })

  it('uses the app format when a single separator is ambiguous', () => {
    expect(parsePastedNumber('1.500', 'el-GR')).toBe(1500)
    expect(parsePastedNumber('1.500', 'en-US')).toBe(1.5)
    expect(parsePastedNumber('1,500', 'en-US')).toBe(1500)
    expect(parsePastedNumber('1,50', 'en-US')).toBe(1.5)
  })

  it('keeps a minus sign and rejects text without a number', () => {
    expect(parsePastedNumber('−20 €', 'el-GR')).toBe(-20)
    expect(parsePastedNumber('€', 'el-GR')).toBeNull()
    expect(parsePastedNumber('no amount', 'en-US')).toBeNull()
  })
})
