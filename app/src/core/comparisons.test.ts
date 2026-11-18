import type { Comparison, ComparisonInput } from './comparisons'
import { describe, expect, it } from 'vitest'
import {
  amountOf,
  comparisons,
  daySeed,
  dealFacts,
  latestYearTotals,
  perTreeTotals,
  roundNicely,
  SLOTS,
} from './comparisons'

const year = { oliveKg: 4400, netOilKg: 880, trees: 180 }
const all = { oliveKg: 30_000, netOilKg: 6000, trees: 1200 }
const input: ComparisonInput = {
  latest: { season: 2026, totals: year },
  all,
  bestYear: { season: 2024, netOilKg: 1500 },
  biggestProduction: { date: '2025-12-02', oilKg: 420 },
  busiestDay: { date: '2025-11-20', trees: 38 },
  farmTrees: 640,
  perTree: { netOilKg: 5000, trees: 1100 },
}
const SHORT = new Set(['year'])

describe('comparisons', () => {
  it('says amounts the way people do', () => {
    expect(amountOf(6.3)).toEqual({ kind: 'times', count: 6.5 })
    expect(amountOf(1.1)).toEqual({ kind: 'about' })
    expect(amountOf(0.52)).toEqual({ kind: 'fraction', part: '½' })
    expect(amountOf(0.7)).toEqual({ kind: 'fraction', part: '⅔' })
    expect(amountOf(23.4)).toEqual({ kind: 'times', count: 23 })
    expect(roundNicely(1234)).toBe(1200)
  })

  it('shows four facts: two about the year, two long-term', () => {
    for (let seed = 0; seed < 30; seed++) {
      const cards = comparisons(input, seed)

      expect(cards.map((card) => card.slot)).toEqual(SLOTS)
      expect(cards.slice(0, 2).every((card) => SHORT.has(card.scope))).toBe(true)
      expect(cards.slice(2).every((card) => !SHORT.has(card.scope))).toBe(true)
    }
  })

  it('pairs two facts about different things', () => {
    for (let seed = 0; seed < 30; seed++) {
      const [first, second, third, fourth] = comparisons(input, seed)

      expect(first.id).not.toBe(second.id)
      expect(third.id).not.toBe(fourth.id)
      // Each pool has oil, olives, trees and averages: a pair never starts on the same topic.
      expect(topicOf(first)).not.toBe(topicOf(second))
      expect(topicOf(third)).not.toBe(topicOf(fourth))
    }
  })

  it('uses per-tree, per-litre, tree-count and record facts', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 5; seed++) {
      for (let turn = 0; turn < 12; turn++) {
        for (const card of comparisons(input, seed, {
          short0: turn,
          short1: turn,
          long0: turn,
          long1: turn,
        })) {
          seen.add(card.id)
        }
      }
    }

    for (const id of [
      'oilPerTree:year',
      'olivesPerLitre:year',
      'oilPerTree:all',
      'olivesPerLitre:all',
      'oilVolume:bestYear',
      'oilWeight:biggestProduction',
      'treeLine:busiestDay',
      'treeLine:farm',
      'family:year',
      'oliveWeight:all',
    ]) {
      expect(seen).toContain(id)
    }
  })

  it('"show another" changes only its own card', () => {
    const today = comparisons(input, 3)
    for (const slot of SLOTS) {
      const another = comparisons(input, 3, { [slot]: 1 })
      for (const [i, card] of another.entries()) {
        if (card.slot === slot) {
          expect(`${card.id}/${card.reference}`).not.toBe(
            `${today[i].id}/${today[i].reference}`,
          )
        } else {
          expect(card).toEqual(today[i])
        }
      }
    }
  })

  it('changes from day to day', () => {
    const days = new Set(
      Array.from({ length: 7 }, (_, day) =>
        comparisons(input, day)
          .map((card) => card.id)
          .join(),
      ),
    )

    expect(days.size).toBeGreaterThan(1)
  })

  it('picks objects that fit the number', () => {
    for (let turn = 0; turn < 12; turn++) {
      for (const card of comparisons(input, 0, { short0: turn, short1: turn })) {
        if (card.amount?.kind === 'times') {
          expect(card.amount.count).toBeLessThanOrEqual(60)
        }
        // 880 kg of oil is about 960 litres: no Olympic pools for that.
        if (card.id === 'oilVolume:year') {
          expect(card.reference).not.toBe('olympicPool')
        }
      }
    }
  })

  it('takes the long-term oil per tree only from years with tree counts', () => {
    // 5,000 kg ÷ 0.916 ≈ 5,459 L over 1,100 trees ≈ 5 L a tree, not all 6,000 kg.
    const card = allCards(input).find((each) => each.id === 'oilPerTree:all')!

    expect(card.reference).toBe('bottle')
    expect(card.amount).toEqual({ kind: 'times', count: 5 })
    expect(
      allCards({ ...input, perTree: undefined }).some((each) => each.id === 'oilPerTree:all'),
    ).toBe(false)
  })

  it('works out oil per tree and olives per litre', () => {
    const cards = allCards(input)
    // 880 kg ÷ 0.916 ≈ 961 L over 180 trees ≈ 5.3 L a tree: about 5½ bottles.
    const perTree = cards.find((card) => card.id === 'oilPerTree:year')!

    expect(perTree.reference).toBe('bottle')
    expect(perTree.amount).toEqual({ kind: 'times', count: 5.5 })
    expect(perTree.next).toBeUndefined()
    // 4,400 kg of olives for 961 L: about 4.6 kg a litre.
    expect(cards.find((card) => card.id === 'olivesPerLitre:year')?.count).toBe(4.6)
    expect(cards.find((card) => card.id === 'family:year')?.count).toBe(18.5)
  })

  it('says what comes next for totals', () => {
    const card = allCards(input).find((each) => each.id === 'oilVolume:year')!

    expect(card.next!.missing).toBeGreaterThan(0)
    expect(card.next!.progress).toBeGreaterThan(0)
    expect(card.next!.progress).toBeLessThan(1)
    // Records and the farm's trees don't grow: no "… more for …".
    expect(allCards(input).find((each) => each.scope === 'busiestDay')?.next).toBeUndefined()
  })

  it('measures progress from the last whole one, not from zero', () => {
    // 5,500 kg of oil ≈ 6.0 one-tonne tanks: just started on the 7th.
    const cards = allCards({ ...input, all: { ...all, netOilKg: 5500 } })
    for (const card of cards) {
      if (card.id === 'oilVolume:all' && card.reference === 'waterTank' && card.next) {
        expect(card.next.progress).toBeLessThan(0.1)
      }
    }
  })

  it('never offers as "next" the number the card already shows', () => {
    // 5,490 kg of oil is 21.96 donkeys: the card says 22, so next is 23.
    for (const card of allCards({ ...input, all: { ...all, netOilKg: 5490 } })) {
      if (card.amount?.kind === 'times' && card.next) {
        expect(card.next.count).toBeGreaterThan(card.amount.count)
      }
    }
  })

  it('does not repeat the year as "all years" when there is only one year', () => {
    const cards = allCards({
      latest: { season: 2026, totals: year },
      all: year,
      biggestProduction: { date: '2026-11-02', oilKg: 420 },
      busiestDay: { date: '2026-11-05', trees: 38 },
      bestYear: { season: 2026, netOilKg: 880 },
      farmTrees: 640,
    })

    expect(cards.some((card) => card.scope === 'all' || card.scope === 'bestYear')).toBe(false)

    expect(cards.filter((card) => card.slot.startsWith('long')).length).toBeGreaterThan(0)
  })

  it('leaves out what is still zero', () => {
    const cards = comparisons({ all: { oliveKg: 0, netOilKg: 0, trees: 0 }, farmTrees: 0 }, 0)

    expect(cards).toEqual([])
  })

  it('changes once a day', () => {
    expect(daySeed(new Date('2026-11-17T08:00:00Z'))).toBe(
      daySeed(new Date('2026-11-17T20:00:00Z')),
    )
  })
})

