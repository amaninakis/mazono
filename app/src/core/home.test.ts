import type { Extraction, Field, TaskEntry, TaskType, Transaction } from './types'
import { describe, expect, it } from 'vitest'
import {
  greetingName,
  greetingTime,
  homeFocus,
  latestActivity,
  nextHarvest,
  oilInStock,
  oilSold,
  relativeDay,
  taskRing,
  tasksInSeason,
  weekDays,
} from './home'

const base = { farmId: 'f', updatedAt: 1 }

function type(
  id: string,
  inputKind: TaskType['inputKind'],
  months: number[],
  order = 0,
): TaskType {
  return {
    ...base,
    id,
    name: id,
    color: '#000',
    icon: '',
    inputKind,
    activeMonths: months,
    archived: false,
    order,
  }
}
const harvest = type('harvest', 'harvest', [10, 11, 12, 1], 0)
const pruning = type('pruning', 'trees', [1, 2, 3, 4], 1)
const fertilizer = type('fertilizer', 'quantity', [2, 3, 10, 11], 2)
const weeding = type('weeding', 'done', [3, 4, 5, 6, 9], 3)
const types = [harvest, pruning, fertilizer, weeding]

function field(id: string, trees: number, order = 0): Field {
  return { ...base, id, name: id, trees, order, archived: false }
}

function entry(
  id: string,
  date: string,
  taskTypeId: string,
  fieldId: string,
  extra: Partial<TaskEntry> = {},
): TaskEntry {
  return { ...base, id, date, taskTypeId, fieldId, fieldFinished: false, ...extra }
}

describe('homeFocus', () => {
  it('leads with the harvest in its months', () => {
    expect(homeFocus(types, '2026-11-26')).toEqual({ kind: 'harvest', task: harvest })
  })

  it('shows the other tasks in season, in order, outside the harvest', () => {
    const focus = homeFocus(types, '2027-03-10')

    expect(focus.kind).toBe('tasks')
    expect(focus.kind === 'tasks' && focus.tasks.map((x) => x.id)).toEqual([
      'pruning',
      'fertilizer',
      'weeding',
    ])
  })

  it('shows nothing when no task is in season', () => {
    expect(homeFocus(types, '2027-07-15')).toEqual({ kind: 'none' })
  })

  it('leaves out archived task types', () => {
    expect(tasksInSeason([{ ...weeding, archived: true }], '2027-05-01')).toEqual([])
  })
})

describe('taskRing', () => {
  const fields = [field('a', 40, 0), field('b', 60, 1)]

  it('counts trees done, a finished field as all its trees, and the field to carry on in', () => {
    const entries = [
      entry('1', '2026-11-20', 'harvest', 'a', { trees: 40 }),
      entry('2', '2026-11-25', 'harvest', 'b', { trees: 20 }),
    ]
    const ring = taskRing({
      task: harvest,
      taskTypes: types,
      fields,
      entries,
      today: '2026-11-26',
    })

    expect(ring).toMatchObject({
      unit: 'trees',
      done: 60,
      total: 100,
      fieldsFinished: 1,
      fieldsTotal: 2,
    })

    expect(ring.next).toEqual({ fieldId: 'b', remaining: 40 })
  })

  it('counts fields for work done per field', () => {
    const entries = [entry('1', '2027-05-02', 'weeding', 'a', { fieldFinished: true })]
    const ring = taskRing({
      task: weeding,
      taskTypes: types,
      fields,
      entries,
      today: '2027-05-10',
    })

    expect(ring).toMatchObject({ unit: 'fields', done: 1, total: 2 })
    expect(ring.fields.map((x) => x.finished)).toEqual([true, false])
  })

  it('has no next field when everything is done', () => {
    const entries = [
      entry('1', '2027-05-02', 'weeding', 'a', { fieldFinished: true }),
      entry('2', '2027-05-03', 'weeding', 'b', { fieldFinished: true }),
    ]

    expect(
      taskRing({ task: weeding, taskTypes: types, fields, entries, today: '2027-05-10' }).next,
    ).toBeUndefined()
  })
})

describe('nextHarvest', () => {
  it('counts to the day the last harvest started, this year', () => {
    const entries = [
      entry('1', '2025-11-04', 'harvest', 'a'),
      entry('2', '2025-12-10', 'harvest', 'a'),
      entry('3', '2024-10-20', 'harvest', 'a'),
    ]

    expect(nextHarvest({ entries, taskTypes: types, today: '2026-07-21' })).toEqual({
      days: 106,
      lastStart: '2025-11-04',
    })
  })

  it('is undefined before any harvest', () => {
    expect(nextHarvest({ entries: [], taskTypes: types, today: '2026-07-21' })).toBeUndefined()
  })
})

describe('weekDays', () => {
  it('runs Monday to Sunday around today', () => {
    expect(weekDays('2026-11-26')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ])

    expect(weekDays('2026-11-29')[0]).toBe('2026-11-23')
  })
})

describe('oil in stock and sold', () => {
  it('adds up the oil in stock and the places that hold some', () => {
    expect(oilInStock({ 2025: { tank: 400, tin: 240 }, 2024: { tank: 0 } })).toEqual({
      kg: 640,
      places: 2,
      vintages: [2025],
    })
  })

  it("adds up this year's sales with their average price", () => {
    function sale(date: string, kg: number, price: number): Transaction {
      return {
        ...base,
        id: date,
        date,
        kind: 'sale',
        party: 'x',
        amount: kg * price,
        kg,
        pricePerKg: price,
      }
    }
    const result = oilSold(
      [sale('2026-03-01', 100, 5), sale('2026-04-01', 100, 4), sale('2025-12-01', 50, 9)],
      2026,
    )

    expect(result).toEqual({ kg: 200, amount: 900, pricePerKg: 4.5 })
  })
})

describe('latestActivity', () => {
  it('puts the newest day first, and the latest saved first within a day', () => {
    const entries = [
      { ...entry('old', '2026-11-20', 'harvest', 'a'), updatedAt: 5 },
      { ...entry('morning', '2026-11-26', 'harvest', 'a'), updatedAt: 1 },
      { ...entry('evening', '2026-11-26', 'harvest', 'a'), updatedAt: 9 },
    ]
    function production(id: string, date: string): Extraction {
      return {
        ...base,
        id,
        date,
        oliveKg: 0,
        oilKg: 0,
        charges: [],
        storage: [],
        allocations: [],
      }
    }
    const extractions = [production('mill', '2026-11-24')]
    const ids = latestActivity(entries, extractions, 3).map((x) =>
      x.kind === 'entry' ? x.entry.id : x.extraction.id,
    )

    expect(ids).toEqual(['evening', 'morning', 'mill'])
  })
})

describe('greeting', () => {
  it('says good morning until noon, good afternoon until six', () => {
    expect(greetingTime(7)).toBe('morning')
    expect(greetingTime(13)).toBe('afternoon')
    expect(greetingTime(21)).toBe('evening')
    expect(greetingTime(2)).toBe('evening')
  })

  it('uses a sign-in name only when it looks like a name', () => {
    expect(greetingName('andreas')).toBe('Andreas')
    expect(greetingName('ανδρέας')).toBe('Ανδρέας')
    expect(greetingName('farm1')).toBeUndefined()
    expect(greetingName(undefined)).toBeUndefined()
  })

  it('names today and yesterday', () => {
    expect(relativeDay('2026-11-26', '2026-11-26')).toBe('today')
    expect(relativeDay('2026-11-25', '2026-11-26')).toBe('yesterday')
    expect(relativeDay('2026-11-20', '2026-11-26')).toBeUndefined()
  })
})
