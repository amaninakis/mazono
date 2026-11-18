/*
 * "Put another way": the farm's own numbers turned into pictures people know, e.g. "this
 * year's oil fills 6 bathtubs" or "all your olives weigh as much as 3 small cars".
 *
 * Four facts are shown: two about the latest year and two long-term ones (all years, the
 * averages per tree and per litre, and records such as the best year or the busiest day).
 * Each of the four places has its own pool of facts and goes round it with "show another",
 * so tapping one card never changes another. Which facts come first changes from day to day,
 * and the two facts of a pair are about different things (oil, olives, trees, averages).
 *
 * Nothing here is a fixed list of lines: for every number the objects whose size fits best
 * are found, so the sentence reads naturally ("3 bathtubs", not "0.0004 Olympic pools").
 * Totals also say what comes next ("18 litres more: 5 bathtubs").
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

/** Which numbers a fact is about: the latest year, all years, a record, or the farm today. */
export type Scope = 'year' | 'all' | 'bestYear' | 'biggestProduction' | 'busiestDay' | 'farm'
export type Measure =
  | 'oilVolume'
  | 'oilWeight'
  | 'oliveWeight'
  | 'treeLine'
  | 'family'
  | 'salads'
  | 'oilPerTree'
  | 'olivesPerLitre'

/** The four places on screen: two short-term facts and two long-term ones. */
export type Slot = 'short0' | 'short1' | 'long0' | 'long1'
export const SLOTS: Slot[] = ['short0', 'short1', 'long0', 'long1']

/** How many of an object: "3½", "about one", "¾ of one". */
export type Amount =
  | { kind: 'times'; count: number }
  | { kind: 'about' }
  | { kind: 'fraction'; part: '¼' | '⅓' | '½' | '⅔' | '¾' }

export interface Comparison {
  /** The place on screen; "show another" turns are counted per slot. */
  slot: Slot
  /** Which fact, e.g. "oilVolume:year". */
  id: string
  measure: Measure
  scope: Scope
  icon: string
  /** The season (latest or best year) or the day (records) the fact is about. */
  season?: number
  date?: string
  /** For "your 1,240 trees, lined up…". */
  trees?: number
  /** The object, for measures compared to one. */
  reference?: string
  amount?: Amount
  /** For family (years), salads and kilos of olives per litre: how many. */
  count?: number
  /** What comes next: the next whole number of the object, how much is missing, and how
   * far it is from the last whole one (0–1). Only for totals that keep growing. */
  next?: { count: number; missing: number; progress: number }
  /** Whether "show another" has something else to show. */
  more: boolean
}

export interface ComparisonTotals {
  oliveKg: number
  netOilKg: number
  trees: number
}

