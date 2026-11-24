/*
 * "This year" report: how the current farming year is going, and how it compares with an
 * earlier year or with the average of the earlier years.
 *
 * Totals come from the work log (units and trees) and from productions (olives weighed at
 * the mill and oil). The chart adds them up day by day through the year; days are counted
 * from the start of the farming year so different years can be drawn on one axis.
 */

import type { Extraction, Field, ISODate, TaskEntry, TaskType, Unit } from './types'
import { seasonOf, seasonRange } from './dates'
import { batchUnits, netOil, unitWeights } from './oil'

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

/** One weigh-in at the mill this year, with what went into it. */
export interface WeighIn {
  extractionId: string
  date: ISODate
  oliveKg: number
  /** Units of the harvest days ticked for this production; empty when none were. */
  units: Record<string, number>
  /** Kg per unit, when the olives were all in one kind of unit. */
  kgPerUnit?: { unitId: string; kg: number }
}

/** Units harvested but not yet weighed, and what they are estimated to weigh. */
export interface PendingOlives {
  unitId: string
  amount: number
  kgPerUnit: number
  /** Where the kg per unit comes from: this year's weigh-ins, earlier years, or Settings. */
  source: 'thisYear' | 'earlier' | 'user'
  kg: number
}

export interface OliveEstimate {
  weighedKg: number
  estimatedKg: number
  totalKg: number
  weighIns: WeighIn[]
  pending: PendingOlives[]
  /** Not yet weighed, with no way yet to tell their weight (no weigh-in, no estimate). */
  unknown: Record<string, number>
}

/**
 * Olives of the year in kg: the mill weights of this year's productions, plus an estimate for
 * the units harvested but not yet taken to the mill. Each weigh-in gives the exact kg per
 * unit of the harvest days that went into it, and those (this year's first, then earlier
 * years', then the user's guess) estimate what is still to be weighed. A production entered
 * without ticking its harvest days still counts: it is taken to cover as many of the waiting
 * units as its weight allows, so the same olives are not counted twice.
 */
export function oliveEstimate(input: {
  season: number
  entries: TaskEntry[]
  extractions: Extraction[]
  units: Unit[]
  harvestTypeIds: Set<string>
  seasonStartMonth?: number
}): OliveEstimate {
  const startMonth = input.seasonStartMonth ?? 3
  function inSeason(date: ISODate) {
    return seasonOf(date, startMonth) === input.season
  }

  const harvested: Record<string, number> = {}
  const harvestIds = new Set<string>()
  for (const entry of live(input.entries)) {
    if (input.harvestTypeIds.has(entry.taskTypeId) && inSeason(entry.date)) {
      harvestIds.add(entry.id)

      for (const quantity of entry.quantities ?? []) {
        harvested[quantity.unitId] = (harvested[quantity.unitId] ?? 0) + quantity.amount
      }
    }
  }

  const weighIns: WeighIn[] = []
  const allocated: Record<string, number> = {}
  const thisYear: Record<string, { kg: number; units: number }> = {}
  let unlinkedKg = 0
  for (const extraction of live(input.extractions)
    .filter((each) => inSeason(each.date))
    .sort((left, right) => left.date.localeCompare(right.date))) {
    const units = Object.fromEntries(
      Object.entries(batchUnits(extraction)).filter(([, amount]) => amount > 0),
    )
    const unitIds = Object.keys(units)
    const weighIn: WeighIn = {
      extractionId: extraction.id,
      date: extraction.date,
      oliveKg: extraction.oliveKg,
      units,
    }
    if (unitIds.length === 0) {
      unlinkedKg += extraction.oliveKg
    }

    // Only this year's harvest days are subtracted (a production can take older ones too).
    for (const allocation of extraction.allocations) {
      if (harvestIds.has(allocation.entryId)) {
        for (const quantity of allocation.quantities) {
          allocated[quantity.unitId] = (allocated[quantity.unitId] ?? 0) + quantity.amount
        }
      }
    }
    if (unitIds.length === 1 && extraction.oliveKg > 0) {
      const [unitId] = unitIds
      weighIn.kgPerUnit = { unitId, kg: extraction.oliveKg / units[unitId] }
      const sum = (thisYear[unitId] ??= { kg: 0, units: 0 })
      sum.kg += extraction.oliveKg
      sum.units += units[unitId]
    }
    weighIns.push(weighIn)
  }

  const earlier = unitWeights(input.units, input.extractions)
  const pending: PendingOlives[] = []
  const unknown: Record<string, number> = {}
  for (const [unitId, amount] of Object.entries(harvested)) {
    const waiting = amount - (allocated[unitId] ?? 0)
    if (waiting <= 1e-9) {
      continue
    }
    const known = thisYear[unitId]
    const weight = earlier[unitId]
    if (known && known.units > 0) {
      pending.push(waitingOf(unitId, waiting, known.kg / known.units, 'thisYear'))
    } else if (weight) {
      pending.push(
        waitingOf(
          unitId,
          waiting,
          weight.kg,
          weight.source === 'learned' ? 'earlier' : 'user',
        ),
      )
    } else {
      unknown[unitId] = waiting
    }
  }

  // Productions without harvest days ticked weighed some of the waiting units already.
  const waitingKg = pending.reduce((sum, row) => sum + row.kg, 0)
  if (unlinkedKg > 0 && waitingKg > 0) {
    const left = Math.max(1 - unlinkedKg / waitingKg, 0)
    for (const row of pending) {
      row.amount *= left
      row.kg *= left
    }
  }
  const stillPending = pending.filter((row) => row.amount > 1e-9)
  const weighedKg = weighIns.reduce((sum, weighIn) => sum + weighIn.oliveKg, 0)
  const estimatedKg = stillPending.reduce((sum, row) => sum + row.kg, 0)

  return {
    weighedKg,
    estimatedKg,
    totalKg: weighedKg + estimatedKg,
    weighIns,
    pending: stillPending,
    unknown,
  }
}

