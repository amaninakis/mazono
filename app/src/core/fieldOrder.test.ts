import type { Field, TaskEntry } from './types'
import { describe, expect, it } from 'vitest'
import {
  arrangeFields,
  earlierYearsWithWork,
  learnedFieldOrder,
  moveOnePlace,
} from './fieldOrder'

function field(id: string, order: number): Field {
  return { farmId: 'f', updatedAt: 0, id, name: id, trees: 10, archived: false, order }
}

function work(fieldId: string, date: string, extra: Partial<TaskEntry> = {}): TaskEntry {
  return {
    farmId: 'f',
    updatedAt: 0,
    id: `${fieldId}-${date}`,
    date,
    fieldId,
    taskTypeId: 'harvest',
    fieldFinished: false,
    ...extra,
  }
}

// The user's own order: A, B, C, D.
const fields = [field('A', 0), field('B', 1), field('C', 2), field('D', 3)]

function order(entries: TaskEntry[], date = '2026-11-20') {
  const learned = learnedFieldOrder({ fields, entries, taskTypeIds: ['harvest'], date })

  return arrangeFields(
    fields.map((item) => ({ field: item })),
    learned,
  ).map((item) => item.field.id)
}

describe('learnedFieldOrder', () => {
  it('follows the order of the first day each field was worked last year', () => {
    const entries = [
      work('C', '2025-11-01'),
      work('A', '2025-11-03'),
      work('C', '2025-11-05'), // a second day in C does not move it
      work('D', '2025-11-06'),
      work('B', '2025-11-09'),
    ]

    expect(order(entries)).toEqual(['C', 'A', 'D', 'B'])
  })

  it('counts recent years more when the order changes', () => {
    const entries = [
      // two years ago: A B C D
      work('A', '2024-11-01'),
      work('B', '2024-11-02'),
      work('C', '2024-11-03'),
      work('D', '2024-11-04'),
      // last year: D C B A
      work('D', '2025-11-01'),
      work('C', '2025-11-02'),
      work('B', '2025-11-03'),
      work('A', '2025-11-04'),
    ]

    expect(order(entries)).toEqual(['D', 'C', 'B', 'A'])
  })

  it('lets one recent year outweigh all older years together', () => {
    function year(season: number, ids: string[]) {
      return ids.map((id, index) => work(id, `${season}-11-0${index + 1}`))
    }
    // Last year B first (weight 1); the two before A first (½ + ¼): B leads.
    expect(
      order([...year(2023, ['A', 'B']), ...year(2024, ['A', 'B']), ...year(2025, ['B', 'A'])]),
    ).toEqual(['B', 'A', 'C', 'D'])
  })

  it('does not learn from this year, so the list stays put during the work', () => {
    expect(order([work('D', '2026-11-01'), work('A', '2026-11-02')])).toEqual([
      'A',
      'B',
      'C',
      'D',
    ])
  })

  it('learns each task on its own', () => {
    const entries = [
      work('D', '2025-04-01', { taskTypeId: 'prune' }),
      work('A', '2025-04-02', { taskTypeId: 'prune' }),
      work('B', '2025-11-01'),
      work('A', '2025-11-02'),
    ]
    const prune = learnedFieldOrder({
      fields,
      entries,
      taskTypeIds: ['prune'],
      date: '2026-11-20',
    })

    expect(prune.place.get('D')).toBe(0)
    expect(prune.place.has('B')).toBe(false)
    // Harvest: B before A, whatever the pruning order.
    expect(order(entries)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('keeps fields without history at their own place', () => {
    // Only D and A were worked last year, D first: they go near the top in that order, and
    // B and C keep their places after them.
    expect(order([work('D', '2025-11-01'), work('A', '2025-11-02')])).toEqual([
      'D',
      'A',
      'B',
      'C',
    ])
  })

  it('leaves out deleted work and fields not in the list', () => {
    const learned = learnedFieldOrder({
      fields,
      entries: [work('D', '2025-11-01', { deletedAt: 5 }), work('Z', '2025-11-01')],
      taskTypeIds: ['harvest'],
      date: '2026-11-20',
    })

    expect(learned.years).toBe(0)
    expect(order([work('D', '2025-11-01', { deletedAt: 5 })])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('uses the farming year, not the calendar year', () => {
    // February 2026 belongs to the farming year that started in March 2025: an earlier year.
    const learned = learnedFieldOrder({
      fields,
      entries: [work('C', '2026-02-10')],
      taskTypeIds: ['harvest'],
      date: '2026-11-20',
    })

    expect(learned.years).toBe(1)
  })
})

describe('moveOnePlace', () => {
  it('moves an item up or down', () => {
    expect(moveOnePlace(['A', 'B', 'C'], 2, -1)).toEqual(['A', 'C', 'B'])
    expect(moveOnePlace(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C'])
  })

  it('does nothing past either end', () => {
    expect(moveOnePlace(['A', 'B'], 0, -1)).toEqual(['A', 'B'])
    expect(moveOnePlace(['A', 'B'], 1, 1)).toEqual(['A', 'B'])
  })
})

describe('earlierYearsWithWork', () => {
  it('counts earlier farming years with work', () => {
    const entries = [
      work('A', '2024-11-01'),
      work('B', '2025-11-01'),
      work('A', '2025-12-01'),
      work('A', '2026-11-01'), // this year
      work('A', '2023-11-01', { deletedAt: 1 }),
    ]

    expect(earlierYearsWithWork(entries, '2026-11-20')).toBe(2)
  })
})
