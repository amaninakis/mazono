import { describe, expect, it } from 'vitest'
import { amountOf, comparisons, daySeed, latestYearTotals, roundNicely } from './comparisons'

const year = { oliveKg: 4400, netOilKg: 880, trees: 180 }
const all = { oliveKg: 30_000, netOilKg: 6000, trees: 1200 }

describe('comparisons', () => {
  it('says amounts the way people do', () => {
    expect(amountOf(6.3)).toEqual({ kind: 'times', count: 6.5 })
    expect(amountOf(1.1)).toEqual({ kind: 'about' })
    expect(amountOf(0.52)).toEqual({ kind: 'fraction', part: '½' })
    expect(amountOf(0.7)).toEqual({ kind: 'fraction', part: '⅔' })
    expect(amountOf(23.4)).toEqual({ kind: 'times', count: 23 })
    expect(roundNicely(1234)).toBe(1200)
  })

  it('picks objects that fit the number, never the same one twice', () => {
    const cards = comparisons({ year, all }, 0)
    const objects = cards.flatMap((card) => (card.reference ? [card.reference] : []))

    expect(new Set(objects).size).toBe(objects.length)

    for (const card of cards) {
      if (card.amount?.kind === 'times') {
        expect(card.amount.count).toBeLessThanOrEqual(60)
      }
    }
    // 880 kg of oil is about 960 litres: no Olympic pools for that.
    expect(cards.find((card) => card.id === 'oilVolume:year')?.reference).not.toBe(
      'olympicPool',
    )
  })

  it('changes from day to day and with "show another"', () => {
    const today = comparisons({ year, all }, 0)
    const another = comparisons({ year, all }, 0, { 'oliveWeight:year': 1 })
    const tomorrow = comparisons({ year, all }, 1)

    expect(another[0].reference).not.toBe(today[0].reference)
    expect(tomorrow.map((card) => card.reference)).not.toEqual(
      today.map((card) => card.reference),
    )
  })

  it('says what comes next', () => {
    const card = comparisons({ year, all }, 0).find((each) => each.id === 'oilVolume:year')!

    expect(card.next!.missing).toBeGreaterThan(0)
    expect(card.next!.progress).toBeGreaterThan(0)
    expect(card.next!.progress).toBeLessThan(1)
  })

  it('measures progress from the last whole one, not from zero', () => {
    // 5,500 L of oil ≈ 6.0 one-tonne tanks: just started on the 7th.
    const cards = comparisons({ year, all: { ...all, netOilKg: 5500 } }, 0)
    const tanks = cards.find((card) => card.reference === 'waterTank')
    if (tanks?.next) {
      expect(tanks.next.progress).toBeLessThan(0.1)
    }
  })

  it('never offers as "next" the number the card already shows', () => {
    // 5,490 kg of oil is 21.96 donkeys: the card says 22, so next is 23.
    const cards = comparisons({ year, all: { ...all, netOilKg: 5490 } }, 0)
    for (const card of cards) {
      if (card.amount?.kind === 'times') {
        expect(card.next!.count).toBeGreaterThan(card.amount.count)
      }
    }
  })

  it('counts years of oil for a family, and leaves out what is still zero', () => {
    const cards = comparisons({ year: { oliveKg: 0, netOilKg: 0, trees: 0 }, all }, 0)

    expect(cards.some((card) => card.scope === 'year')).toBe(false)
    expect(
      comparisons({ year, all }, 0).find((card) => card.measure === 'family')?.count,
    ).toBe(18.5) // 880 kg ÷ (4 people × 12 kg a year)
  })

  it('changes once a day', () => {
    expect(daySeed(new Date('2026-11-17T08:00:00Z'))).toBe(
      daySeed(new Date('2026-11-17T20:00:00Z')),
    )
  })
})

describe('latestYearTotals', () => {
  const base = { farmId: 'f', updatedAt: 0, charges: [], storage: [], allocations: [] }

  it('uses the latest farming year with a production', () => {
    const result = latestYearTotals(
      [
        { ...base, id: 'a', date: '2025-11-20', oliveKg: 1000, oilKg: 200 },
        {
          ...base,
          id: 'b',
          date: '2026-11-15',
          oliveKg: 500,
          oilKg: 100,
          charges: [{ chargeTypeId: 'fee', kg: 10 }],
        },
        { ...base, id: 'c', date: '2027-01-10', oliveKg: 300, oilKg: 60 }, // still the 2026 year
      ],
      [
        {
          id: 'e',
          farmId: 'f',
          updatedAt: 0,
          date: '2026-11-10',
          fieldId: 'x',
          taskTypeId: 'h',
          fieldFinished: false,
          trees: 12,
        },
        {
          id: 'p',
          farmId: 'f',
          updatedAt: 0,
          date: '2026-04-10',
          fieldId: 'x',
          taskTypeId: 'prune',
          fieldFinished: false,
          trees: 30,
        },
      ],
      new Set(['h']),
    )

    expect(result).toEqual({
      season: 2026,
      totals: { oliveKg: 800, netOilKg: 150, trees: 12 },
    })

    expect(latestYearTotals([], [], new Set())).toBeUndefined()
  })
})