export interface ComparisonInput {
  /** The latest farming year with a production. */
  latest?: { season: number; totals: ComparisonTotals }
  all: ComparisonTotals
  bestYear?: { season: number; netOilKg: number }
  biggestProduction?: { date: string; oilKg: number }
  busiestDay?: { date: string; trees: number }
  /** Trees in all the fields today. */
  farmTrees: number
  /** Oil and trees of only the years with both, for the long-term oil per tree. */
  perTree?: { netOilKg: number; trees: number }
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

const DIMENSIONS: Partial<Record<Measure, Dimension>> = {
  oilVolume: 'volume',
  oilWeight: 'weight',
  oliveWeight: 'weight',
  treeLine: 'length',
  oilPerTree: 'volume',
}

const PLAIN_ICONS: Partial<Record<Measure, string>> = {
  family: '👨‍👩‍👧‍👦',
  salads: '🥗',
  olivesPerLitre: '⚖️',
}

/** What a fact is about, so the two facts of a pair differ. */
type Topic = 'oil' | 'olives' | 'trees' | 'average'
const TOPICS: Record<Measure, Topic> = {
  oilVolume: 'oil',
  oilWeight: 'oil',
  family: 'oil',
  salads: 'oil',
  oliveWeight: 'olives',
  treeLine: 'trees',
  oilPerTree: 'average',
  olivesPerLitre: 'average',
}

/** A number to show, before an object is chosen for it. */
interface Fact {
  id: string
  measure: Measure
  scope: Scope
  /** Litres, kg, metres; years (family), salads, kg per litre. */
  value: number
  season?: number
  date?: string
  trees?: number
  /** Totals that keep growing get a "… more for …" line. */
  growing: boolean
}

function litres(oilKg: number) {
  return oilKg / OIL_KG_PER_LITRE
}

/** The facts about one set of totals (the latest year, or all years). */
function totalFacts(
  scope: 'year' | 'all',
  totals: ComparisonTotals,
  season?: number,
  perTree = { netOilKg: totals.netOilKg, trees: totals.trees },
): Fact[] {
  const oil = totals.netOilKg
  const facts: Omit<Fact, 'id' | 'scope' | 'season'>[] = [
    { measure: 'oliveWeight', value: totals.oliveKg, growing: true },
    { measure: 'oilVolume', value: litres(oil), growing: true },
    { measure: 'oilWeight', value: oil, growing: true },
    { measure: 'family', value: oil / (4 * OIL_KG_PER_PERSON_YEAR), growing: false },
    { measure: 'salads', value: oil / OIL_KG_PER_SALAD, growing: false },
    { measure: 'treeLine', value: totals.trees * METRES_BETWEEN_TREES, growing: true },
    {
      measure: 'oilPerTree',
      value: perTree.trees > 0 ? litres(perTree.netOilKg) / perTree.trees : 0,
      growing: false,
    },
    {
      measure: 'olivesPerLitre',
      value: oil > 0 && totals.oliveKg > 0 ? totals.oliveKg / litres(oil) : 0,
      growing: false,
    },
  ]

  return facts.map((fact) => ({ ...fact, id: `${fact.measure}:${scope}`, scope, season }))
}

/** All facts there are numbers for, split into short-term and long-term. */
function factsOf(input: ComparisonInput) {
  const latest = input.latest
  const short = latest ? totalFacts('year', latest.totals, latest.season) : []
  // With a single year, "all these years" would only repeat the year's numbers.
  const onlyOneYear =
    !!latest &&
    Math.abs(latest.totals.netOilKg - input.all.netOilKg) < 0.5 &&
    Math.abs(latest.totals.oliveKg - input.all.oliveKg) < 0.5
  const long = onlyOneYear
    ? []
    : totalFacts('all', input.all, undefined, input.perTree ?? { netOilKg: 0, trees: 0 })

  if (input.bestYear && input.bestYear.season !== latest?.season) {
    long.push({
      id: 'oilVolume:bestYear',
      measure: 'oilVolume',
      scope: 'bestYear',
      value: litres(input.bestYear.netOilKg),
      season: input.bestYear.season,
      growing: false,
    })
  }
  if (input.biggestProduction) {
    long.push({
      id: 'oilWeight:biggestProduction',
      measure: 'oilWeight',
      scope: 'biggestProduction',
      value: input.biggestProduction.oilKg,
      date: input.biggestProduction.date,
      growing: false,
    })
  }
  if (input.busiestDay) {
    long.push({
      id: 'treeLine:busiestDay',
      measure: 'treeLine',
      scope: 'busiestDay',
      value: input.busiestDay.trees * METRES_BETWEEN_TREES,
      date: input.busiestDay.date,
      growing: false,
    })
  }
  if (input.farmTrees > 0) {
    long.push({
      id: 'treeLine:farm',
      measure: 'treeLine',
      scope: 'farm',
      value: input.farmTrees * METRES_BETWEEN_TREES,
      trees: input.farmTrees,
      growing: false,
    })
  }

  return { short, long }
}

/** The objects that fit a number well, best first. */
function objectsFor(fact: Fact) {
  const dimension = DIMENSIONS[fact.measure]

  return REFERENCES.filter(
    (reference) =>
      reference.dimension === dimension &&
      (!reference.oilOnly || TOPICS[fact.measure] !== 'olives') &&
      fact.value / reference.size >= 0.25 &&
      fact.value / reference.size <= 60,
  )
    .sort((left, right) => fit(fact.value / left.size) - fit(fact.value / right.size))
    .slice(0, 3)
}

/** Whether there is something sensible to say about a fact. */
function usable(fact: Fact) {
  if (!(fact.value > 0)) {
    return false
  }
  if (DIMENSIONS[fact.measure]) {
    return objectsFor(fact).length > 0
  }

  return fact.measure !== 'family' || fact.value >= 1 / 24
}

/** The card for a fact; `turn` picks among the objects that fit. */
function cardOf(fact: Fact, slot: Slot, turn: number, otherFacts: number): Comparison {
  const base = {
    slot,
    id: fact.id,
    measure: fact.measure,
    scope: fact.scope,
    season: fact.season,
    date: fact.date,
    trees: fact.trees,
  }
  if (!DIMENSIONS[fact.measure]) {
    const count =
      fact.measure === 'family' ? Math.round(fact.value * 2) / 2 : roundNicely(fact.value)

    return { ...base, icon: PLAIN_ICONS[fact.measure] ?? '', count, more: otherFacts > 1 }
  }

  const objects = objectsFor(fact)
  const reference = objects[turn % objects.length]
  const ratio = fact.value / reference.size
  const amount = amountOf(ratio)
  const card: Comparison = {
    ...base,
    icon: reference.icon,
    reference: reference.id,
    amount,
    more: otherFacts > 1 || objects.length > 1,
  }
  if (fact.growing) {
    // The next whole number above what the card says (it may round up: 21.9 reads "22").
    const shown = amount.kind === 'times' ? amount.count : ratio
    const nextCount = Math.max(Math.floor(shown) + 1, Math.floor(ratio) + 1)
    card.next = {
      count: nextCount,
      missing: nextCount * reference.size - fact.value,
      // From the last whole one to the next (6 → 7 tanks), not from zero.
      progress: Math.min(Math.max(ratio - (nextCount - 1), 0), 1),
    }
  }

  return card
}

/** A small seeded random number generator (mulberry32), so a day always shows the same. */
function randomFrom(seed: number) {
  let state = seed >>> 0

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Shuffle the facts for the day, then deal them to the two places of a pair so that
 * neighbours are about different things: the pair starts on two different topics and
 * each place goes round its own facts.
 */
export function dealFacts<T extends { measure: Measure }>(
  facts: T[],
  seed: number,
): [T[], T[]] {
  const random = randomFrom(seed)
  const shuffled = [...facts]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const byTopic = new Map<Topic, T[]>()
  for (const fact of shuffled) {
    const topic = TOPICS[fact.measure]
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), fact])
  }
  // Take one from each topic in turn: oil, trees, olives, oil, …
  const queues = [...byTopic.values()]
  const order: T[] = []
  while (order.length < shuffled.length) {
    for (const queue of queues) {
      const fact = queue.shift()
      if (fact) {
        order.push(fact)
      }
    }
  }

  return [order.filter((_, i) => i % 2 === 0), order.filter((_, i) => i % 2 === 1)]
}

