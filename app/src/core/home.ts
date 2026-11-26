/**
 * The home page: what to show at the top for the time of year, how far each task in season
 * has come, the harvest countdown, this week's days, the oil in stock and sold, and the
 * latest work. See docs/DESIGN.md, "Home".
 */

import type { Extraction, Field, ISODate, TaskEntry, TaskType, Transaction } from './types'
import { addDays, monthOf, parseISODate, seasonOf } from './dates'
import { defaultFieldId, fieldProgress } from './progress'

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

/** Task types in season on `today` (their active months), in the grower's order. */
export function tasksInSeason(taskTypes: TaskType[], today: ISODate): TaskType[] {
  const month = monthOf(today)

  return live(taskTypes)
    .filter((type) => !type.archived && type.activeMonths.includes(month))
    .sort((left, right) => left.order - right.order)
}

/**
 * What leads the home page: the harvest when it is in season; otherwise the other tasks in
 * season (one big ring, a field checklist or several small rings); or nothing.
 */
export type HomeFocus =
  { kind: 'harvest'; task: TaskType } | { kind: 'tasks'; tasks: TaskType[] } | { kind: 'none' }

export function homeFocus(taskTypes: TaskType[], today: ISODate): HomeFocus {
  const inSeason = tasksInSeason(taskTypes, today)
  const harvest = inSeason.find((type) => type.inputKind === 'harvest')
  if (harvest) {
    return { kind: 'harvest', task: harvest }
  }

  return inSeason.length > 0 ? { kind: 'tasks', tasks: inSeason } : { kind: 'none' }
}

/** How far a task has come this season: in trees, or in fields for tasks done per field. */
export interface TaskRing {
  unit: 'trees' | 'fields'
  done: number
  total: number
  fieldsFinished: number
  fieldsTotal: number
  /** The field to carry on in, and its trees left (none when everything is done). */
  next?: { fieldId: string; remaining: number | null }
  /** Every field in use with whether it is done, for the field checklist. */
  fields: { fieldId: string; name: string; finished: boolean }[]
}

export function taskRing(input: {
  task: TaskType
  taskTypes: TaskType[]
  fields: Field[]
  entries: TaskEntry[]
  today: ISODate
  seasonStartMonth?: number
}): TaskRing {
  const progress = fieldProgress(
    input.fields,
    input.entries,
    input.task,
    input.today,
    input.seasonStartMonth,
    undefined,
    input.taskTypes,
  )
  const fieldsFinished = progress.filter((row) => row.finished).length
  const total = progress.reduce((sum, row) => sum + (row.field.trees || 0), 0)
  const byTrees = input.task.inputKind !== 'done' && total > 0
  const done = byTrees
    ? progress.reduce(
        (sum, row) =>
          sum +
          (row.finished ? row.field.trees || 0 : Math.min(row.done, row.field.trees || 0)),
        0,
      )
    : fieldsFinished
  const nextId = defaultFieldId(progress)
  const nextRow = progress.find((row) => row.field.id === nextId && !row.finished)

  return {
    unit: byTrees ? 'trees' : 'fields',
    done,
    total: byTrees ? total : progress.length,
    fieldsFinished,
    fieldsTotal: progress.length,
    next: nextRow ? { fieldId: nextRow.field.id, remaining: nextRow.remaining } : undefined,
    fields: progress.map((row) => ({
      fieldId: row.field.id,
      name: row.field.name,
      finished: row.finished,
    })),
  }
}

/**
 * Days until the next harvest, counted to the day the last harvest season started (its
 * first harvest entry), the same day this year or next. Undefined before any harvest.
 */
