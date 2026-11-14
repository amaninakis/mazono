import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function monthOf(s: ISODate): number {
  return Number(s.slice(5, 7));
}

/** Start year of the season a date belongs to. Season 2025 = 1 Oct 2025 – 30 Sep 2026 (start month 10). */
export function seasonOf(s: ISODate, startMonth = 10): number {
  const year = Number(s.slice(0, 4));
  return monthOf(s) >= startMonth ? year : year - 1;
}

/** First and last day (inclusive) of a season. */
export function seasonRange(startYear: number, startMonth = 10): [ISODate, ISODate] {
  const start = `${startYear}-${pad(startMonth)}-01`;
  const end = addDays(`${startYear + 1}-${pad(startMonth)}-01`, -1);
  return [start, end];
}

/** '2025–26', or '2025' when the season starts in January. */
export function seasonLabel(startYear: number, startMonth = 10): string {
  if (startMonth === 1) return String(startYear);
  return `${startYear}–${String(startYear + 1).slice(2)}`;
}

/** Days of the month grid, Monday first, padded with nulls. */
export function monthGrid(year: number, month: number): (ISODate | null)[] {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month, 0).getDate();
  const cells: (ISODate | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
