import type { TaskEntry } from './types'
import { describe, expect, it } from 'vitest'
import { averageTreesPerDay } from './progress'

function day(
  id: string,
  date: string,
  trees: number,
  extra: Partial<TaskEntry> = {},
): TaskEntry {
  return {
    farmId: 'f',
    updatedAt: 0,
    id,
    date,
    fieldId: 'a',
    taskTypeId: 'h',
    fieldFinished: false,
    trees,
    ...extra,
  }
}

describe('averageTreesPerDay', () => {
  const entries = [
    day('1', '2026-11-02', 20),
    day('2', '2026-11-02', 10, { fieldId: 'b' }), // same day, other field: 30 that day
    day('3', '2026-11-05', 24),
    day('4', '2026-11-06', 0), // only sacks entered: not a tree count
    day('5', '2025-11-20', 60), // last year
    day('6', '2026-11-07', 90, { deletedAt: 1 }),
    day('7', '2026-11-08', 40, { taskTypeId: 'prune' }),
  ]

  it("averages this year's days, a day's fields together", () => {
    expect(averageTreesPerDay({ entries, taskTypeIds: ['h'], date: '2026-11-18' })).toBe(27)
  })

  it('counts task types that are counted together', () => {
    // 30, 24 and the 40 pruned that are counted with it: 94 ÷ 3 ≈ 31.
    expect(
      averageTreesPerDay({ entries, taskTypeIds: ['h', 'prune'], date: '2026-11-18' }),
    ).toBe(31)
  })

  it('uses earlier years until this year has a day', () => {
    expect(averageTreesPerDay({ entries, taskTypeIds: ['h'], date: '2027-10-20' })).toBe(38)
  })

  it('leaves out the entry being edited', () => {
    expect(
      averageTreesPerDay({ entries, taskTypeIds: ['h'], date: '2026-11-18', excludeId: '3' }),
    ).toBe(30)
  })

  it('is 0 with nothing to go on', () => {
    expect(averageTreesPerDay({ entries: [], taskTypeIds: ['h'], date: '2026-11-18' })).toBe(0)
  })
})
