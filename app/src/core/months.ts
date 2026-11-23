/**
 * The Journal's months: which months of a year have work in them (for the dots on the month
 * chips) and keeping the shown month from going past today.
 */

/** Months (1–12) of `year` that have at least one of the given dates (YYYY-MM-DD). */
export function monthsWithWork(dates: Iterable<string>, year: number): Set<number> {
  const prefix = `${year}-`
  const months = new Set<number>()
  for (const date of dates) {
    if (date.startsWith(prefix)) {
      months.add(Number(date.slice(5, 7)))
    }
  }

  return months
}

/** Whether a month lies after today's month (the Journal does not show the future). */
export function isFutureMonth(year: number, month: number, today: string): boolean {
  return year * 12 + month > Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))
}

/** The month as "YYYY-MM", moved back to today's month if it would be in the future. */
export function shownMonth(year: number, month: number, today: string): string {
  if (isFutureMonth(year, month, today)) {
    return today.slice(0, 7)
  }

  return `${year}-${String(month).padStart(2, '0')}`
}