export function nextHarvest(input: {
  entries: TaskEntry[]
  taskTypes: TaskType[]
  today: ISODate
  seasonStartMonth?: number
}): { days: number; lastStart: ISODate } | undefined {
  const harvestIds = new Set(
    live(input.taskTypes)
      .filter((type) => type.inputKind === 'harvest')
      .map((type) => type.id),
  )
  const dates = live(input.entries)
    .filter((entry) => harvestIds.has(entry.taskTypeId) && entry.date <= input.today)
    .map((entry) => entry.date)
  if (dates.length === 0) {
    return undefined
  }
  const startMonth = input.seasonStartMonth ?? 3
  const lastSeason = Math.max(...dates.map((date) => seasonOf(date, startMonth)))
  const lastStart = dates.filter((date) => seasonOf(date, startMonth) === lastSeason).sort()[0]
  const year = Number(input.today.slice(0, 4))
  let next = `${year}${lastStart.slice(4)}`
  if (next <= input.today) {
    next = `${year + 1}${lastStart.slice(4)}`
  }
  const days = Math.round(
    (parseISODate(next).getTime() - parseISODate(input.today).getTime()) / 86_400_000,
  )

  return { days, lastStart }
}

/** Monday to Sunday of the week `today` is in. */
export function weekDays(today: ISODate): ISODate[] {
  const weekday = (parseISODate(today).getDay() + 6) % 7 // Monday 0 … Sunday 6
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - weekday))
}

/** Oil in stock, all seasons and places together, and how many places hold some. */
export function oilInStock(stock: Record<number, Record<string, number>>): {
  kg: number
  places: number
  vintages: number[]
} {
  let kg = 0
  const places = new Set<string>()
  const vintages = new Set<number>()
  for (const [vintage, byPlace] of Object.entries(stock)) {
    for (const [place, amount] of Object.entries(byPlace)) {
      if (amount > 0) {
        kg += amount
        places.add(place)
        vintages.add(Number(vintage))
      }
    }
  }

  return {
    kg,
    places: places.size,
    vintages: [...vintages].sort((left, right) => left - right),
  }
}

/** Oil sold in a calendar year: kilos, money received, and the average price per kilo. */
export function oilSold(
  transactions: Transaction[],
  year: number,
): { kg: number; amount: number; pricePerKg?: number } {
  let kg = 0
  let amount = 0
  let priced = 0
  let paid = 0
  for (const tx of live(transactions)) {
    if (tx.kind !== 'sale' || !tx.date.startsWith(`${year}-`) || !tx.kg) {
      continue
    }
    kg += tx.kg
    amount += tx.amount
    if (tx.pricePerKg) {
      priced += tx.kg
      paid += tx.kg * tx.pricePerKg
    }
  }

  return { kg, amount, pricePerKg: priced > 0 ? paid / priced : undefined }
}

/** The latest work and productions, newest first (by day, then by when they were saved). */
export type Activity =
  | { kind: 'entry'; date: ISODate; entry: TaskEntry }
  | { kind: 'extraction'; date: ISODate; extraction: Extraction }

export function latestActivity(
  entries: TaskEntry[],
  extractions: Extraction[],
  limit: number,
): Activity[] {
  const all: (Activity & { savedAt: number })[] = [
    ...live(entries).map((entry) => ({
      kind: 'entry' as const,
      date: entry.date,
      entry,
      savedAt: entry.updatedAt,
    })),
    ...live(extractions).map((extraction) => ({
      kind: 'extraction' as const,
      date: extraction.date,
      extraction,
      savedAt: extraction.updatedAt,
    })),
  ]

  return all
    .sort((left, right) => {
      if (left.date === right.date) {
        return right.savedAt - left.savedAt
      }

      return left.date < right.date ? 1 : -1
    })
    .slice(0, limit)
    .map(({ savedAt: _savedAt, ...activity }) => activity)
}

/** Morning until noon, afternoon until 6 pm, then evening (Greek: Καλημέρα / Καλησπέρα). */
export function greetingTime(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) {
    return 'morning'
  }

  return hour >= 12 && hour < 18 ? 'afternoon' : 'evening'
}

/** "today", "yesterday", or undefined for an older day (shown as a date). */
export function relativeDay(date: ISODate, today: ISODate): 'today' | 'yesterday' | undefined {
  if (date === today) {
    return 'today'
  }

  return date === addDays(today, -1) ? 'yesterday' : undefined
}

/** A name for the greeting from a sign-in name: letters only, first letter capital. */
export function greetingName(username: string | undefined): string | undefined {
  if (!username || !/^\p{L}{2,}$/u.test(username)) {
    return undefined
  }

  return username.charAt(0).toLocaleUpperCase() + username.slice(1)
}
