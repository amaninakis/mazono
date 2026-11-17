import type { Extraction, Field, ISODate, TaskEntry, Transaction, Unit } from './types'
import { seasonOf } from './dates'
import { netOil, unitWeights } from './oil'
import { fieldSeasonReport, seasonHistory } from './reports'

/* All-time records and totals, for the Records report. */

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

/** The row with the highest score (first one wins a tie); undefined for an empty list. */
function best<T>(rows: T[], score: (row: T) => number): T | undefined {
  let top: T | undefined
  let topScore = -Infinity
  for (const row of rows) {
    const value = score(row)
    if (value > topScore) {
      top = row
      topScore = value
    }
  }

  return top
}

export interface FarmRecords {
  /** Year with the most oil after the mill's charges. */
  bestYear?: { year: number; netKg: number }
  /** Year with the best yield (oil ÷ olives). */
  bestYieldYear?: { year: number; oliveKg: number; oilKg: number }
  /** The single production with the best yield. */
  bestProduction?: { date: ISODate; oliveKg: number; oilKg: number }
  /** The single production with the most oil. */
  biggestProduction?: { date: ISODate; oilKg: number }
  /** The production with the lowest acidity. */
  lowestAcidity?: { date: ISODate; acidity: number }
  /** Field and year with the most oil per tree. */
  bestFieldYear?: { fieldId: string; year: number; kgPerTree: number }
  /** Field with the most oil over all years. */
  topField?: { fieldId: string; oilKg: number }
  /** Harvest day with the most olives collected (all fields), by estimated weight. */
  biggestDay?: { date: ISODate; units: Record<string, number> }
  /** Harvest day with the most trees harvested. */
  mostTreesDay?: { date: ISODate; trees: number }
  /** Oil sale with the best price per kg. */
  bestPrice?: { date: ISODate; pricePerKg: number; party: string }
}

export interface FarmTotals {
  netOilKg: number
  oliveKg: number
  productions: number
  harvestDays: number
  treesHarvested: number
  /** Years with at least one production. */
  years: number
  salesAmount: number
}

export interface RecordsInput {
  fields: Field[]
  entries: TaskEntry[]
  extractions: Extraction[]
  transactions: Transaction[]
  units: Unit[]
  harvestTypeIds: Set<string>
  seasonStartMonth?: number
}

