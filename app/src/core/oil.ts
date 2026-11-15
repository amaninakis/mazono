import { seasonOf } from './dates';
import type {
  Allocation,
  Extraction,
  ISODate,
  StockMovement,
  TaskEntry,
  Unit,
  UnitAmount,
} from './types';

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
const sumUnits = (qs: UnitAmount[]) => qs.reduce((s, q) => s + q.amount, 0);

/* ---------- charges and net oil ---------- */

export const chargesKg = (e: Pick<Extraction, 'charges'>) => e.charges.reduce((s, c) => s + c.kg, 0);

/** Oil extracted minus everything the mill kept. */
export const netOil = (e: Pick<Extraction, 'oilKg' | 'charges'>) => Math.max(e.oilKg - chargesKg(e), 0);

/** A charge as a share of the oil extracted (0.14 = 14%). */
export const chargeShare = (kg: number, oilKg: number) => (oilKg > 0 ? kg / oilKg : 0);

/** Kg for a charge from its default percentage, rounded to 0.1 kg. */
export const chargeFromPercent = (percent: number, oilKg: number) => Math.round((oilKg * percent) / 10) / 10;

/* ---------- harvest entries ↔ extractions ---------- */

/** Units of a harvest entry already given to extractions (optionally ignoring one extraction). */
export function allocatedUnits(entryId: string, extractions: Extraction[], excludeId?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of live(extractions)) {
    if (x.id === excludeId) continue;
    for (const a of x.allocations) {
      if (a.entryId !== entryId) continue;
      for (const q of a.quantities) out[q.unitId] = (out[q.unitId] ?? 0) + q.amount;
    }
  }
  return out;
}

/** Units of a harvest entry not yet given to any extraction. */
export function availableUnits(entry: TaskEntry, extractions: Extraction[], excludeId?: string): UnitAmount[] {
  const used = allocatedUnits(entry.id, extractions, excludeId);
  return (entry.quantities ?? [])
    .map((q) => ({ unitId: q.unitId, amount: Math.round((q.amount - (used[q.unitId] ?? 0)) * 1000) / 1000 }))
    .filter((q) => q.amount > 0);
}

/** Date of the latest extraction before `date` (to pre-tick the harvest days since then). */
export function previousExtractionDate(extractions: Extraction[], date: ISODate, excludeId?: string): ISODate | undefined {
  return live(extractions)
    .filter((x) => x.id !== excludeId && x.date <= date)
    .map((x) => x.date)
    .sort()
    .at(-1);
}

/* ---------- unit weights ---------- */

export interface UnitWeight {
  kg: number;
  source: 'learned' | 'user';
  /** Number of extractions it was learned from. */
  batches: number;
}

/**
 * Kg of olives per unit. Learned from extractions whose harvest used a single unit type
 * (olives kg ÷ units); the user's estimate is used until there is such an extraction.
 */
export function unitWeights(units: Unit[], extractions: Extraction[]): Record<string, UnitWeight> {
  const acc: Record<string, { kg: number; units: number; batches: number }> = {};
  for (const x of live(extractions)) {
    const qs = x.allocations.flatMap((a) => a.quantities).filter((q) => q.amount > 0);
    const ids = new Set(qs.map((q) => q.unitId));
    if (ids.size !== 1 || x.oliveKg <= 0) continue;
    const [id] = ids;
    const a = (acc[id] ??= { kg: 0, units: 0, batches: 0 });
    a.kg += x.oliveKg;
    a.units += sumUnits(qs);
    a.batches += 1;
  }
  const out: Record<string, UnitWeight> = {};
  for (const u of units) {
    const a = acc[u.id];
    if (a && a.units > 0) out[u.id] = { kg: a.kg / a.units, source: 'learned', batches: a.batches };
    else if (u.approxKg) out[u.id] = { kg: u.approxKg, source: 'user', batches: 0 };
  }
  return out;
}

/**
 * Share of a batch that each allocation represents, by estimated olive weight.
 * With one unit type this is a plain split by units. Units without a known weight count as
 * the average of the known ones (or 1 when none is known).
 */
