import type {
  Allocation,
  Extraction,
  ISODate,
  StockMovement,
  TaskEntry,
  Transaction,
  Unit,
  UnitAmount,
} from './types'
import { seasonOf } from './dates'

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

function sumUnits(qs: UnitAmount[]) {
  return qs.reduce((sum, quantity) => sum + quantity.amount, 0)
}

/* ---------- charges and net oil ---------- */

export function chargesKg(extraction: Pick<Extraction, 'charges'>) {
  return extraction.charges.reduce((sum, charge) => sum + charge.kg, 0)
}

/** Oil extracted minus everything the mill kept. */
export function netOil(extraction: Pick<Extraction, 'oilKg' | 'charges'>) {
  return Math.max(extraction.oilKg - chargesKg(extraction), 0)
}

/** A charge as a share of the oil extracted (0.14 = 14%). */
export function chargeShare(kg: number, oilKg: number) {
  return oilKg > 0 ? kg / oilKg : 0
}

/** Kg for a charge from its default percentage, rounded to 0.1 kg. */
export function chargeFromPercent(percent: number, oilKg: number) {
  return Math.round((oilKg * percent) / 10) / 10
}

/* ---------- harvest entries ↔ extractions ---------- */

/**
 * Units of a harvest entry already given to extractions (optionally ignoring one extraction).
 */
export function allocatedUnits(
  entryId: string,
  extractions: Extraction[],
  excludeId?: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of live(extractions)) {
    if (x.id === excludeId) {
      continue
    }

    for (const allocation of x.allocations) {
      if (allocation.entryId !== entryId) {
        continue
      }

      for (const quantity of allocation.quantities) {
        out[quantity.unitId] = (out[quantity.unitId] ?? 0) + quantity.amount
      }
    }
  }

  return out
}

/** Units of a harvest entry not yet given to any extraction. */
export function availableUnits(
  entry: TaskEntry,
  extractions: Extraction[],
  excludeId?: string,
): UnitAmount[] {
  const used = allocatedUnits(entry.id, extractions, excludeId)

  return (entry.quantities ?? [])
    .map((quantity) => ({
      unitId: quantity.unitId,
      amount: Math.round((quantity.amount - (used[quantity.unitId] ?? 0)) * 1000) / 1000,
    }))
    .filter((quantity) => quantity.amount > 0)
}

/** Date of the latest extraction before `date` (to pre-tick the harvest days since then). */
export function previousExtractionDate(
  extractions: Extraction[],
  date: ISODate,
  excludeId?: string,
): ISODate | undefined {
  return live(extractions)
    .filter((x) => x.id !== excludeId && x.date <= date)
    .map((x) => x.date)
    .sort()
    .at(-1)
}

/* ---------- unit weights ---------- */

export interface UnitWeight {
  kg: number
  source: 'learned' | 'user'
  /** Number of extractions it was learned from. */
  batches: number
}

/**
 * Kg of olives per unit. Learned from extractions whose harvest used a single unit type
 * (olives kg ÷ units); the user's estimate is used until there is such an extraction.
 */
export function unitWeights(
  units: Unit[],
  extractions: Extraction[],
): Record<string, UnitWeight> {
  const acc: Record<string, { kg: number; units: number; batches: number }> = {}
  for (const x of live(extractions)) {
    const qs = x.allocations
      .flatMap((allocation) => allocation.quantities)
      .filter((quantity) => quantity.amount > 0)
    const ids = new Set(qs.map((quantity) => quantity.unitId))
    if (ids.size !== 1 || x.oliveKg <= 0) {
      continue
    }
    const [id] = ids
    const bucket = (acc[id] ??= { kg: 0, units: 0, batches: 0 })
    bucket.kg += x.oliveKg
    bucket.units += sumUnits(qs)
    bucket.batches += 1
  }
  const out: Record<string, UnitWeight> = {}
  for (const unit of units) {
    const bucket = acc[unit.id]
    if (bucket && bucket.units > 0) {
      out[unit.id] = {
        kg: bucket.kg / bucket.units,
        source: 'learned',
        batches: bucket.batches,
      }
    } else if (unit.approxKg) {
      out[unit.id] = { kg: unit.approxKg, source: 'user', batches: 0 }
    }
  }

  return out
}

/**
 * Share of a batch that each allocation represents, by estimated olive weight.
 * With one unit type this is a plain split by units. Units without a known weight count as
 * the average of the known ones (or 1 when none is known).
 */
export function allocationShares(
  allocations: Allocation[],
  weights: Record<string, UnitWeight>,
): number[] {
  const known = Object.values(weights).map((weight) => weight.kg)
  const fallback = known.length ? known.reduce((sum, key) => sum + key, 0) / known.length : 1
  const ids = new Set(
    allocations.flatMap((allocation) =>
      allocation.quantities.map((quantity) => quantity.unitId),
    ),
  )
  function weightOf(id: string) {
    return ids.size === 1 ? 1 : (weights[id]?.kg ?? fallback)
  }
  const sizes = allocations.map((allocation) =>
    allocation.quantities.reduce(
      (sum, quantity) => sum + quantity.amount * weightOf(quantity.unitId),
      0,
    ),
  )
  const total = sizes.reduce((sum, x) => sum + x, 0)

  return sizes.map((x) => (total > 0 ? x / total : 0))
}

