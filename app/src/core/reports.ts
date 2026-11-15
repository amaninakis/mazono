import type { Extraction, Field, TaskEntry, Transaction, Unit } from './types'
import { addDays, seasonOf, seasonRange } from './dates'
import { moneyTotals } from './money'
import { netOil, oilByEntry, seasonTotals, unitWeights } from './oil'

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/* ---------- 1. field × season ---------- */

/** One field in one season. */
export interface FieldSeasonCell {
  /** Oil from this field's harvests, split from each extraction by olive weight (estimate). */
  oilKg: number
  netKg: number
  /** Trees harvested (as entered), and harvested units per unit type. */
  trees: number
  units: Record<string, number>
  /**
   * Trees used for "per tree": harvested trees if entered, otherwise all trees in the field.
   */
  perTreeOf: number
}

export interface FieldSeasonReport {
  /** Seasons with data, oldest first. */
  seasons: number[]
  rows: { field: Field; cells: Record<number, FieldSeasonCell> }[]
}

/**
 * Oil and harvest per field and season, to compare fields and spot alternate bearing.
 * Oil is the field's share of each extraction it went into, counted in the extraction's
 * season.
 */
export function fieldSeasonReport(
  fields: Field[],
  entries: TaskEntry[],
  extractions: Extraction[],
  units: Unit[],
  harvestTypeIds: Set<string>,
  seasonStartMonth = 10,
): FieldSeasonReport {
  const cells = new Map<string, Record<number, FieldSeasonCell>>()
  function cell(fieldId: string, season: number) {
    const byField = cells.get(fieldId) ?? {}
    cells.set(fieldId, byField)
    byField[season] ??= { oilKg: 0, netKg: 0, trees: 0, units: {}, perTreeOf: 0 }

    return byField[season]
  }

  const entryById = new Map<string, TaskEntry>()
  for (const entry of live(entries)) {
    if (!harvestTypeIds.has(entry.taskTypeId)) {
      continue
    }
    entryById.set(entry.id, entry)
    const target = cell(entry.fieldId, seasonOf(entry.date, seasonStartMonth))
    target.trees += entry.trees ?? 0

    for (const quantity of entry.quantities ?? []) {
      target.units[quantity.unitId] = (target.units[quantity.unitId] ?? 0) + quantity.amount
    }
  }

  const weights = unitWeights(units, extractions)
  for (const extraction of live(extractions)) {
    const season = seasonOf(extraction.date, seasonStartMonth)
    for (const [entryId, oil] of Object.entries(oilByEntry(extraction, weights))) {
      const entry = entryById.get(entryId)
      if (!entry) {
        continue
      }
      const target = cell(entry.fieldId, season)
      target.oilKg += oil.oil
      target.netKg += oil.net
    }
  }

  const seasons = new Set<number>()
  const rows: FieldSeasonReport['rows'] = []
  for (const field of [...fields].sort((left, right) => left.order - right.order)) {
    const byField = cells.get(field.id)
    if (!byField) {
      continue
    }

    for (const [season, target] of Object.entries(byField)) {
      seasons.add(Number(season))
      target.oilKg = round(target.oilKg, 1)
      target.netKg = round(target.netKg, 1)
      target.perTreeOf = target.trees || field.trees
    }
    rows.push({ field, cells: byField })
  }

  return { seasons: [...seasons].sort((left, right) => left - right), rows }
}

/* ---------- 2. season totals over the years ---------- */

export interface SeasonHistoryRow {
  season: number
  extractions: number
  oliveKg: number
  oilKg: number
  netKg: number
  chargesKg: number
}

/** Mill totals for every season with extractions, oldest first. */
export function seasonHistory(
  extractions: Extraction[],
  seasonStartMonth = 10,
): SeasonHistoryRow[] {
  const seasons = new Set(live(extractions).map((x) => seasonOf(x.date, seasonStartMonth)))

  return [...seasons]
    .sort((left, right) => left - right)
    .map((season) => {
      const totals = seasonTotals(extractions, season, seasonStartMonth)

      return {
        season,
        extractions: totals.count,
        oliveKg: round(totals.oliveKg, 1),
        oilKg: round(totals.oilKg, 1),
        netKg: round(totals.netKg, 1),
        chargesKg: round(totals.chargesKg, 1),
      }
    })
}

/* ---------- 3. yield through the season ---------- */