describe('dealFacts', () => {
  it('starts the two places on different topics', () => {
    const facts = [
      { measure: 'oilVolume' as const },
      { measure: 'oilWeight' as const },
      { measure: 'family' as const },
      { measure: 'treeLine' as const },
    ]

    for (let seed = 0; seed < 20; seed++) {
      const [first, second] = dealFacts(facts, seed)

      expect(first.length + second.length).toBe(4)
      expect(first[0].measure === 'treeLine' || second[0].measure === 'treeLine').toBe(true)
    }
  })
})

/** Every card the four places go through. */
function allCards(source: ComparisonInput) {
  const cards = []
  for (let turn = 0; turn < 12; turn++) {
    cards.push(
      ...comparisons(source, 0, { short0: turn, short1: turn, long0: turn, long1: turn }),
    )
  }

  return cards
}

function topicOf(card: Comparison) {
  const topics: Record<string, string> = {
    oilVolume: 'oil',
    oilWeight: 'oil',
    family: 'oil',
    salads: 'oil',
    oliveWeight: 'olives',
    treeLine: 'trees',
    oilPerTree: 'average',
    olivesPerLitre: 'average',
  }

  return topics[card.measure]
}

describe('perTreeTotals', () => {
  const base = { farmId: 'f', updatedAt: 0, charges: [], storage: [], allocations: [] }
  const harvest = { farmId: 'f', updatedAt: 0, fieldId: 'x', fieldFinished: false }

  it('leaves out years whose oil has no tree counts', () => {
    const result = perTreeTotals(
      [
        { ...base, id: 'a', date: '2019-11-20', oliveKg: 5000, oilKg: 1000 }, // no trees logged
        { ...base, id: 'b', date: '2025-11-20', oliveKg: 1000, oilKg: 200 },
        { ...base, id: 'c', date: '2026-11-15', oliveKg: 500, oilKg: 100 },
      ],
      [
        { ...harvest, id: 'e', date: '2025-11-10', taskTypeId: 'h', trees: 40 },
        { ...harvest, id: 'f', date: '2026-11-10', taskTypeId: 'h', trees: 20 },
        { ...harvest, id: 'g', date: '2026-11-11', taskTypeId: 'prune', trees: 90 },
        { ...harvest, id: 'h', date: '2024-11-11', taskTypeId: 'h', trees: 30 }, // no oil
      ],
      new Set(['h']),
    )

    expect(result).toEqual({ netOilKg: 300, trees: 60 })
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
