import type { ISODate } from './types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISODate(isoDate: ISODate): Date {
  const [y, month, day] = isoDate.split('-').map(Number)
  return new Date(y, month - 1, day)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(isoDate: ISODate, days: number): ISODate {
  const date = parseISODate(isoDate)
  date.setDate(date.getDate() + days)

  return toISODate(date)
}

export function monthOf(isoDate: ISODate): number {
  return Number(isoDate.slice(5, 7))
}

/**
 * Start year of the season a date belongs to. Season 2025 = 1 Oct 2025 – 30 Sep 2026 (start
 * month 10).
 */
export function seasonOf(isoDate: ISODate, startMonth = 10): number {
  const year = Number(isoDate.slice(0, 4))
  return monthOf(isoDate) >= startMonth ? year : year - 1
}

/** First and last day (inclusive) of a season. */
export function seasonRange(startYear: number, startMonth = 10): [ISODate, ISODate] {
  const start = `${startYear}-${pad(startMonth)}-01`
  const end = addDays(`${startYear + 1}-${pad(startMonth)}-01`, -1)

  return [start, end]
}

/** '2025–26', or '2025' when the season starts in January. */
export function seasonLabel(startYear: number, startMonth = 10): string {
  if (startMonth === 1) {
    return String(startYear)
  }

  return `${startYear}–${String(startYear + 1).slice(2)}`
}

/** Days of the month grid, Monday first, padded with nulls. */
export function monthGrid(year: number, month: number): (ISODate | null)[] {
  const first = new Date(year, month - 1, 1)
  const lead = (first.getDay() + 6) % 7 // Monday = 0
  const days = new Date(year, month, 0).getDate()
  const cells: (ISODate | null)[] = []
  while (cells.length < lead) {
    cells.push(null)
  }

  for (let day = 1; day <= days; day++) {
    cells.push(`${year}-${pad(month)}-${pad(day)}`)
  }

  while (cells.length % 7) {
    cells.push(null)
  }

  return cells
}

/** Sort comparator: newest date first, then most recently changed first. */
export function byNewest(
  left: { date: ISODate; updatedAt?: number },
  right: { date: ISODate; updatedAt?: number },
): number {
  if (left.date !== right.date) {
    return left.date < right.date ? 1 : -1
  }

  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}

/**
 * Order of day, month and year in a locale's short date, e.g. ['day', 'month', 'year'] for
 * 15/11/2026.
 */
export function dateFieldOrder(locale: string): ('day' | 'month' | 'year')[] {
  const order: ('day' | 'month' | 'year')[] = []
  for (const part of new Intl.DateTimeFormat(locale).formatToParts(new Date(2026, 10, 15))) {
    if (part.type === 'day' || part.type === 'month' || part.type === 'year') {
      order.push(part.type)
    }
  }

  return order
}

/**
 * Read a date the user typed, in the order the app shows dates (e.g. 15/11/2026 or
 * 11/15/2026). Accepts `/`, `.`, `-` or spaces between the numbers, a two-digit year (26 →
 * 2026), no year (15/11 → this year) and ISO (2026-11-15). Returns null when it is not a real
 * date.
 */
export function parseTypedDate(text: string, locale: string, today: ISODate): ISODate | null {
  const numbers = text
    .trim()
    .split(/[\s./-]+/)
    .filter(Boolean)
  if (
    numbers.length < 2 ||
    numbers.length > 3 ||
    numbers.some((part) => !/^\d+$/.test(part))
  ) {
    return null
  }

  let order = dateFieldOrder(locale)
  if (numbers[0].length === 4) {
    order = ['year', 'month', 'day']
  } else if (numbers.length === 2) {
    order = order.filter((field) => field !== 'year')
  }

  const values: Record<string, number> = { year: Number(today.slice(0, 4)) }
  order.forEach((field, i) => {
    values[field] = Number(numbers[i])
  })
  const { day, month } = values as { day: number; month: number }
  let year = values.year
  if (year < 100) {
    year += 2000
  }

  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  return toISODate(date)
}

/**
 * True when typed text already holds a whole date with its year (e.g. "16/2/2026", "16/2/26"
 * or "2026-02-16"), so the app can use it straight away instead of waiting for the user to
 * leave the box. "16/2" (no year yet) or "16/2/2" (year still being typed) are not complete.
 */
export function isCompleteTypedDate(text: string, locale: string): boolean {
  const numbers = text
    .trim()
    .split(/[\s./-]+/)
    .filter(Boolean)
  if (numbers.length !== 3 || numbers.some((part) => !/^\d+$/.test(part))) {
    return false
  }
  if (numbers[0].length === 4) {
    return numbers[2].length === 2
  }
  const year = numbers[dateFieldOrder(locale).indexOf('year')]

  return year.length === 2 || year.length === 4
}