function waitingOf(
  unitId: string,
  amount: number,
  kgPerUnit: number,
  source: PendingOlives['source'],
): PendingOlives {
  return { unitId, amount, kgPerUnit, source, kg: amount * kgPerUnit }
}

/** How much oil the olives give, from the productions of one farming year. */
export interface YieldRate {
  /** Kg of oil per kg of olives, before the mill's charges. */
  oilPerOlive: number
  /** The part of the oil left after the mill's charges (0–1). */
  netShare: number
  oliveKg: number
  oilKg: number
  /** This year's own productions, or the most recent earlier year that has some. */
  source: 'earlier' | 'thisYear'
  season: number
}

/**
 * Olive oil of the year: what the mill has already made, plus an estimate for the olives not
 * weighed yet (their estimated kg × the year's average yield; before the first production of
 * the year, the most recent earlier year's). When it cannot be told yet, `status` and
 * `missing` say what it waits for, so the report can say what to enter.
 */
export interface OilEstimate {
  /**
   * estimate: there is oil to expect from olives not weighed yet; waiting: there are olives
   * not weighed yet but something is missing to tell their oil; allWeighed: every olive
   * harvested this year has been to the mill; nothingYet: nothing harvested this year yet.
   */
  status: 'allWeighed' | 'estimate' | 'nothingYet' | 'waiting'
  rate?: YieldRate
  madeKg: number
  netMadeKg: number
  /** Oil to expect from the olives not weighed yet, before and after the mill's charges. */
  expectedKg: number
  expectedNetKg: number
  /** What is still missing for (part of) the estimate: a yield, or what some units weigh. */
  missing: ('weight' | 'yield')[]
}

export function oilEstimate(input: {
  season: number
  extractions: Extraction[]
  olives: OliveEstimate
  seasonStartMonth?: number
}): OilEstimate {
  const startMonth = input.seasonStartMonth ?? 3
  const bySeason = new Map<number, { oliveKg: number; oilKg: number; netKg: number }>()
  for (const extraction of live(input.extractions)) {
    if (extraction.oliveKg <= 0 || extraction.oilKg <= 0) {
      continue
    }
    const season = seasonOf(extraction.date, startMonth)
    const sum = bySeason.get(season) ?? { oliveKg: 0, oilKg: 0, netKg: 0 }
    sum.oliveKg += extraction.oliveKg
    sum.oilKg += extraction.oilKg
    sum.netKg += netOil(extraction)
    bySeason.set(season, sum)
  }

  const thisYear = bySeason.get(input.season)
  const earlierSeason = Math.max(
    ...[...bySeason.keys()].filter((season) => season < input.season),
    Number.NEGATIVE_INFINITY,
  )
  const from = thisYear ?? bySeason.get(earlierSeason)
  const rate: YieldRate | undefined = from && {
    oilPerOlive: from.oilKg / from.oliveKg,
    netShare: from.netKg / from.oilKg,
    oliveKg: from.oliveKg,
    oilKg: from.oilKg,
    source: thisYear ? 'thisYear' : 'earlier',
    season: thisYear ? input.season : earlierSeason,
  }

  const made = thisYear ?? { oilKg: 0, netKg: 0 }
  const expectedKg = rate ? input.olives.estimatedKg * rate.oilPerOlive : 0
  const unknownUnits = Object.values(input.olives.unknown).some((amount) => amount > 0)
  const waitingOlives = input.olives.estimatedKg > 0 || unknownUnits
  const missing: OilEstimate['missing'] = []
  if (waitingOlives && !rate) {
    missing.push('yield')
  }
  if (unknownUnits) {
    missing.push('weight')
  }

  return {
    status: oilStatus(expectedKg > 0, waitingOlives, input.olives),
    rate,
    madeKg: made.oilKg,
    netMadeKg: made.netKg,
    expectedKg,
    expectedNetKg: rate ? expectedKg * rate.netShare : 0,
    missing,
  }
}

function oilStatus(
  hasEstimate: boolean,
  waitingOlives: boolean,
  olives: OliveEstimate,
): OilEstimate['status'] {
  if (hasEstimate) {
    return 'estimate'
  }
  if (waitingOlives) {
    return 'waiting'
  }

  return olives.weighedKg > 0 ? 'allWeighed' : 'nothingYet'
}
