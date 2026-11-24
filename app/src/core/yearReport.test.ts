import type { Extraction, Field, TaskEntry, TaskType, Unit } from './types'
import { describe, expect, it } from 'vitest'
import {
  averageCurve,
  cumulativeCurves,
  dayOfSeason,
  oilEstimate,
  oliveEstimate,
  valueOnDay,
  yearSummary,
} from './yearReport'

const record = { farmId: 'f', updatedAt: 0 }
const taskTypes: TaskType[] = [
  {
    ...record,
    id: 'h',
    name: 'Harvest',
    color: '',
    icon: '',
    inputKind: 'harvest',
    activeMonths: [],
    archived: false,
    order: 0,
  },
  {
    ...record,
    id: 'p',
    name: 'Pruning',
    color: '',
    icon: '',
    inputKind: 'trees',
    activeMonths: [],
    archived: false,
    order: 1,
  },
]
const fields: Field[] = [
  { ...record, id: 'a', name: 'A', trees: 100, archived: false, order: 0 },
  { ...record, id: 'b', name: 'B', trees: 60, archived: false, order: 1 },
  { ...record, id: 'c', name: 'Old', trees: 40, archived: true, order: 2 },
]

function harvest(
  id: string,
  date: string,
  trees: number,
  sacks: number,
  extra: Partial<TaskEntry> = {},
): TaskEntry {
  return {
    ...record,
    id,
    date,
    fieldId: 'a',
    taskTypeId: 'h',
    fieldFinished: false,
    trees,
    quantities: [{ unitId: 'sack', amount: sacks }],
    ...extra,
  }
}

function pressing(id: string, date: string, oliveKg: number, oilKg: number): Extraction {
  return {
    ...record,
    id,
    date,
    oliveKg,
    oilKg,
    charges: [{ chargeTypeId: 'fee', kg: oilKg / 10 }],
    storage: [],
    allocations: [],
  }
}

const entries: TaskEntry[] = [
  harvest('1', '2026-11-02', 20, 8),
  harvest('2', '2026-11-02', 10, 4, { fieldId: 'b' }), // same day: one work day
  harvest('3', '2026-11-05', 25, 9),
  harvest('4', '2027-01-10', 15, 5), // January is still the 2026 farming year
  harvest('5', '2025-11-20', 40, 14), // last year
  harvest('6', '2026-11-06', 5, 2, { deletedAt: 1 }),
  {
    ...record,
    id: 'p1',
    date: '2026-04-01',
    fieldId: 'a',
    taskTypeId: 'p',
    fieldFinished: false,
    trees: 30,
  },
  {
    ...record,
    id: 'p2',
    date: '2026-04-03',
    fieldId: 'a',
    taskTypeId: 'p',
    fieldFinished: false,
    trees: 50,
  },
]
const extractions = [
  pressing('x1', '2026-11-06', 1500, 300),
  pressing('x2', '2027-01-12', 500, 90),
  pressing('x3', '2025-11-25', 2500, 450),
]

describe('yearSummary', () => {
  const summary = yearSummary({ season: 2026, entries, extractions, fields, taskTypes })

  it('adds up units, olives and oil of the year', () => {
    expect(summary.units).toEqual({ sack: 26 })
    expect(summary.oliveKg).toBe(2000)
    expect(summary.oilKg).toBe(390)
    expect(summary.netOilKg).toBeCloseTo(351)
    expect(summary.productions).toBe(2)
  })

  it('averages per work day, counting a day once', () => {
    expect(summary.harvestDays).toBe(3)
    expect(summary.unitsPerHarvestDay.sack).toBeCloseTo(26 / 3)
    expect(summary.treesPerDay).toEqual([
      { taskTypeId: 'h', trees: 70, days: 3, perDay: 70 / 3 },
      { taskTypeId: 'p', trees: 80, days: 2, perDay: 40 },
    ])
  })

  it('compares trees harvested with the trees of the fields in use', () => {
    expect(summary.treesHarvested).toBe(70)
    expect(summary.farmTrees).toBe(160)
  })
})