export interface YieldPoint {
  season: number
  date: string
  /** Days since the season started, so seasons can be drawn on one axis. */
  day: number
  /** Oil ÷ olives (0.2 = 20%). */
  yield: number
  oliveKg: number
  oilKg: number
  acidity?: number
}

/** Yield of each extraction by date, grouped by season (newest season first). */
export function yieldThroughSeason(
  extractions: Extraction[],
  seasonStartMonth = 10,
): { season: number; points: YieldPoint[] }[] {
  const bySeason = new Map<number, YieldPoint[]>()
  for (const x of live(extractions)) {
    if (x.oliveKg <= 0 || x.oilKg <= 0) {
      continue
    }
    const season = seasonOf(x.date, seasonStartMonth)
    const [start] = seasonRange(season, seasonStartMonth)
    const points = bySeason.get(season) ?? []
    bySeason.set(season, points)
    points.push({
      season,
      date: x.date,
      day: daysBetween(start, x.date),
      yield: x.oilKg / x.oliveKg,
      oliveKg: x.oliveKg,
      oilKg: x.oilKg,
      acidity: x.acidity,
    })
  }

  return [...bySeason.entries()]
    .sort(([left], [right]) => right - left)
    .map(([season, points]) => ({
      season,
      points: points.sort((left, right) => left.day - right.day),
    }))
}

function daysBetween(from: string, to: string) {
  let days = 0
  let date = from
  // Seasons are at most a year long, so a simple count is fine (and safe across DST changes).
  while (date < to && days < 400) {
    date = addDays(date, 1)
    days += 1
  }

  return days
}

/* ---------- 4. economics per year ---------- */

export interface YearEconomics {
  year: number
  income: number
  sales: number
  otherIncome: number
  expenses: number
  net: number
  /** Net oil of the season that starts in this year (its costs are mostly this year's). */
  netOilKg: number
  /** Expenses ÷ net oil. */
  costPerKg?: number
  /**
   * Price per kg at which selling all the net oil covers the expenses left after other income.
   */
  breakEvenPrice?: number
  /** Average price of the oil sold this year (before fees). */
  averagePrice?: number
}

/**
 * Money per calendar year (as on the Money page), set against the oil of the season that
 * starts in that year: with an October start, the 2025 costs (pruning, spraying, harvest)
 * produce the 2025–26 oil.
 */
export function yearEconomics(
  transactions: Transaction[],
  extractions: Extraction[],
  seasonStartMonth = 10,
): YearEconomics[] {
  const netBySeason: Record<number, number> = {}
  for (const x of live(extractions)) {
    const season = seasonOf(x.date, seasonStartMonth)
    netBySeason[season] = (netBySeason[season] ?? 0) + netOil(x)
  }
  const years = new Set<number>([
    ...live(transactions).map((tx) => Number(tx.date.slice(0, 4))),
    ...Object.keys(netBySeason).map(Number),
  ])

  return [...years]
    .sort((left, right) => left - right)
    .map((year) => {
      const totals = moneyTotals(transactions, { kind: 'year', year }, seasonStartMonth)
      const netOilKg = round(netBySeason[year] ?? 0, 1)
      const row: YearEconomics = {
        year,
        income: totals.income,
        sales: totals.sales,
        otherIncome: totals.otherIncome,
        expenses: totals.expenses,
        net: totals.net,
        netOilKg,
        averagePrice: totals.averagePrice,
      }
      if (netOilKg > 0 && totals.expenses > 0) {
        row.costPerKg = round(totals.expenses / netOilKg)
        row.breakEvenPrice = round(
          Math.max(totals.expenses - totals.otherIncome, 0) / netOilKg,
        )
      }

      return row
    })
}

/* ---------- CSV ---------- */

export type CsvValue = string | number | null | undefined

/**
 * A CSV file that spreadsheets open correctly: numbers use the app's decimal separator, and
 * the columns are separated by ";" when the decimal separator is a comma (as Greek Excel
 * expects), "," otherwise.
 */
export function toCsv(header: string[], rows: CsvValue[][], locale: string): string {
  const decimal =
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  const separator = decimal === ',' ? ';' : ','
  function cellText(value: CsvValue) {
    if (value == null) {
      return ''
    }
    const text =
      typeof value === 'number' ? String(round(value, 3)).replace('.', decimal) : value
    const needsQuotes = text.includes(separator) || text.includes('"') || text.includes('\n')

    return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text
  }

  return [header, ...rows].map((row) => row.map(cellText).join(separator)).join('\r\n')
}
