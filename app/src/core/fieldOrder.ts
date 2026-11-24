import type { Field, ISODate, TaskEntry } from './types'
import { seasonOf } from './dates'

/**
 * The order fields are worked in, learned from earlier farming years for one task: in every
 * earlier year, the fields are put in the order of the first day each was worked, and each
 * gets its place on the scale of all the fields, from 0 (first) to 1 (last). A year when only
 * some fields were worked (pruning every other year, say) puts those few near the top. Recent
 * years count more: last year fully, the year before half, then a quarter, and so on, so a
 * change of habit shows within a year or two. This year does not count, so the list stays put
 * while the work goes on.
 */
export interface LearnedOrder {
  /** Place of each field with history, from 0 (first) to 1 (last). */
  place: Map<string, number>
  /** Earlier years with work on these fields for this task. */
  years: number
}

export function learnedFieldOrder(input: {
  /** The fields to place, in the user's own order. */
  fields: Field[]
  entries: TaskEntry[]
  /** The task, with any tasks counted together with it (see countedTogether). */
  taskTypeIds: string[]
  date: ISODate
  seasonStartMonth?: number
}): LearnedOrder {
  const startMonth = input.seasonStartMonth ?? 3
  const thisYear = seasonOf(input.date, startMonth)
  const types = new Set(input.taskTypeIds)
  const ownPlace = new Map(input.fields.map((field, index) => [field.id, index]))
  // Year → field → first day worked.
  const firstDays = new Map<number, Map<string, ISODate>>()
  for (const entry of input.entries) {
    if (entry.deletedAt || !types.has(entry.taskTypeId) || !ownPlace.has(entry.fieldId)) {
      continue
    }
    const year = seasonOf(entry.date, startMonth)
    if (year >= thisYear) {
      continue
    }
    const days = firstDays.get(year) ?? new Map<string, ISODate>()
    const first = days.get(entry.fieldId)
    if (!first || entry.date < first) {
      days.set(entry.fieldId, entry.date)
    }
    firstDays.set(year, days)
  }

  const last = Math.max(input.fields.length - 1, 1)
  const total = new Map<string, { sum: number; weight: number }>()
  for (const [year, days] of firstDays) {
    const weight = 0.5 ** (thisYear - year - 1)
    const inOrder = [...days.entries()].sort(
      ([leftId, leftDay], [rightId, rightDay]) =>
        leftDay.localeCompare(rightDay) || ownPlace.get(leftId)! - ownPlace.get(rightId)!,
    )
    inOrder.forEach(([fieldId], index) => {
      const place = index / last
      const sofar = total.get(fieldId) ?? { sum: 0, weight: 0 }
      total.set(fieldId, { sum: sofar.sum + place * weight, weight: sofar.weight + weight })
    })
  }

  const place = new Map<string, number>()
  for (const [fieldId, { sum, weight }] of total) {
    place.set(fieldId, sum / weight)
  }

  return { place, years: firstDays.size }
}

/**
 * Put fields (or anything about a field) in the learned order. A field without history keeps
 * the place it has in the user's own order (third of five: in the middle), and fields at the
 * same place keep the user's order between them. With nothing learned, the user's order.
 */
export function arrangeFields<T extends { field: Field }>(
  items: T[],
  learned: LearnedOrder | undefined,
): T[] {
  if (!learned || learned.years === 0) {
    return items
  }
  const last = Math.max(items.length - 1, 1)
  const keyed = items.map((item, index) => ({
    item,
    index,
    key: learned.place.get(item.field.id) ?? index / last,
  }))
  keyed.sort((left, right) => left.key - right.key || left.index - right.index)

  return keyed.map(({ item }) => item)
}

/** The list with the item at `index` moved one place up (-1) or down (1). */
export function moveOnePlace<T>(list: T[], index: number, step: -1 | 1): T[] {
  const target = index + step
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return list
  }
  const moved = [...list]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]

  return moved
}

/** Earlier farming years with any work on a field, for "learned from N years". */
export function earlierYearsWithWork(
  entries: TaskEntry[],
  date: ISODate,
  seasonStartMonth = 3,
): number {
  const thisYear = seasonOf(date, seasonStartMonth)
  const years = new Set<number>()
  for (const entry of entries) {
    const year = seasonOf(entry.date, seasonStartMonth)
    if (!entry.deletedAt && entry.fieldId && year < thisYear) {
      years.add(year)
    }
  }

  return years.size
}