describe('cumulativeCurves', () => {
  const harvestTypeIds = new Set(['h'])

  it('adds up units day by day, per farming year', () => {
    const curves = cumulativeCurves({
      metric: { kind: 'unit', unitId: 'sack' },
      entries,
      extractions,
      harvestTypeIds,
    })

    expect([...curves.keys()]).toEqual([2025, 2026])
    expect(curves.get(2026)).toEqual([
      { day: dayOfSeason('2026-11-02'), value: 12 },
      { day: dayOfSeason('2026-11-05'), value: 21 },
      { day: dayOfSeason('2027-01-10'), value: 26 },
    ])
  })

  it('does oil from productions and trees from harvests', () => {
    const oil = cumulativeCurves({
      metric: { kind: 'oil' },
      entries,
      extractions,
      harvestTypeIds,
    })
    const trees = cumulativeCurves({
      metric: { kind: 'trees' },
      entries,
      extractions,
      harvestTypeIds,
    })

    expect(oil.get(2026)!.at(-1)!.value).toBe(390)
    expect(trees.get(2026)!.at(-1)!.value).toBe(70)
    // Pruned trees are not harvested trees.
    expect(trees.get(2026)!.some((point) => point.value > 70)).toBe(false)
  })

  it('counts days from the start of the farming year', () => {
    expect(dayOfSeason('2026-03-01')).toBe(0)
    expect(dayOfSeason('2026-11-02')).toBe(246)
    expect(dayOfSeason('2027-01-10')).toBe(315)
    expect(dayOfSeason('2026-10-01', 10)).toBe(0)
  })
})

describe('averageCurve', () => {
  it('averages the running totals on every day any of them changes', () => {
    const average = averageCurve([
      [
        { day: 10, value: 4 },
        { day: 20, value: 10 },
      ],
      [{ day: 15, value: 6 }],
    ])

    expect(average).toEqual([
      { day: 10, value: 2 },
      { day: 15, value: 5 },
      { day: 20, value: 8 },
    ])

    expect(valueOnDay(average, 12)).toBe(2)
    expect(valueOnDay(average, 5)).toBe(0)
    expect(averageCurve([])).toEqual([])
  })
})

describe('oliveEstimate', () => {
  const sack: Unit = { ...record, id: 'sack', name: 'Sack', isDefault: true, archived: false }
  const crate: Unit = {
    ...record,
    id: 'crate',
    name: 'Crate',
    approxKg: 20,
    isDefault: false,
    archived: false,
  }
  const harvestTypeIds = new Set(['h'])
  const days = [
    harvest('d1', '2026-11-02', 20, 10),
    harvest('d2', '2026-11-03', 20, 12),
    harvest('d3', '2026-11-05', 20, 8),
  ]
  function linked(id: string, date: string, oliveKg: number, entryIds: string[]): Extraction {
    return {
      ...pressing(id, date, oliveKg, oliveKg / 5),
      allocations: entryIds.map((entryId) => ({
        entryId,
        quantities: days.find((day) => day.id === entryId)!.quantities!,
      })),
    }
  }

  it('estimates from the units until there is a weigh-in', () => {
    const result = oliveEstimate({
      season: 2026,
      entries: days,
      extractions: [],
      units: [{ ...sack, approxKg: 45 }],
      harvestTypeIds,
    })

    expect(result.weighedKg).toBe(0)
    expect(result.pending).toEqual([
      { unitId: 'sack', amount: 30, kgPerUnit: 45, source: 'user', kg: 1350 },
    ])

    expect(result.totalKg).toBe(1350)
  })

  it('uses each weigh-in for its own units, and its kg per unit for the rest', () => {
    // 22 sacks weighed 1,100 kg: 50 kg a sack; the 8 still waiting are about 400 kg.
    const result = oliveEstimate({
      season: 2026,
      entries: days,
      extractions: [linked('x', '2026-11-04', 1100, ['d1', 'd2'])],
      units: [{ ...sack, approxKg: 45 }],
      harvestTypeIds,
    })

    expect(result.weighIns[0].kgPerUnit).toEqual({ unitId: 'sack', kg: 50 })
    expect(result.pending).toEqual([
      { unitId: 'sack', amount: 8, kgPerUnit: 50, source: 'thisYear', kg: 400 },
    ])

    expect(result.totalKg).toBe(1500)
  })

  it('learns from earlier years when this year has no weigh-in yet', () => {
    const lastYear = harvest('old', '2025-11-02', 20, 10)
    const result = oliveEstimate({
      season: 2026,
      entries: [...days, lastYear],
      extractions: [
        {
          ...pressing('o', '2025-11-04', 420, 80),
          allocations: [{ entryId: 'old', quantities: lastYear.quantities! }],
        },
      ],
      units: [sack],
      harvestTypeIds,
    })

    expect(result.pending[0]).toMatchObject({ amount: 30, kgPerUnit: 42, source: 'earlier' })
  })

  it('counts a production without harvest days ticked against the waiting units', () => {
    // 30 sacks ≈ 1,350 kg are waiting; an unlinked 900 kg weigh-in leaves about 450 kg.
    const result = oliveEstimate({
      season: 2026,
      entries: days,
      extractions: [pressing('u', '2026-11-06', 900, 180)],
      units: [{ ...sack, approxKg: 45 }],
      harvestTypeIds,
    })

    expect(result.weighedKg).toBe(900)
    expect(result.pending[0].amount).toBeCloseTo(10)
    expect(result.estimatedKg).toBeCloseTo(450)
    expect(result.totalKg).toBeCloseTo(1350)
  })

  it('says which units cannot be estimated yet', () => {
    const crates = harvest('c', '2026-11-07', 5, 0, {
      quantities: [{ unitId: 'crate', amount: 6 }],
    })
    const result = oliveEstimate({
      season: 2026,
      entries: [...days, crates],
      extractions: [],
      units: [sack, crate],
      harvestTypeIds,
    })

    expect(result.unknown).toEqual({ sack: 30 })
    expect(result.pending).toEqual([
      { unitId: 'crate', amount: 6, kgPerUnit: 20, source: 'user', kg: 120 },
    ])
  })
})

