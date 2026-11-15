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
