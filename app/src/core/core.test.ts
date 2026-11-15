import type { Field, TaskEntry, TaskType } from './types'
import { describe, expect, it } from 'vitest'
import { addDays, monthGrid, seasonLabel, seasonOf, seasonRange } from './dates'
import { formatMoney, formatYield } from './format'
import {
  defaultFieldId,
  defaultTaskTypeId,
  fieldProgress,
  fieldSeasonHarvest,
  harvestYields,
  parseDecimal,
  perTree,
} from './progress'

const base = { farmId: 'f', updatedAt: 0 }
function field(id: string, trees: number, order = 0): Field {
  return {
    ...base,
    id,
    name: id,
    trees,
    archived: false,

    order,
  }
}
const harvest: TaskType = {
  ...base,
  id: 'h',
  builtin: 'harvest',
  name: 'harvest',
  color: '',

  icon: '',
  inputKind: 'harvest',
  activeMonths: [10, 11, 12, 1],
  archived: false,

  order: 0,
}
const pruning: TaskType = {
  ...harvest,
  id: 'p',
  builtin: 'pruning',
  inputKind: 'trees',
  activeMonths: [12, 1, 2, 3],

  order: 1,
}
const weeding: TaskType = {
  ...harvest,
  id: 'w',
  builtin: 'weeding',
  inputKind: 'done',
  activeMonths: [4],
  order: 2,
}
function entry(overrides: Partial<TaskEntry>): TaskEntry {
  return {
    ...base,
    id: Math.random().toString(),
    date: '2025-11-15',
    fieldId: 'A',

    taskTypeId: 'h',
    fieldFinished: false,

    ...overrides,
  }
}

