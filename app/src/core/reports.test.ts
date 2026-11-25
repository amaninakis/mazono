import type { Extraction, Field, TaskEntry, Transaction, Unit } from './types'
import { describe, expect, it } from 'vitest'
import {
  fieldSeasonReport,
  seasonHistory,
  toCsv,
  yearEconomics,
  yieldShare,
  yieldThroughSeason,
} from './reports'

const base = { farmId: 'f', updatedAt: 0 }
const sack: Unit = { ...base, id: 'sack', name: 'Sack', isDefault: true, archived: false }
const upper: Field = {
  ...base,
  id: 'up',
  name: 'Upper',
  trees: 100,
  archived: false,
  order: 0,
}
const lower: Field = {
  ...base,
  id: 'low',
  name: 'Lower',
  trees: 50,
  archived: false,
  order: 1,
}

function harvest(id: string, fieldId: string, date: string, trees: number, sacks: number) {
  return {
    ...base,
    id,
    date,
    fieldId,
    taskTypeId: 'h',
    trees,
    quantities: [{ unitId: 'sack', amount: sacks }],
    fieldFinished: false,
  } satisfies TaskEntry
}

function extraction(overrides: Partial<Extraction>): Extraction {
  return {
    ...base,
    id: Math.random().toString(),
    date: '2025-11-25',
    oliveKg: 0,
    oilKg: 0,
    charges: [],
    storage: [],
    allocations: [],
    ...overrides,
  }
}

const entries = [
  harvest('a', 'up', '2025-11-10', 40, 30),
  harvest('b', 'low', '2025-11-12', 0, 10),
  harvest('c', 'up', '2026-11-08', 60, 12),
]
const extractions = [
  // 40 sacks → 1600 kg olives → 320 kg oil, 3:1 by sacks between the two fields
  extraction({
    date: '2025-11-15',
    oliveKg: 1600,
    oilKg: 320,
    charges: [{ chargeTypeId: 'fee', kg: 32 }],
    acidity: 0.3,
    allocations: [
      { entryId: 'a', quantities: [{ unitId: 'sack', amount: 30 }] },
      { entryId: 'b', quantities: [{ unitId: 'sack', amount: 10 }] },
    ],
  }),
  extraction({
    date: '2026-11-20',
    oliveKg: 500,
    oilKg: 90,
    allocations: [{ entryId: 'c', quantities: [{ unitId: 'sack', amount: 12 }] }],
  }),
]

describe('fieldSeasonReport', () => {
  const report = fieldSeasonReport(
    [upper, lower],
    entries,
    extractions,
    [sack],
    new Set(['h']),
  )

  it('splits extractions between fields and seasons', () => {
    expect(report.seasons).toEqual([2025, 2026])
    const up = report.rows.find((row) => row.field.id === 'up')!.cells

    expect(up[2025]).toMatchObject({ oilKg: 240, netKg: 216, trees: 40, units: { sack: 30 } })
    expect(up[2026]).toMatchObject({ oilKg: 90, trees: 60 })
  })

  it('gives each field its share of the olives too, so its yield can be shown', () => {
    const up = report.rows.find((row) => row.field.id === 'up')!.cells

    // 30 of the 40 sacks of the 1,600 kg production: 1,200 kg of olives for 240 kg of oil.
    expect(up[2025].oliveKg).toBe(1200)
    expect(up[2025].oilKg / up[2025].oliveKg).toBeCloseTo(0.2)
  })

  it('uses harvested trees for "per tree", or the field size when none were entered', () => {
    const rows = Object.fromEntries(report.rows.map((row) => [row.field.id, row.cells]))

    expect(rows.up[2025].perTreeOf).toBe(40)
    expect(rows.low[2025].perTreeOf).toBe(50)
  })
})

describe('seasonHistory and yieldThroughSeason', () => {
  it('totals each season', () => {
    expect(seasonHistory(extractions)).toEqual([
      { season: 2025, extractions: 1, oliveKg: 1600, oilKg: 320, netKg: 288, chargesKg: 32 },
      { season: 2026, extractions: 1, oliveKg: 500, oilKg: 90, netKg: 90, chargesKg: 0 },
    ])
  })

  it('places extractions by day of the season, newest season first', () => {
    const seasons = yieldThroughSeason(extractions)

    expect(seasons.map((x) => x.season)).toEqual([2026, 2025])
    expect(seasons[1].points[0]).toMatchObject({ day: 259, yield: 0.2, acidity: 0.3 }) // 15 Nov = day 259 from 1 March
  })
})

describe('yearEconomics', () => {
  const transactions: Transaction[] = [
    { ...base, id: '1', date: '2025-03-01', kind: 'expense', party: 'Fuel', amount: 500 },
    { ...base, id: '2', date: '2025-12-01', kind: 'expense', party: 'Labour', amount: 940 },
    { ...base, id: '3', date: '2025-06-01', kind: 'income', party: 'Subsidy', amount: 288 },
    {
      ...base,
      id: '4',
      date: '2026-01-10',
      kind: 'sale',
      party: 'Coop',
      amount: 900,
      kg: 100,
    },
  ]

  it('sets each year’s money against the oil of the season starting that year', () => {
    const [y2025, y2026] = yearEconomics(transactions, extractions)

    expect(y2025).toMatchObject({ year: 2025, expenses: 1440, netOilKg: 288, net: -1152 })
    expect(y2025.costPerKg).toBe(5)
    // (1440 − 288 other income) ÷ 288 kg
    expect(y2025.breakEvenPrice).toBe(4)
    expect(y2026).toMatchObject({ year: 2026, sales: 900, netOilKg: 90, averagePrice: 9 })
    expect(y2026.costPerKg).toBeUndefined()
  })
})

describe('toCsv', () => {
  it('uses ; and decimal commas in Greek style, and quotes text when needed', () => {
    expect(
      toCsv(
        ['Field', 'Oil'],
        [
          ['Upper; old', 240.5],
          ['Lower', null],
        ],
        'el-GR',
      ),
    ).toBe('Field;Oil\r\n"Upper; old";240,5\r\nLower;')
  })

  it('uses , and decimal points in US style', () => {
    expect(toCsv(['Field', 'Oil'], [['Upper, old', 240.5]], 'en-US')).toBe(
      'Field,Oil\r\n"Upper, old",240.5',
    )
  })
})

describe('yieldShare', () => {
  it('places a yield between the usual poor and very good yields', () => {
    expect(yieldShare(1 / 7, [])).toBe(0)
    expect(yieldShare(1 / 4, [])).toBe(1)
    expect(yieldShare(1 / 5, [])).toBeCloseTo((1 / 5 - 1 / 7) / (1 / 4 - 1 / 7))
  })

  it('keeps yields past the usual ones at the ends', () => {
    expect(yieldShare(1 / 9, [])).toBe(0)
    expect(yieldShare(1 / 3.5, [])).toBe(1)
  })

  it("widens the scale to the farm's own lowest and highest", () => {
    expect(yieldShare(1 / 9, [1 / 9, 1 / 5])).toBe(0)
    expect(yieldShare(1 / 7, [1 / 9])).toBeGreaterThan(0)
    expect(yieldShare(1 / 4, [1 / 3])).toBeLessThan(1)
  })

  it('does not depend on the other cells: good years all look good', () => {
    const goodYears = [1 / 4.2, 1 / 4.1, 1 / 4]
    for (const value of goodYears) {
      expect(yieldShare(value, goodYears)).toBeGreaterThan(0.85)
    }
  })
})