export function farmRecords(input: RecordsInput): {
  records: FarmRecords
  totals: FarmTotals
} {
  const startMonth = input.seasonStartMonth ?? 3
  const extractions = live(input.extractions)
  const harvests = live(input.entries).filter((entry) =>
    input.harvestTypeIds.has(entry.taskTypeId),
  )
  const records: FarmRecords = {}

  // Years
  const history = seasonHistory(extractions, startMonth)
  const topYear = best(history, (row) => row.netKg)
  if (topYear && topYear.netKg > 0) {
    records.bestYear = { year: topYear.season, netKg: topYear.netKg }
  }
  const topYieldYear = best(
    history.filter((row) => row.oliveKg > 0),
    (row) => row.oilKg / row.oliveKg,
  )
  if (topYieldYear) {
    records.bestYieldYear = {
      year: topYieldYear.season,
      oliveKg: topYieldYear.oliveKg,
      oilKg: topYieldYear.oilKg,
    }
  }

  // Single productions
  const measured = extractions.filter((x) => x.oliveKg > 0 && x.oilKg > 0)
  const topYield = best(measured, (x) => x.oilKg / x.oliveKg)
  if (topYield) {
    records.bestProduction = {
      date: topYield.date,
      oliveKg: topYield.oliveKg,
      oilKg: topYield.oilKg,
    }
  }
  const biggest = best(measured, (x) => x.oilKg)
  if (biggest) {
    records.biggestProduction = { date: biggest.date, oilKg: biggest.oilKg }
  }
  const lowest = best(
    extractions.filter((x) => x.acidity != null && x.acidity > 0),
    (x) => -x.acidity!,
  )
  if (lowest) {
    records.lowestAcidity = { date: lowest.date, acidity: lowest.acidity! }
  }

  // Fields
  const report = fieldSeasonReport(
    input.fields,
    input.entries,
    extractions,
    input.units,
    input.harvestTypeIds,
    startMonth,
  )
  const fieldYears = report.rows.flatMap((row) =>
    Object.entries(row.cells)
      .filter(([, cell]) => cell.oilKg > 0 && cell.perTreeOf > 0)
      .map(([year, cell]) => ({
        fieldId: row.field.id,
        year: Number(year),
        kgPerTree: cell.oilKg / cell.perTreeOf,
      })),
  )
  const topFieldYear = best(fieldYears, (row) => row.kgPerTree)
  if (topFieldYear) {
    records.bestFieldYear = {
      ...topFieldYear,
      kgPerTree: Math.round(topFieldYear.kgPerTree * 100) / 100,
    }
  }
  const fieldTotals = report.rows.map((row) => ({
    fieldId: row.field.id,
    oilKg: Object.values(row.cells).reduce((sum, cell) => sum + cell.oilKg, 0),
  }))
  const topField = best(fieldTotals, (row) => row.oilKg)
  if (topField && topField.oilKg > 0) {
    records.topField = { fieldId: topField.fieldId, oilKg: Math.round(topField.oilKg) }
  }

  // Harvest days
  const weights = unitWeights(input.units, extractions)
  const days = new Map<ISODate, { units: Record<string, number>; trees: number }>()
  for (const entry of harvests) {
    const day = days.get(entry.date) ?? { units: {}, trees: 0 }
    days.set(entry.date, day)
    day.trees += entry.trees ?? 0

    for (const quantity of entry.quantities ?? []) {
      day.units[quantity.unitId] = (day.units[quantity.unitId] ?? 0) + quantity.amount
    }
  }
  /** Estimated kg of olives (or plain unit count when no unit weight is known yet). */
  function dayWeight(units: Record<string, number>) {
    return Object.entries(units).reduce(
      (sum, [unitId, amount]) => sum + amount * (weights[unitId]?.kg ?? 1),
      0,
    )
  }
  const dayList = [...days.entries()].map(([date, day]) => ({ date, ...day }))
  const topDay = best(
    dayList.filter((day) => Object.keys(day.units).length > 0),
    (day) => dayWeight(day.units),
  )
  if (topDay) {
    records.biggestDay = { date: topDay.date, units: topDay.units }
  }
  const topTrees = best(
    dayList.filter((day) => day.trees > 0),
    (day) => day.trees,
  )
  if (topTrees) {
    records.mostTreesDay = { date: topTrees.date, trees: topTrees.trees }
  }

  // Sales
  const sales = live(input.transactions).filter(
    (tx) => tx.kind === 'sale' && (tx.pricePerKg ?? 0) > 0,
  )
  const topSale = best(sales, (tx) => tx.pricePerKg!)
  if (topSale) {
    records.bestPrice = {
      date: topSale.date,
      pricePerKg: topSale.pricePerKg!,
      party: topSale.party,
    }
  }

  const totals: FarmTotals = {
    netOilKg: Math.round(extractions.reduce((sum, x) => sum + netOil(x), 0) * 10) / 10,
    oliveKg: extractions.reduce((sum, x) => sum + x.oliveKg, 0),
    productions: extractions.length,
    harvestDays: days.size,
    treesHarvested: harvests.reduce((sum, entry) => sum + (entry.trees ?? 0), 0),
    years: new Set(extractions.map((x) => seasonOf(x.date, startMonth))).size,
    salesAmount: live(input.transactions)
      .filter((tx) => tx.kind === 'sale')
      .reduce((sum, tx) => sum + tx.amount, 0),
  }

  return { records, totals }
}
