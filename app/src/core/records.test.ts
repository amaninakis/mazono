import type { Extraction, Field, TaskEntry, Transaction, Unit } from './types'
import { describe, expect, it } from 'vitest'
import { farmRecords } from './records'

const base = { farmId: 'f', updatedAt: 0 }
const sack: Unit = { ...base, id: 'sack', name: 'Sack', isDefault: true, archived: false }
const fields: Field[] = [
  { ...base, id: 'up', name: 'Upper', trees: 100, archived: false, order: 0 },
  { ...base, id: 'low', name: 'Lower', trees: 20, archived: false, order: 1 },
]

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

function production(overrides: Partial<Extraction>): Extraction {
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
  harvest('a', 'up', '2025-11-10', 60, 30),
  harvest('b', 'low', '2025-11-10', 20, 10),
  harvest('c', 'up', '2026-11-08', 40, 12),
]
const extractions = [
  production({
    date: '2025-11-15',
    oliveKg: 1600,
    oilKg: 320,
    acidity: 0.4,
    charges: [{ chargeTypeId: 'fee', kg: 32 }],
    allocations: [
      { entryId: 'a', quantities: [{ unitId: 'sack', amount: 30 }] },
      { entryId: 'b', quantities: [{ unitId: 'sack', amount: 10 }] },
    ],
  }),
  production({
    date: '2027-01-20', // still the 2026 harvest (year starts in March)
    oliveKg: 480,
    oilKg: 110,
    acidity: 0.25,
    allocations: [{ entryId: 'c', quantities: [{ unitId: 'sack', amount: 12 }] }],
  }),
]
const transactions: Transaction[] = [
  {
    ...base,
    id: 's1',
    date: '2026-02-01',
    kind: 'sale',
    party: 'Coop',
    amount: 800,
    kg: 100,
    pricePerKg: 8,
  },
  {
    ...base,
    id: 's2',
    date: '2027-03-01',
    kind: 'sale',
    party: 'Neighbour',
    amount: 470,
    kg: 50,
    pricePerKg: 9.4,
  },
]

const { records, totals } = farmRecords({
  fields,
  entries,
  extractions,
  transactions,
  units: [sack],
  harvestTypeIds: new Set(['h']),
})

describe('farmRecords', () => {
  it('finds the best years and productions', () => {
    expect(records.bestYear).toEqual({ year: 2025, netKg: 288 })
    expect(records.bestYieldYear?.year).toBe(2026) // 110 ÷ 480 beats 320 ÷ 1600
    expect(records.bestProduction?.date).toBe('2027-01-20')
    expect(records.biggestProduction).toEqual({ date: '2025-11-15', oilKg: 320 })
    expect(records.lowestAcidity).toEqual({ date: '2027-01-20', acidity: 0.25 })
  })

  it('finds the best field', () => {
    // Lower: 80 kg oil from 20 trees = 4 kg/tree; Upper 2025: 240 ÷ 60 = 4 too, Upper 2026: 110 ÷ 40
    expect(records.bestFieldYear).toEqual({ fieldId: 'up', year: 2025, kgPerTree: 4 })
    expect(records.topField).toEqual({ fieldId: 'up', oilKg: 350 })
  })

  it('finds the biggest harvest day and best sale price', () => {
    expect(records.biggestDay).toEqual({ date: '2025-11-10', units: { sack: 40 } })
    expect(records.mostTreesDay).toEqual({ date: '2025-11-10', trees: 80 })
    expect(records.bestPrice).toEqual({
      date: '2027-03-01',
      pricePerKg: 9.4,
      party: 'Neighbour',
    })
  })

  it('adds up lifetime totals', () => {
    expect(totals).toEqual({
      netOilKg: 398,
      oliveKg: 2080,
      productions: 2,
      harvestDays: 2,
      treesHarvested: 120,
      years: 2,
      salesAmount: 1270,
    })
  })

  it('has no records for a new farm', () => {
    const empty = farmRecords({
      fields,
      entries: [],
      extractions: [],
      transactions: [],
      units: [sack],
      harvestTypeIds: new Set(['h']),
    })

    expect(empty.records).toEqual({})
    expect(empty.totals.netOilKg).toBe(0)
  })
})
