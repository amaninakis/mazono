/*
 * "Put another way": the farm's own numbers turned into pictures people know, e.g. "this
 * year's oil fills 6 bathtubs" or "all your olives weigh as much as 3 small cars".
 *
 * Nothing here is a fixed list of lines. Each time, for every number (oil this year, olives
 * over all years, trees harvested…), the objects whose size fits best are found, so the
 * sentence reads naturally ("3 bathtubs", not "0.0004 Olympic pools"). Which of the good fits
 * is shown changes from day to day and with "show another", and no object is used twice on
 * the same screen. Every card also says what comes next ("18 litres more: 5 bathtubs").
 *
 * The sizes are rounded, everyday figures: the comparisons are for a picture, not a measure.
 */

import type { Extraction, TaskEntry } from './types'
import { seasonOf } from './dates'
import { netOil } from './oil'

export type Dimension = 'volume' | 'weight' | 'length'

export interface Reference {
  id: string
  dimension: Dimension
  /** Litres, kilograms or metres. */
  size: number
  icon: string
  /** Only for oil (e.g. the 17-kilo oil tin). */
  oilOnly?: boolean
}

export const REFERENCES: Reference[] = [
  // Volume, litres
  { id: 'bottle', dimension: 'volume', size: 1, icon: '🫙' },
  { id: 'bucket', dimension: 'volume', size: 10, icon: '🪣' },
  { id: 'carTank', dimension: 'volume', size: 50, icon: '⛽' },
  { id: 'bathtub', dimension: 'volume', size: 150, icon: '🛁' },
  { id: 'barrel', dimension: 'volume', size: 225, icon: '🛢️' },
  { id: 'waterTank', dimension: 'volume', size: 1000, icon: '💧' },
  { id: 'tanker', dimension: 'volume', size: 30_000, icon: '🚛' },
  { id: 'homePool', dimension: 'volume', size: 50_000, icon: '🏡' },
  { id: 'olympicPool', dimension: 'volume', size: 2_500_000, icon: '🏊' },
  // Weight, kilograms
  { id: 'oilTin', dimension: 'weight', size: 17, icon: '🥫', oilOnly: true },
  { id: 'person', dimension: 'weight', size: 75, icon: '🧍' },
  { id: 'donkey', dimension: 'weight', size: 250, icon: '🫏' },
  { id: 'cow', dimension: 'weight', size: 650, icon: '🐄' },
  { id: 'car', dimension: 'weight', size: 1000, icon: '🚗' },
  { id: 'pickup', dimension: 'weight', size: 2000, icon: '🛻' },
  { id: 'elephant', dimension: 'weight', size: 6000, icon: '🐘' },
  { id: 'truck', dimension: 'weight', size: 12_000, icon: '🚚' },
  { id: 'whale', dimension: 'weight', size: 150_000, icon: '🐋' },
  // Length, metres
  { id: 'parthenon', dimension: 'length', size: 70, icon: '🏛️' },
  { id: 'pitch', dimension: 'length', size: 105, icon: '⚽' },
  { id: 'track', dimension: 'length', size: 400, icon: '🏃' },
  { id: 'bridge', dimension: 'length', size: 2880, icon: '🌉' },
]

/** Olive oil weighs about 0.916 kg per litre. */
export const OIL_KG_PER_LITRE = 0.916
/** Greeks use about 12 kg of olive oil per person a year (International Olive Council). */
export const OIL_KG_PER_PERSON_YEAR = 12
/** A village salad takes about two tablespoons of oil (about 27 g). */
export const OIL_KG_PER_SALAD = 0.027
/** Trees "lined up" at a usual planting distance. */
export const METRES_BETWEEN_TREES = 7

export type Scope = 'year' | 'all'
export type Measure =
  'oilVolume' | 'oilWeight' | 'oliveWeight' | 'treeLine' | 'family' | 'salads'

/** How many of an object: "3½", "about one", "¾ of one". */
export type Amount =
  | { kind: 'times'; count: number }
  | { kind: 'about' }
  | { kind: 'fraction'; part: '¼' | '⅓' | '½' | '⅔' | '¾' }

export interface Comparison {
  /** Stable per card, e.g. "oilVolume:year". */
  id: string
  measure: Measure
  scope: Scope
  icon: string
  /** The object, for measures compared to one. */
  reference?: string
  amount?: Amount
  /** For family (years) and salads: how many. */
  count?: number
  /** What comes next: the next whole number of the object, how much is missing, and how
   * far it is from the last whole one (0–1). */
  next?: { count: number; missing: number; progress: number }
  /** How many good objects there are to choose from (so "show another" is offered). */
  choices: number
}

export interface ComparisonTotals {
  oliveKg: number
  netOilKg: number
  trees: number
}

const FRACTIONS = [
  { part: '¼', value: 1 / 4 },
  { part: '⅓', value: 1 / 3 },
  { part: '½', value: 1 / 2 },
  { part: '⅔', value: 2 / 3 },
  { part: '¾', value: 3 / 4 },
] as const

/** A ratio as people would say it. */
export function amountOf(ratio: number): Amount {
  if (ratio >= 1.25) {
    const count = ratio < 10 ? Math.round(ratio * 2) / 2 : roundNicely(ratio)
    return { kind: 'times', count }
  }
  if (ratio >= 0.85) {
    return { kind: 'about' }
  }
  const nearest = FRACTIONS.reduce((best, fraction) =>
    Math.abs(fraction.value - ratio) < Math.abs(best.value - ratio) ? fraction : best,
  )

  return { kind: 'fraction', part: nearest.part }
}