export function allocationShares(allocations: Allocation[], weights: Record<string, UnitWeight>): number[] {
  const known = Object.values(weights).map((w) => w.kg);
  const fallback = known.length ? known.reduce((s, k) => s + k, 0) / known.length : 1;
  const ids = new Set(allocations.flatMap((a) => a.quantities.map((q) => q.unitId)));
  const w = (id: string) => (ids.size === 1 ? 1 : (weights[id]?.kg ?? fallback));
  const sizes = allocations.map((a) => a.quantities.reduce((s, q) => s + q.amount * w(q.unitId), 0));
  const total = sizes.reduce((s, x) => s + x, 0);
  return sizes.map((x) => (total > 0 ? x / total : 0));
}

/** Estimated oil (gross and net) for each harvest entry in an extraction. */
export function oilByEntry(x: Extraction, weights: Record<string, UnitWeight>): Record<string, { oil: number; net: number }> {
  const shares = allocationShares(x.allocations, weights);
  const net = netOil(x);
  const out: Record<string, { oil: number; net: number }> = {};
  x.allocations.forEach((a, i) => {
    const o = (out[a.entryId] ??= { oil: 0, net: 0 });
    o.oil += x.oilKg * shares[i];
    o.net += net * shares[i];
  });
  return out;
}

/** Trees in a batch: each entry's trees times the part of its units in this batch. */
export function batchTrees(x: Pick<Extraction, 'allocations'>, entries: TaskEntry[]): number {
  const byId = new Map(entries.map((e) => [e.id, e]));
  let trees = 0;
  for (const a of x.allocations) {
    const e = byId.get(a.entryId);
    if (!e?.trees) continue;
    const total = sumUnits(e.quantities ?? []);
    trees += total > 0 ? (e.trees * sumUnits(a.quantities)) / total : 0;
  }
  return trees;
}

/** Units in a batch, per unit type. */
export function batchUnits(x: Pick<Extraction, 'allocations'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of x.allocations.flatMap((a) => a.quantities)) out[q.unitId] = (out[q.unitId] ?? 0) + q.amount;
  return out;
}

/* ---------- stock ---------- */

/** Oil on hand per vintage and location: `stock[vintage][locationId] = kg`. */
export function stockLevels(
  extractions: Extraction[],
  movements: StockMovement[],
  seasonStartMonth = 10,
): Record<number, Record<string, number>> {
  const s: Record<number, Record<string, number>> = {};
  const add = (vintage: number, loc: string, kg: number) => {
    const v = (s[vintage] ??= {});
    v[loc] = Math.round(((v[loc] ?? 0) + kg) * 1000) / 1000;
  };
  for (const x of live(extractions)) {
    const vintage = seasonOf(x.date, seasonStartMonth);
    for (const st of x.storage) if (st.kg) add(vintage, st.locationId, st.kg);
  }
  for (const m of live(movements)) {
    add(m.vintage, m.fromLocationId, -m.kg);
    if (m.kind === 'transfer' && m.toLocationId) add(m.vintage, m.toLocationId, m.kg);
  }
  return s;
}

/* ---------- season totals ---------- */

export interface SeasonTotals {
  count: number;
  oliveKg: number;
  oilKg: number;
  chargesKg: number;
  byCharge: Record<string, number>;
  netKg: number;
  storedKg: number;
}

export function seasonTotals(extractions: Extraction[], season: number, seasonStartMonth = 10): SeasonTotals {
  const t: SeasonTotals = { count: 0, oliveKg: 0, oilKg: 0, chargesKg: 0, byCharge: {}, netKg: 0, storedKg: 0 };
  for (const x of live(extractions)) {
    if (seasonOf(x.date, seasonStartMonth) !== season) continue;
    t.count += 1;
    t.oliveKg += x.oliveKg;
    t.oilKg += x.oilKg;
    for (const c of x.charges) {
      t.chargesKg += c.kg;
      t.byCharge[c.chargeTypeId] = (t.byCharge[c.chargeTypeId] ?? 0) + c.kg;
    }
    t.netKg += netOil(x);
    t.storedKg += x.storage.reduce((s, st) => s + st.kg, 0);
  }
  return t;
}