/** Estimated oil (gross and net) for each harvest entry in an extraction. */
export function oilByEntry(
  x: Extraction,
  weights: Record<string, UnitWeight>,
): Record<string, { oil: number; net: number }> {
  const shares = allocationShares(x.allocations, weights)
  const net = netOil(x)
  const out: Record<string, { oil: number; net: number }> = {}
  x.allocations.forEach((allocation, i) => {
    const oil = (out[allocation.entryId] ??= { oil: 0, net: 0 })
    oil.oil += x.oilKg * shares[i]
    oil.net += net * shares[i]
  })

  return out
}

/** Trees in a batch: each entry's trees times the part of its units in this batch. */
export function batchTrees(x: Pick<Extraction, 'allocations'>, entries: TaskEntry[]): number {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  let trees = 0
  for (const allocation of x.allocations) {
    const entry = byId.get(allocation.entryId)
    if (!entry?.trees) {
      continue
    }
    const total = sumUnits(entry.quantities ?? [])
    trees += total > 0 ? (entry.trees * sumUnits(allocation.quantities)) / total : 0
  }

  return trees
}

/** Units in a batch, per unit type. */
export function batchUnits(x: Pick<Extraction, 'allocations'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const quantity of x.allocations.flatMap((allocation) => allocation.quantities)) {
    out[quantity.unitId] = (out[quantity.unitId] ?? 0) + quantity.amount
  }

  return out
}

/* ---------- stock ---------- */

/** Seasons that have at least one extraction recorded, i.e. whose oil the app knows about. */
export function trackedVintages(
  extractions: Extraction[],
  seasonStartMonth = 10,
): Set<number> {
  return new Set(live(extractions).map((x) => seasonOf(x.date, seasonStartMonth)))
}

/**
 * A sale of oil from a season with no extractions in the app (e.g. oil from before the
 * user started). It counts as income but does not reduce stock, until that season's
 * extractions are entered; from then on it is deducted like any other sale.
 */
export function isUntrackedSale(tx: Transaction, tracked: Set<number>): boolean {
  return tx.kind === 'sale' && tx.vintage != null && !tracked.has(tx.vintage)
}

/**
 * Oil on hand per vintage and location: `stock[vintage][locationId] = kg`. Sales take oil
 * out, except sales of seasons whose extractions are not in the app (see isUntrackedSale).
 */
export function stockLevels(
  extractions: Extraction[],
  movements: StockMovement[],
  seasonStartMonth = 10,
  transactions: Transaction[] = [],
): Record<number, Record<string, number>> {
  const stock: Record<number, Record<string, number>> = {}

  function add(vintage: number, loc: string, kg: number) {
    const byLocation = (stock[vintage] ??= {})
    byLocation[loc] = Math.round(((byLocation[loc] ?? 0) + kg) * 1000) / 1000
  }

  for (const x of live(extractions)) {
    const vintage = seasonOf(x.date, seasonStartMonth)
    for (const st of x.storage) {
      if (st.kg) {
        add(vintage, st.locationId, st.kg)
      }
    }
  }

  for (const movement of live(movements)) {
    add(movement.vintage, movement.fromLocationId, -movement.kg)
    if (movement.kind === 'transfer' && movement.toLocationId) {
      add(movement.vintage, movement.toLocationId, movement.kg)
    }
  }
  const tracked = trackedVintages(extractions, seasonStartMonth)
  for (const tx of live(transactions)) {
    if (tx.kind !== 'sale' || !tx.kg || tx.vintage == null || !tx.locationId) {
      continue
    }
    if (isUntrackedSale(tx, tracked)) {
      continue
    }
    add(tx.vintage, tx.locationId, -tx.kg)
  }

  return stock
}

/* ---------- season totals ---------- */

export interface SeasonTotals {
  count: number
  oliveKg: number
  oilKg: number
  chargesKg: number
  byCharge: Record<string, number>
  netKg: number
  storedKg: number
}

export function seasonTotals(
  extractions: Extraction[],
  season: number,
  seasonStartMonth = 10,
): SeasonTotals {
  const totals: SeasonTotals = {
    count: 0,
    oliveKg: 0,
    oilKg: 0,
    chargesKg: 0,
    byCharge: {},
    netKg: 0,
    storedKg: 0,
  }

  for (const x of live(extractions)) {
    if (seasonOf(x.date, seasonStartMonth) !== season) {
      continue
    }
    totals.count += 1
    totals.oliveKg += x.oliveKg
    totals.oilKg += x.oilKg

    for (const charge of x.charges) {
      totals.chargesKg += charge.kg
      totals.byCharge[charge.chargeTypeId] =
        (totals.byCharge[charge.chargeTypeId] ?? 0) + charge.kg
    }
    totals.netKg += netOil(x)
    totals.storedKg += x.storage.reduce((sum, st) => sum + st.kg, 0)
  }

  return totals
}