describe('seasons', () => {
  it('starts in October by default', () => {
    expect(seasonOf('2025-10-01')).toBe(2025)
    expect(seasonOf('2025-09-30')).toBe(2024)
    expect(seasonOf('2026-01-10')).toBe(2025)
  })

  it('labels and ranges', () => {
    expect(seasonLabel(2025)).toBe('2025–26')
    expect(seasonLabel(2025, 1)).toBe('2025')
    expect(seasonRange(2025)).toEqual(['2025-10-01', '2026-09-30'])
  })

  it('adds days across months', () => {
    expect(addDays('2025-11-30', 1)).toBe('2025-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('builds a Monday-first month grid', () => {
    const grid = monthGrid(2026, 11)

    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(grid.length % 7).toBe(0)
  })
})

describe('field progress', () => {
  const fields = [field('A', 22), field('B', 10, 1), field('C', 0, 2)]

  it('counts remaining trees in the current season only', () => {
    const entries = [
      entry({ fieldId: 'A', trees: 14 }),
      entry({ fieldId: 'A', trees: 5, date: '2024-11-20' }), // last season
    ]
    const rows = fieldProgress(fields, entries, harvest, '2025-11-16')

    expect(rows[0]).toMatchObject({ done: 14, remaining: 8, finished: false })
    expect(rows[1]).toMatchObject({ done: 0, remaining: 10 })
    expect(rows[2].remaining).toBeNull() // unknown tree count
  })

  it('finishes a field when all trees are done or it is flagged', () => {
    const entries = [
      entry({ fieldId: 'B', trees: 10 }),
      entry({ fieldId: 'A', trees: 3, fieldFinished: true }),
    ]
    const rows = fieldProgress(fields, entries, harvest, '2025-11-16')

    expect(rows[0].finished).toBe(true)
    expect(rows[1].finished).toBe(true)
  })

  it('ignores deleted entries and the entry being edited', () => {
    const harvestEntry = entry({ fieldId: 'A', trees: 10 })
    const entries = [harvestEntry, entry({ fieldId: 'A', trees: 4, deletedAt: 1 })]

    expect(fieldProgress(fields, entries, harvest, '2025-11-16')[0].done).toBe(10)
    expect(
      fieldProgress(fields, entries, harvest, '2025-11-16', 10, harvestEntry.id)[0].done,
    ).toBe(0)
  })

  it('weeding has no tree count, only finished', () => {
    const rows = fieldProgress(
      fields,
      [entry({ taskTypeId: 'w', fieldId: 'A', fieldFinished: true })],
      weeding,
      '2026-04-02',
    )

    expect(rows[0]).toMatchObject({ remaining: null, finished: true })
  })

  it('defaults to the most recently worked unfinished field', () => {
    const entries = [
      entry({ fieldId: 'A', trees: 22, date: '2025-11-14' }), // A done
      entry({ fieldId: 'C', trees: 3, date: '2025-11-15' }),
      entry({ fieldId: 'B', trees: 2, date: '2025-11-13' }),
    ]

    expect(defaultFieldId(fieldProgress(fields, entries, harvest, '2025-11-16'))).toBe('C')
  })

  it('falls back to the first unfinished field', () => {
    expect(defaultFieldId(fieldProgress(fields, [], harvest, '2025-11-16'))).toBe('A')
  })
})

describe('default task type', () => {
  const types = [harvest, pruning, weeding]
  it('uses the season', () => {
    expect(defaultTaskTypeId(types, [], '2025-11-10')).toBe('h')
    expect(defaultTaskTypeId(types, [], '2026-03-10')).toBe('p')
  })

  it('prefers the most recently logged active type when seasons overlap', () => {
    const entries = [
      entry({ taskTypeId: 'h', date: '2025-12-20' }),
      entry({ taskTypeId: 'p', date: '2025-12-22' }),
    ]

    expect(defaultTaskTypeId(types, entries, '2025-12-23')).toBe('p')
  })

  it('falls back to the first type when nothing is active', () => {
    expect(defaultTaskTypeId(types, [], '2026-07-01')).toBe('h')
  })
})

describe('harvest maths', () => {
  it('units per tree', () => {
    expect(
      perTree(
        [
          { unitId: 'sack', amount: 16 },
          { unitId: 'bin', amount: 1 },
        ],
        8,
      ),
    ).toEqual({ sack: 2, bin: 0.125 })

    expect(perTree([{ unitId: 'sack', amount: 3 }], 0)).toEqual({})
  })

  it('season totals per field', () => {
    const entries = [
      entry({ trees: 14, quantities: [{ unitId: 'sack', amount: 8.5 }] }),
      entry({ trees: 6, quantities: [{ unitId: 'sack', amount: 7 }] }),
      entry({ fieldId: 'B', trees: 6, quantities: [{ unitId: 'sack', amount: 7 }] }),
    ]

    expect(fieldSeasonHarvest(entries, 'A', 'h', '2025-11-20')).toEqual({
      trees: 20,
      amounts: { sack: 15.5 },
    })
  })

  it('tree yield and field yield differ when not all trees are harvested', () => {
    const thirtyTrees = field('A', 30)
    const entries = [
      entry({ trees: 12, quantities: [{ unitId: 'sack', amount: 18 }] }),
      entry({ trees: 8, quantities: [{ unitId: 'sack', amount: 12 }] }),
    ]
    const y = harvestYields(entries, thirtyTrees, 'h', '2025-11-20')

    expect(y.treesHarvested).toBe(20)
    expect(y.treeYield).toEqual({ sack: 1.5 })
    expect(y.fieldYield).toEqual({ sack: 1 })
  })

  it('works without trees entered, using the field tree count', () => {
    const y = harvestYields(
      [entry({ quantities: [{ unitId: 'sack', amount: 30 }] })],
      field('A', 30),
      'h',
      '2025-11-20',
    )

    expect(y.treeYield).toBeNull()
    expect(y.fieldYield).toEqual({ sack: 1 })
  })

  it('has no field yield when the field tree count is unknown', () => {
    const y = harvestYields(
      [entry({ trees: 10, quantities: [{ unitId: 'sack', amount: 15 }] })],
      field('A', 0),
      'h',
      '2025-11-20',
    )

    expect(y.treeYield).toEqual({ sack: 1.5 })
    expect(y.fieldYield).toBeNull()
  })

  it('parses comma decimals', () => {
    expect(parseDecimal('8,5')).toBe(8.5)
    expect(parseDecimal(' 12 ')).toBe(12)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})

describe('yield format', () => {
  it('ratio and percent', () => {
    expect(formatYield(792.45, 181, 'ratio', 'en')).toBe('1/4.4')
    expect(formatYield(792.45, 181, 'ratio', 'el')).toBe('1/4,4')
    expect(formatYield(1000, 232, 'percent', 'en')).toBe('23.2%')
    expect(formatYield(0, 10, 'ratio', 'en')).toBe('–')
  })
})

describe('money format', () => {
  it('follows the number style of the format locale', () => {
    expect(formatMoney(1234.5, 'el-GR')).toBe('1.234,50 €')
    expect(formatMoney(1234.5, 'en-DE')).toBe('1.234,50 €') // English text, Greek-style numbers
    expect(formatMoney(1234.5, 'en-GB')).toBe('€1,234.50')
    expect(formatMoney(-60.5, 'en-US')).toBe('−€60.50')
    expect(formatMoney(-60.5, 'el-GR')).toBe('−60,50 €')
  })
})