describe('oilEstimate', () => {
  const none = {
    weighedKg: 0,
    estimatedKg: 0,
    totalKg: 0,
    weighIns: [],
    pending: [],
    unknown: {},
  }

  it('turns the olives not weighed yet into oil at this year’s yield', () => {
    // This year: 1,500 kg olives gave 300 kg oil (1/5), 270 kg after the 10 % charge.
    const result = oilEstimate({
      season: 2026,
      extractions: [pressing('a', '2026-11-06', 1500, 300)],
      olives: { ...none, weighedKg: 1500, estimatedKg: 800, totalKg: 2300 },
    })

    expect(result.status).toBe('estimate')
    expect(result.rate).toMatchObject({ source: 'thisYear', season: 2026, oilPerOlive: 0.2 })
    expect(result.madeKg).toBe(300)
    expect(result.expectedKg).toBeCloseTo(160)
    expect(result.expectedNetKg).toBeCloseTo(144)
    expect(result.missing).toEqual([])
  })

  it('uses the most recent earlier year until this year’s first production', () => {
    const result = oilEstimate({
      season: 2026,
      extractions: [
        pressing('old', '2023-11-06', 1000, 150),
        pressing('last', '2025-11-25', 2500, 450),
      ],
      olives: { ...none, estimatedKg: 1000, totalKg: 1000 },
    })

    expect(result.rate).toMatchObject({ source: 'earlier', season: 2025 })
    expect(result.expectedKg).toBeCloseTo(180)
    expect(result.madeKg).toBe(0)
  })

  it('waits for a yield when there has never been a production', () => {
    const result = oilEstimate({
      season: 2026,
      extractions: [],
      olives: { ...none, estimatedKg: 1000, totalKg: 1000 },
    })

    expect(result.status).toBe('waiting')
    expect(result.missing).toEqual(['yield'])
    expect(result.expectedKg).toBe(0)
  })

  it('waits for what the units weigh, and still estimates the ones it knows', () => {
    const waiting = oilEstimate({
      season: 2026,
      extractions: [pressing('last', '2025-11-25', 2500, 450)],
      olives: { ...none, unknown: { crate: 6 } },
    })

    expect(waiting.status).toBe('waiting')
    expect(waiting.missing).toEqual(['weight'])

    const partly = oilEstimate({
      season: 2026,
      extractions: [pressing('last', '2025-11-25', 2500, 450)],
      olives: { ...none, estimatedKg: 500, unknown: { crate: 6 } },
    })

    expect(partly.status).toBe('estimate')
    expect(partly.missing).toEqual(['weight'])
  })

  it('knows when everything has been weighed, or nothing harvested yet', () => {
    const extractions = [pressing('a', '2026-11-06', 1500, 300)]

    expect(
      oilEstimate({ season: 2026, extractions, olives: { ...none, weighedKg: 1500 } }).status,
    ).toBe('allWeighed')

    expect(oilEstimate({ season: 2026, extractions: [], olives: none }).status).toBe(
      'nothingYet',
    )
  })
})