/** 2 significant figures: 1,234 → 1,200. */
export function roundNicely(value: number) {
  if (value < 10) {
    return Math.round(value * 10) / 10
  }
  const power = 10 ** (Math.floor(Math.log10(value)) - 1)

  return Math.round(value / power) * power
}

/** How well a ratio reads: best around "a few" (4), fine from ¼ to about 50. */
function fit(ratio: number) {
  return Math.abs(Math.log10(ratio) - Math.log10(4))
}

function dimensionOf(measure: Measure): Dimension | undefined {
  const dimensions: Partial<Record<Measure, Dimension>> = {
    oilVolume: 'volume',
    oilWeight: 'weight',
    oliveWeight: 'weight',
    treeLine: 'length',
  }

  return dimensions[measure]
}

/** The amount measured, in the dimension's unit (litres, kg, metres; years; salads). */
function valueOf(measure: Measure, totals: ComparisonTotals) {
  const values: Record<Measure, number> = {
    oilVolume: totals.netOilKg / OIL_KG_PER_LITRE,
    oilWeight: totals.netOilKg,
    oliveWeight: totals.oliveKg,
    treeLine: totals.trees * METRES_BETWEEN_TREES,
    family: totals.netOilKg / (4 * OIL_KG_PER_PERSON_YEAR),
    salads: totals.netOilKg / OIL_KG_PER_SALAD,
  }

  return values[measure]
}

/** The cards, in the order shown; a card is left out when its number is still zero. */
const CARDS: { measure: Measure; scope: Scope }[] = [
  { measure: 'oliveWeight', scope: 'year' },
  { measure: 'oilVolume', scope: 'year' },
  { measure: 'family', scope: 'year' },
  { measure: 'oilVolume', scope: 'all' },
  { measure: 'oliveWeight', scope: 'all' },
  { measure: 'treeLine', scope: 'all' },
  { measure: 'oilWeight', scope: 'all' },
  { measure: 'salads', scope: 'year' },
]

/**
 * The comparison cards for a year's totals and all years' totals.
 * `seed` changes which good fit is shown (e.g. the day number); `turns` counts the
 * "show another" taps per card id.
 */
export function comparisons(
  totals: Record<Scope, ComparisonTotals>,
  seed: number,
  turns: Record<string, number> = {},
): Comparison[] {
  const used = new Set<string>()
  const cards: Comparison[] = []

  for (const { measure, scope } of CARDS) {
    const id = `${measure}:${scope}`
    const value = valueOf(measure, totals[scope])
    if (!(value > 0)) {
      continue
    }
    const dimension = dimensionOf(measure)
    if (!dimension) {
      // Family years and salads: a plain count, no object.
      const count = measure === 'family' ? Math.round(value * 2) / 2 : roundNicely(value)
      if (count > 0) {
        cards.push({
          id,
          measure,
          scope,
          icon: measure === 'family' ? '👨‍👩‍👧‍👦' : '🥗',
          count,
          choices: 1,
        })
      }
      continue
    }

    const fitting = REFERENCES.filter(
      (reference) =>
        reference.dimension === dimension &&
        (!reference.oilOnly || measure.startsWith('oil')) &&
        value / reference.size >= 0.25 &&
        value / reference.size <= 60,
    ).sort((left, right) => fit(value / left.size) - fit(value / right.size))
    const fresh = fitting.filter((reference) => !used.has(reference.id))
    const pool = (fresh.length > 0 ? fresh : fitting).slice(0, 3)
    if (pool.length === 0) {
      continue
    }
    const reference = pool[(seed + (turns[id] ?? 0)) % pool.length]
    used.add(reference.id)

    const ratio = value / reference.size
    const amount = amountOf(ratio)
    // The next whole number above what the card says (it may round up: 21.9 reads "22").
    const shown = amount.kind === 'times' ? amount.count : ratio
    const nextCount = Math.max(Math.floor(shown) + 1, Math.floor(ratio) + 1)
    cards.push({
      id,
      measure,
      scope,
      icon: reference.icon,
      reference: reference.id,
      amount,
      next: {
        count: nextCount,
        missing: nextCount * reference.size - value,
        // From the last whole one to the next (6 → 7 tanks), not from zero.
        progress: Math.min(Math.max(ratio - (nextCount - 1), 0), 1),
      },
      choices: pool.length,
    })
  }

  return cards
}

/** A whole number that changes once a day: today's comparisons stay put until tomorrow. */
export function daySeed(now: Date) {
  return Math.floor(now.getTime() / 86_400_000)
}

/**
 * Totals of the latest farming year with a production (this year once the first production
 * is in; until then the year before), for the "this year" cards.
 */
export function latestYearTotals(
  extractions: Extraction[],
  entries: TaskEntry[],
  harvestTypeIds: Set<string>,
  seasonStartMonth = 3,
): { season: number; totals: ComparisonTotals } | undefined {
  const live = extractions.filter((extraction) => !extraction.deletedAt)
  if (live.length === 0) {
    return undefined
  }
  const season = Math.max(
    ...live.map((extraction) => seasonOf(extraction.date, seasonStartMonth)),
  )
  const inSeason = live.filter(
    (extraction) => seasonOf(extraction.date, seasonStartMonth) === season,
  )
  const trees = entries
    .filter(
      (entry) =>
        !entry.deletedAt &&
        harvestTypeIds.has(entry.taskTypeId) &&
        seasonOf(entry.date, seasonStartMonth) === season,
    )
    .reduce((sum, entry) => sum + (entry.trees ?? 0), 0)

  return {
    season,
    totals: {
      oliveKg: inSeason.reduce((sum, extraction) => sum + extraction.oliveKg, 0),
      netOilKg: inSeason.reduce((sum, extraction) => sum + netOil(extraction), 0),
      trees,
    },
  }
}
