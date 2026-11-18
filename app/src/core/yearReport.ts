/*
 * "This year" report: how the current farming year is going, and how it compares with an
 * earlier year or with the average of the earlier years.
 *
 * Totals come from the work log (units and trees) and from productions (olives weighed at
 * the mill and oil). The chart adds them up day by day through the year; days are counted
 * from the start of the farming year so different years can be drawn on one axis.
 */

import type { Extraction, Field, ISODate, TaskEntry, TaskType } from './types'
import { seasonOf, seasonRange } from './dates'
import { netOil } from './oil'

/** What the chart adds up: one harvest unit (e.g. sacks), oil (kg) or trees harvested. */
export type CumulativeMetric =
  { kind: 'unit'; unitId: string } | { kind: 'oil' } | { kind: 'trees' }

export interface CurvePoint {
  /** Days since the farming year started. */
  day: number
  /** The running total up to and including that day. */
  value: number
}

export interface TreesPerDay {
  taskTypeId: string
  trees: number
  days: number
  perDay: number
}

export interface YearSummary {
  season: number
  /** Harvest units collected, e.g. { sackId: 86 }. */
  units: Record<string, number>
  /** Days with a harvest that has units in it. */
  harvestDays: number
  /** Units per harvest day, e.g. { sackId: 9.5 }. */
  unitsPerHarvestDay: Record<string, number>
  /** Olives weighed at the mill and oil, from this year's productions. */
  oliveKg: number
  oilKg: number
  netOilKg: number
  productions: number
  /** Trees per work day, for each task type where trees are entered. */
  treesPerDay: TreesPerDay[]
  /** Trees harvested this year, and all trees in the fields in use. */
  treesHarvested: number
  farmTrees: number
}

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

/** Days from the start of the farming year to `date` (DST-safe). */
export function dayOfSeason(date: ISODate, seasonStartMonth = 3) {
  const [start] = seasonRange(seasonOf(date, seasonStartMonth), seasonStartMonth)
  return Math.round((utc(date) - utc(start)) / 86_400_000)
}

function utc(date: ISODate) {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
}

export function yearSummary(input: {
  season: number
  entries: TaskEntry[]
  extractions: Extraction[]
  fields: Field[]
  taskTypes: TaskType[]
  seasonStartMonth?: number
}): YearSummary {
  const startMonth = input.seasonStartMonth ?? 3
  function inSeason(date: ISODate) {
    return seasonOf(date, startMonth) === input.season
  }
  const types = live(input.taskTypes)
  const harvestIds = new Set(types.filter((x) => x.inputKind === 'harvest').map((x) => x.id))
  const entries = live(input.entries).filter((entry) => inSeason(entry.date))
  const extractions = live(input.extractions).filter((extraction) => inSeason(extraction.date))

  const units: Record<string, number> = {}
  const harvestDates = new Set<string>()
  let treesHarvested = 0
  const treesByType = new Map<string, { trees: number; dates: Set<string> }>()
  for (const entry of entries) {
    if (harvestIds.has(entry.taskTypeId)) {
      treesHarvested += entry.trees ?? 0

      for (const quantity of entry.quantities ?? []) {
        if (quantity.amount > 0) {
          units[quantity.unitId] = (units[quantity.unitId] ?? 0) + quantity.amount
          harvestDates.add(entry.date)
        }
      }
    }
    if (entry.trees) {
      const row = treesByType.get(entry.taskTypeId) ?? { trees: 0, dates: new Set<string>() }
      row.trees += entry.trees
      row.dates.add(entry.date)
      treesByType.set(entry.taskTypeId, row)
    }
  }

  const order = new Map(types.map((type) => [type.id, type.order]))
  const treesPerDay = [...treesByType.entries()]
    .map(([taskTypeId, row]) => ({
      taskTypeId,
      trees: row.trees,
      days: row.dates.size,
      perDay: row.trees / row.dates.size,
    }))
    .sort(
      (left, right) =>
        (order.get(left.taskTypeId) ?? 99) - (order.get(right.taskTypeId) ?? 99),
    )

  const harvestDays = harvestDates.size
  const unitsPerHarvestDay = Object.fromEntries(
    Object.entries(units).map(([unitId, amount]) => [unitId, amount / harvestDays]),
  )

  return {
    season: input.season,
    units,
    harvestDays,
    unitsPerHarvestDay,
    oliveKg: extractions.reduce((sum, extraction) => sum + extraction.oliveKg, 0),
    oilKg: extractions.reduce((sum, extraction) => sum + extraction.oilKg, 0),
    netOilKg: extractions.reduce((sum, extraction) => sum + netOil(extraction), 0),
    productions: extractions.length,
    treesPerDay,
    treesHarvested,
    farmTrees: live(input.fields)
      .filter((field) => !field.archived)
      .reduce((sum, field) => sum + (field.trees || 0), 0),
  }
}

/**
 * Running totals through the year, one curve per farming year that has any of it.
 * Each curve has a point on every day something was added.
 */
export function cumulativeCurves(input: {
  metric: CumulativeMetric
  entries: TaskEntry[]
  extractions: Extraction[]
  harvestTypeIds: Set<string>
  seasonStartMonth?: number
}): Map<number, CurvePoint[]> {
  const startMonth = input.seasonStartMonth ?? 3
  const added: { date: ISODate; amount: number }[] = []
  const { metric } = input
  if (metric.kind === 'oil') {
    for (const extraction of live(input.extractions)) {
      added.push({ date: extraction.date, amount: extraction.oilKg })
    }
  } else {
    for (const entry of live(input.entries)) {
      if (!input.harvestTypeIds.has(entry.taskTypeId)) {
        continue
      }
      const amount =
        metric.kind === 'trees'
          ? (entry.trees ?? 0)
          : (entry.quantities ?? [])
              .filter((quantity) => quantity.unitId === metric.unitId)
              .reduce((sum, quantity) => sum + quantity.amount, 0)
      added.push({ date: entry.date, amount })
    }
  }

  const byDay = new Map<number, Map<number, number>>()
  for (const { date, amount } of added) {
    if (!(amount > 0)) {
      continue
    }
    const season = seasonOf(date, startMonth)
    const days = byDay.get(season) ?? new Map<number, number>()
    const day = dayOfSeason(date, startMonth)
    days.set(day, (days.get(day) ?? 0) + amount)
    byDay.set(season, days)
  }

  const curves = new Map<number, CurvePoint[]>()
  for (const [season, days] of [...byDay.entries()].sort(([left], [right]) => left - right)) {
    let total = 0
    curves.set(
      season,
      [...days.entries()]
        .sort(([left], [right]) => left - right)
        .map(([day, amount]) => {
          total += amount
          return { day, value: total }
        }),
    )
  }

  return curves
}

/** A curve's running total on a day (0 before it starts, its total after it ends). */
export function valueOnDay(curve: CurvePoint[], day: number) {
  let value = 0
  for (const point of curve) {
    if (point.day > day) {
      break
    }
    value = point.value
  }

  return value
}

/** The average of several years' curves, day by day (with a point wherever any changes). */
export function averageCurve(curves: CurvePoint[][]): CurvePoint[] {
  if (curves.length === 0) {
    return []
  }
  const days = [...new Set(curves.flatMap((curve) => curve.map((point) => point.day)))].sort(
    (left, right) => left - right,
  )

  return days.map((day) => ({
    day,
    value: curves.reduce((sum, curve) => sum + valueOnDay(curve, day), 0) / curves.length,
  }))
}
