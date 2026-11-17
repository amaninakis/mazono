import type { Extraction, StockMovement, TaskEntry, Unit } from './types'
import { describe, expect, it } from 'vitest'
import {
  allocationShares,
  availableUnits,
  batchTrees,
  chargeFromPercent,
  chargeShare,
  netOil,
  newShortfalls,
  oilByEntry,
  previousExtractionDate,
  seasonTotals,
  shortfalls,
  stockLevels,
  unitWeights,
} from './oil'

const base = { farmId: 'f', updatedAt: 0 }
const sack: Unit = { ...base, id: 'sack', name: 'Sack', isDefault: true, archived: false }
const bin: Unit = {
  ...base,
  id: 'bin',
  name: 'Bin',
  isDefault: false,
  archived: false,
  approxKg: 300,
}
function entry(id: string, trees: number, qs: [string, number][]): TaskEntry {
  return {
    ...base,
    id,
    date: '2025-11-20',
    fieldId: 'A',
    taskTypeId: 'h',
    trees,

    fieldFinished: false,
    quantities: qs.map(([unitId, amount]) => ({ unitId, amount })),
  }
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

describe('charges', () => {
  it('net oil and shares', () => {
    const x = extraction({
      oilKg: 181,
      charges: [
        { chargeTypeId: 'fee', kg: 25.3 },
        { chargeTypeId: 'vat', kg: 3.4 },
      ],
    })

    expect(netOil(x)).toBeCloseTo(152.3)
    expect(chargeShare(25.3, 181)).toBeCloseTo(0.1398, 3)
    expect(chargeFromPercent(14, 181)).toBe(25.3)
  })
})

describe('allocation', () => {
  const e1 = entry('e1', 14, [['sack', 7]])
  it('splits an entry across extractions', () => {
    const first = extraction({
      allocations: [{ entryId: 'e1', quantities: [{ unitId: 'sack', amount: 4 }] }],
    })

    expect(availableUnits(e1, [first])).toEqual([{ unitId: 'sack', amount: 3 }])
    expect(availableUnits(e1, [first], first.id)).toEqual([{ unitId: 'sack', amount: 7 }])
    expect(availableUnits(e1, [{ ...first, deletedAt: 1 }])).toEqual([
      { unitId: 'sack', amount: 7 },
    ])
  })

  it('one unit type: plain split by units', () => {
    const shares = allocationShares(
      [
        { entryId: 'a', quantities: [{ unitId: 'sack', amount: 6 }] },
        { entryId: 'b', quantities: [{ unitId: 'sack', amount: 2 }] },
      ],
      {},
    )

    expect(shares).toEqual([0.75, 0.25])
  })

  it('mixed units: by weight', () => {
    const shares = allocationShares(
      [
        { entryId: 'a', quantities: [{ unitId: 'bin', amount: 1 }] }, // 300 kg
        { entryId: 'b', quantities: [{ unitId: 'sack', amount: 2 }] }, // 2 × 50 kg
      ],
      {
        bin: { kg: 300, source: 'user', batches: 0 },
        sack: { kg: 50, source: 'learned', batches: 1 },
      },
    )

    expect(shares[0]).toBeCloseTo(0.75)
  })

  it('oil per entry and trees in the batch', () => {
    const x = extraction({
      oliveKg: 500,
      oilKg: 100,
      charges: [{ chargeTypeId: 'fee', kg: 20 }],
      allocations: [
        { entryId: 'e1', quantities: [{ unitId: 'sack', amount: 4 }] },
        { entryId: 'e2', quantities: [{ unitId: 'sack', amount: 4 }] },
      ],
    })

    expect(oilByEntry(x, {})).toEqual({
      e1: { oil: 50, net: 40, olives: 250 },
      e2: { oil: 50, net: 40, olives: 250 },
    })

    expect(batchTrees(x, [e1, entry('e2', 10, [['sack', 4]])])).toBeCloseTo(14 * (4 / 7) + 10)
  })

  it('previous extraction date', () => {
    const xs = [
      extraction({ date: '2025-11-10' }),
      extraction({ date: '2025-11-20' }),
      extraction({ date: '2025-12-01' }),
    ]

    expect(previousExtractionDate(xs, '2025-11-25')).toBe('2025-11-20')
    expect(previousExtractionDate(xs, '2025-11-01')).toBeUndefined()
  })
})

describe('unit weights', () => {
  it('learns from single-unit batches and falls back to the user estimate', () => {
    const xs = [
      extraction({
        oliveKg: 400,
        allocations: [{ entryId: 'a', quantities: [{ unitId: 'sack', amount: 8 }] }],
      }),
      extraction({
        oliveKg: 600,
        allocations: [{ entryId: 'b', quantities: [{ unitId: 'sack', amount: 12 }] }],
      }),
      // mixed batch: not used for learning
      extraction({
        oliveKg: 999,
        allocations: [
          {
            entryId: 'c',
            quantities: [
              { unitId: 'sack', amount: 1 },
              { unitId: 'bin', amount: 1 },
            ],
          },
        ],
      }),
    ]
    const weights = unitWeights([sack, bin], xs)

    expect(weights.sack).toEqual({ kg: 50, source: 'learned', batches: 2 })
    expect(weights.bin).toEqual({ kg: 300, source: 'user', batches: 0 })
  })
})

describe('stock', () => {
  it('per vintage and location, with transfers and own use', () => {
    const xs = [
      extraction({
        date: '2025-11-25',
        storage: [
          { locationId: 'mill', kg: 150 },
          { locationId: 'home', kg: 20 },
        ],
      }),
      extraction({ date: '2024-12-10', storage: [{ locationId: 'mill', kg: 80 }] }),
    ]
    function mv(overrides: Partial<StockMovement>): StockMovement {
      return {
        ...base,
        id: Math.random().toString(),
        date: '2026-01-10',
        vintage: 2025,
        kind: 'transfer',
        fromLocationId: 'mill',
        kg: 0,

        ...overrides,
      }
    }
    const stock = stockLevels(xs, [
      mv({ kind: 'transfer', toLocationId: 'home', kg: 30 }),
      mv({ kind: 'ownUse', fromLocationId: 'home', kg: 5 }),
      mv({ vintage: 2024, kind: 'ownUse', kg: 10 }),
    ])

    expect(stock[2025]).toEqual({ mill: 120, home: 45 })
    expect(stock[2024]).toEqual({ mill: 70 })
  })

  it('season totals', () => {
    const xs = [
      extraction({
        date: '2025-11-25',
        oliveKg: 792,
        oilKg: 181,
        charges: [{ chargeTypeId: 'fee', kg: 25 }],
        storage: [{ locationId: 'mill', kg: 156 }],
      }),
      extraction({
        date: '2026-01-05',
        oliveKg: 1000,
        oilKg: 230,
        charges: [{ chargeTypeId: 'fee', kg: 30 }],
        storage: [{ locationId: 'mill', kg: 200 }],
      }),
      extraction({ date: '2025-01-05', oliveKg: 1, oilKg: 1 }), // previous season
    ]

    expect(seasonTotals(xs, 2025)).toMatchObject({
      count: 2,
      oliveKg: 1792,
      oilKg: 411,
      chargesKg: 55,
      netKg: 356,
      storedKg: 356,
      byCharge: { fee: 55 },
    })
  })
})

describe('oil missing from stock', () => {
  it('finds places holding less than nothing, ignoring a gram of rounding', () => {
    expect(shortfalls({ 2025: { mill: -0.02, home: 0 }, 2024: { mill: -0.0004 } })).toEqual([
      { vintage: 2025, locationId: 'mill', kg: 0.02 },
    ])
  })

  it('reports what a change makes worse, not what was already short', () => {
    const before = { 2025: { mill: 0.5, home: -1 } }

    expect(newShortfalls(before, { 2025: { mill: -0.02, home: -1 } })).toEqual([
      { vintage: 2025, locationId: 'mill', kg: 0.02 },
    ])

    expect(newShortfalls(before, { 2025: { mill: 0, home: -1.5 } })).toEqual([
      { vintage: 2025, locationId: 'home', kg: 1.5 },
    ])

    expect(newShortfalls(before, { 2025: { mill: 0.1, home: -0.5 } })).toEqual([])
  })

  it('catches the sale entered before a production was corrected', () => {
    const production = {
      id: 'p1',
      farmId: 'f',
      updatedAt: 0,
      date: '2025-11-30',
      oliveKg: 1087,
      oilKg: 264,
      charges: [],
      storage: [{ locationId: 'mill', kg: 28.81 }],
      allocations: [],
    }
    const sale = {
      id: 's1',
      farmId: 'f',
      updatedAt: 0,
      date: '2026-07-01',
      kind: 'sale' as const,
      party: 'Buyer',
      amount: 100,
      kg: 28.81,
      vintage: 2025,
      locationId: 'mill',
    }
    const before = stockLevels([production], [], 3, [sale])
    const corrected = { ...production, storage: [{ locationId: 'mill', kg: 28.79 }] }

    expect(newShortfalls(before, stockLevels([corrected], [], 3, [sale]))).toEqual([
      { vintage: 2025, locationId: 'mill', kg: 0.02 },
    ])
  })
})
