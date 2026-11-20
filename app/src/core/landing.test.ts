import type { Field, TaskEntry, TaskType } from './types'
import { describe, expect, it } from 'vitest'
import { harvestFinished, landingPage } from './landing'

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
  { ...record, id: 'a', name: 'A', trees: 20, archived: false, order: 0 },
  { ...record, id: 'b', name: 'B', trees: 10, archived: false, order: 1 },
]
function entry(id: string, date: string, extra: Partial<TaskEntry> = {}): TaskEntry {
  return {
    ...record,
    id,
    date,
    fieldId: 'a',
    taskTypeId: 'h',
    fieldFinished: false,
    trees: 5,
    ...extra,
  }
}

const today = '2026-11-20'
const may = { enterWork: true, enterOil: true, seeReports: true }
const none = { extraction: false, task: false }
const base = { today, fields, taskTypes, drafts: none, may }

describe('landingPage', () => {
  it('opens the task page when nothing is entered for today', () => {
    expect(landingPage({ ...base, entries: [entry('1', '2026-11-19')] })).toBe('/')
  })

  it("opens this year's report once work is entered for today", () => {
    expect(landingPage({ ...base, entries: [entry('1', today)] })).toBe('/reports')
    // Any task counts, and a deleted one does not.
    expect(landingPage({ ...base, entries: [entry('1', today, { taskTypeId: 'p' })] })).toBe(
      '/reports',
    )

    expect(landingPage({ ...base, entries: [entry('1', today, { deletedAt: 1 })] })).toBe('/')
  })

  it('opens the report when the harvest is finished in every field', () => {
    const finished = [
      entry('1', '2026-11-02', { trees: 20 }),
      entry('2', '2026-11-03', { fieldId: 'b', trees: 4, fieldFinished: true }),
    ]

    expect(harvestFinished({ today, entries: finished, fields, taskTypes })).toBe(true)
    expect(landingPage({ ...base, entries: finished })).toBe('/reports')
    expect(harvestFinished({ today, entries: finished.slice(0, 1), fields, taskTypes })).toBe(
      false,
    )
    // A new farming year (from March) starts over.
    expect(
      harvestFinished({ today: '2027-04-01', entries: finished, fields, taskTypes }),
    ).toBe(false)
  })

  it('goes back to a production being entered, before anything else', () => {
    const entries = [entry('1', today)]

    expect(landingPage({ ...base, entries, drafts: { extraction: true, task: false } })).toBe(
      '/oil/new',
    )

    expect(
      landingPage({ ...base, entries: [], drafts: { extraction: true, task: true } }),
    ).toBe('/oil/new')
  })

  it('goes back to a task being entered', () => {
    expect(
      landingPage({
        ...base,
        entries: [entry('1', today)],
        drafts: { extraction: false, task: true },
      }),
    ).toBe('/')
  })

  it('skips pages the person may not use', () => {
    const entries = [entry('1', today)]

    expect(
      landingPage({
        ...base,
        entries,
        drafts: { extraction: true, task: false },
        may: { ...may, enterOil: false },
      }),
    ).toBe('/reports')

    expect(landingPage({ ...base, entries, may: { ...may, seeReports: false } })).toBe('/')
  })

  it('is the task page for a farm with no fields yet', () => {
    expect(harvestFinished({ today, entries: [], fields: [], taskTypes })).toBe(false)
    expect(landingPage({ ...base, fields: [], entries: [] })).toBe('/')
  })
})
