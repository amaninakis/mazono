import { seasonOf } from './dates';
import type { ISODate, Transaction, TransactionKind } from './types';

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A period for money totals: a harvest season, or a calendar year (for tax). */
export interface Period {
  kind: 'season' | 'year';
  year: number;
}

export function inPeriod(date: ISODate, p: Period, seasonStartMonth = 10): boolean {
  return p.kind === 'year' ? Number(date.slice(0, 4)) === p.year : seasonOf(date, seasonStartMonth) === p.year;
}

export interface MoneyTotals {
  sales: number;
  salesKg: number;
  otherIncome: number;
  income: number;
  expenses: number;
  net: number;
  /** € per category id (expenses and other income). */
  byCategory: Record<string, number>;
  /** Average € per kg of the oil sold. */
  averagePrice?: number;
}

export function moneyTotals(transactions: Transaction[], p: Period, seasonStartMonth = 10): MoneyTotals {
  const t: MoneyTotals = { sales: 0, salesKg: 0, otherIncome: 0, income: 0, expenses: 0, net: 0, byCategory: {} };
  for (const tx of live(transactions)) {
    if (!inPeriod(tx.date, p, seasonStartMonth)) continue;
    if (tx.kind === 'sale') {
      t.sales += tx.amount;
      t.salesKg += tx.kg ?? 0;
    } else {
      if (tx.kind === 'income') t.otherIncome += tx.amount;
      else t.expenses += tx.amount;
      const c = tx.categoryId ?? '';
      t.byCategory[c] = round2((t.byCategory[c] ?? 0) + tx.amount);
    }
  }
  t.sales = round2(t.sales);
  t.otherIncome = round2(t.otherIncome);
  t.expenses = round2(t.expenses);
  t.income = round2(t.sales + t.otherIncome);
  t.net = round2(t.income - t.expenses);
  if (t.salesKg > 0) t.averagePrice = round2(t.sales / t.salesKg);
  return t;
}

/** Estimated tax on a positive net result. */
export const taxEstimate = (net: number, percent?: number) => (percent && net > 0 ? round2((net * percent) / 100) : 0);

/** € per kg of the most recent oil sale (to value the oil still in stock). */
export function lastSalePrice(transactions: Transaction[]): number | undefined {
  return live(transactions)
    .filter((tx) => tx.kind === 'sale' && tx.pricePerKg)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt))[0]?.pricePerKg;
}

/** The category last used with this business / buyer / source, so it can be filled in. */
export function categoryForParty(transactions: Transaction[], party: string, kind: TransactionKind): string | undefined {
  const key = party.trim().toLowerCase();
  if (!key) return undefined;
  return live(transactions)
    .filter((tx) => tx.kind === kind && tx.categoryId && tx.party.trim().toLowerCase() === key)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.categoryId;
}

/** Past names for a kind of transaction, most used first (for autocomplete). */
export function partyNames(transactions: Transaction[], kind: TransactionKind): string[] {
  const count = new Map<string, number>();
  for (const tx of live(transactions)) if (tx.kind === kind && tx.party.trim()) count.set(tx.party.trim(), (count.get(tx.party.trim()) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/**
 * Where a sale takes oil from by default: the oldest season that still has oil at the main
 * place (the mill), otherwise the oldest season with oil anywhere.
 */
export function defaultSaleSource(
  stock: Record<number, Record<string, number>>,
  mainLocationId?: string,
): { vintage: number; locationId: string } | undefined {
  const vintages = Object.keys(stock).map(Number).sort((a, b) => a - b);
  if (mainLocationId) {
    for (const v of vintages) if ((stock[v][mainLocationId] ?? 0) > 0) return { vintage: v, locationId: mainLocationId };
  }
  for (const v of vintages) {
    const loc = Object.entries(stock[v]).find(([, kg]) => kg > 0);
    if (loc) return { vintage: v, locationId: loc[0] };
  }
  return undefined;
}