/**
 * The four "put another way" cards: two about the latest year, then two long-term ones.
 * `seed` changes them from day to day (e.g. the day number); `turns` counts the "show
 * another" taps per slot.
 */
export function comparisons(
  input: ComparisonInput,
  seed: number,
  turns: Partial<Record<Slot, number>> = {},
): Comparison[] {
  const { short, long } = factsOf(input)
  const cards: Comparison[] = []
  const pairs: [Slot, Slot, Fact[]][] = [
    ['short0', 'short1', short.filter(usable)],
    ['long0', 'long1', long.filter(usable)],
  ]

  for (const [firstSlot, secondSlot, facts] of pairs) {
    const dealt = dealFacts(facts, seed)
    for (const [slot, own] of [
      [firstSlot, dealt[0]],
      [secondSlot, dealt[1]],
    ] as const) {
      if (own.length === 0) {
        continue
      }
      const turn = turns[slot] ?? 0
      // Go round this place's facts; each time round, the next object for the same fact.
      const fact = own[turn % own.length]
      cards.push(cardOf(fact, slot, seed + Math.floor(turn / own.length), own.length))
    }
  }

  return cards
}

/**
 * Oil and harvested trees added up over only the farming years that have both, so years
 * whose oil was entered without tree counts don't make each tree look like it gave more.
 */
export function perTreeTotals(
  extractions: Extraction[],
  entries: TaskEntry[],
  harvestTypeIds: Set<string>,
  seasonStartMonth = 3,
) {
  const oil = new Map<number, number>()
  for (const extraction of extractions) {
    if (!extraction.deletedAt) {
      const season = seasonOf(extraction.date, seasonStartMonth)
      oil.set(season, (oil.get(season) ?? 0) + netOil(extraction))
    }
  }
  const trees = new Map<number, number>()
  for (const entry of entries) {
    if (!entry.deletedAt && harvestTypeIds.has(entry.taskTypeId) && entry.trees) {
      const season = seasonOf(entry.date, seasonStartMonth)
      trees.set(season, (trees.get(season) ?? 0) + entry.trees)
    }
  }
  const total = { netOilKg: 0, trees: 0 }
  for (const [season, treeCount] of trees) {
    const seasonOil = oil.get(season) ?? 0
    if (seasonOil > 0) {
      total.netOilKg += seasonOil
      total.trees += treeCount
    }
  }

  return total
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
