import { describe, expect, it } from 'vitest'
import { isFutureMonth, monthsWithWork, shownMonth } from './months'

describe('monthsWithWork', () => {
  it('lists the months of the year that have work', () => {
    const dates = ['2026-01-03', '2026-01-20', '2026-11-23', '2025-11-02', '2027-02-01']

    const months = [...monthsWithWork(dates, 2026)].sort((left, right) => left - right)

    expect(months).toEqual([1, 11])
  })

  it('is empty for a year without work', () => {
    expect(monthsWithWork(['2026-05-01'], 2024).size).toBe(0)
  })
})

describe('isFutureMonth', () => {
  const today = '2026-11-23'

  it('treats this month and earlier as past', () => {
    expect(isFutureMonth(2026, 11, today)).toBe(false)
    expect(isFutureMonth(2025, 12, today)).toBe(false)
  })

  it('treats later months as future', () => {
    expect(isFutureMonth(2026, 12, today)).toBe(true)
    expect(isFutureMonth(2027, 1, today)).toBe(true)
  })
})

describe('shownMonth', () => {
  const today = '2026-11-23'

  it('keeps a past month', () => {
    expect(shownMonth(2025, 3, today)).toBe('2025-03')
  })

  it('moves a future month back to this month', () => {
    expect(shownMonth(2026, 12, today)).toBe('2026-11')
  })
})
