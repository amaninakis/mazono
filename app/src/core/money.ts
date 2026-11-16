import type { ISODate, Transaction, TransactionKind } from './types'
import { byNewest, seasonOf } from './dates'

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** A period for money totals: a harvest season, or a calendar year (for tax). */
export interface Period {
  kind: 'season' | 'year'
  year: number
}

export function inPeriod(date: ISODate, period: Period, seasonStartMonth = 3): boolean {
  return period.kind === 'year'
    ? Number(date.slice(0, 4)) === period.year
    : seasonOf(date, seasonStartMonth) === period.year
}

export interface MoneyTotals {
  /** Money received from oil sales (after fees). */
  sales: number
  /** Fees kept from oil sales. */
  salesFees: number
  salesKg: number
  otherIncome: number
  income: number
  expenses: number
  net: number
  /** € per category id (expenses and other income). */
  byCategory: Record<string, number>
  /** Average € per kg of the oil sold (price before fees). */
  averagePrice?: number
}

export function moneyTotals(
  transactions: Transaction[],
  period: Period,
  seasonStartMonth = 3,
): MoneyTotals {
  let salesGross = 0
  const totals: MoneyTotals = {
    sales: 0,
    salesFees: 0,
    salesKg: 0,
    otherIncome: 0,
    income: 0,
    expenses: 0,
    net: 0,
    byCategory: {},
  }

  for (const tx of live(transactions)) {
    if (!inPeriod(tx.date, period, seasonStartMonth)) {
      continue
    }
    if (tx.kind === 'sale') {
      totals.sales += tx.amount
      totals.salesFees += tx.fee ?? 0
      salesGross += tx.amount + (tx.fee ?? 0)
      totals.salesKg += tx.kg ?? 0
    } else {
      if (tx.kind === 'income') {
        totals.otherIncome += tx.amount
      } else {
        totals.expenses += tx.amount
      }
      const categoryId = tx.categoryId ?? ''
      totals.byCategory[categoryId] = round2((totals.byCategory[categoryId] ?? 0) + tx.amount)
    }
  }
  totals.sales = round2(totals.sales)
  totals.salesFees = round2(totals.salesFees)
  totals.otherIncome = round2(totals.otherIncome)
  totals.expenses = round2(totals.expenses)
  totals.income = round2(totals.sales + totals.otherIncome)
  totals.net = round2(totals.income - totals.expenses)
  if (totals.salesKg > 0) {
    totals.averagePrice = round2(salesGross / totals.salesKg)
  }

  return totals
}

/** Estimated tax on a positive net result. */
export function taxEstimate(net: number, percent?: number) {
  return percent && net > 0 ? round2((net * percent) / 100) : 0
}

/** € per kg of the most recent oil sale (to value the oil still in stock). */
export function lastSalePrice(transactions: Transaction[]): number | undefined {
  return live(transactions)
    .filter((tx) => tx.kind === 'sale' && tx.pricePerKg)
    .sort(byNewest)[0]?.pricePerKg
}

/** The category last used with this business / buyer / source, so it can be filled in. */
export function categoryForParty(
  transactions: Transaction[],
  party: string,
  kind: TransactionKind,
): string | undefined {
  const key = party.trim().toLowerCase()
  if (!key) {
    return undefined
  }

  return live(transactions)
    .filter((tx) => tx.kind === kind && tx.categoryId && tx.party.trim().toLowerCase() === key)
    .sort((left, right) => (left.date < right.date ? 1 : -1))[0]?.categoryId
}

/** Past names for a kind of transaction, most used first (for autocomplete). */
export function partyNames(transactions: Transaction[], kind: TransactionKind): string[] {
  const count = new Map<string, number>()
  for (const tx of live(transactions)) {
    if (tx.kind === kind && tx.party.trim()) {
      count.set(tx.party.trim(), (count.get(tx.party.trim()) ?? 0) + 1)
    }
  }

  return [...count.entries()].sort((left, right) => right[1] - left[1]).map(([value]) => value)
}

/**
 * Where a sale takes oil from by default: the oldest season that still has oil at the main
 * place (the mill), otherwise the oldest season with oil anywhere.
 */
export function defaultSaleSource(
  stock: Record<number, Record<string, number>>,
  mainLocationId?: string,
): { vintage: number; locationId: string } | undefined {
  const vintages = Object.keys(stock)
    .map(Number)
    .sort((left, right) => left - right)
  if (mainLocationId) {
    for (const vintage of vintages) {
      if ((stock[vintage][mainLocationId] ?? 0) > 0) {
        return { vintage, locationId: mainLocationId }
      }
    }
  }

  for (const vintage of vintages) {
    const loc = Object.entries(stock[vintage]).find(([, kg]) => kg > 0)
    if (loc) {
      return { vintage, locationId: loc[0] }
    }
  }

  return undefined
}

export interface SaleFee {
  /** Euros, or a percentage of kg × price. */
  value: number
  kind: 'percent' | 'euro'
}

/** kg × price, the fee in euros, and the money received. */
export function saleAmounts(kg: number, pricePerKg: number, fee?: SaleFee) {
  const gross = round2(kg * pricePerKg)
  let feeEur = 0
  if (fee?.value) {
    feeEur = fee.kind === 'percent' ? round2((gross * fee.value) / 100) : round2(fee.value)
  }

  return { gross, fee: feeEur, received: round2(gross - feeEur) }
}

/** The fee used in the last sale to this buyer, to fill in next time. */
export function feeForBuyer(transactions: Transaction[], party: string): SaleFee | undefined {
  const key = party.trim().toLowerCase()
  if (!key) {
    return undefined
  }
  const last = live(transactions)
    .filter((tx) => tx.kind === 'sale' && tx.party.trim().toLowerCase() === key)
    .sort((left, right) => (left.date < right.date ? 1 : -1))[0]
  if (!last?.fee) {
    return undefined
  }

  return last.feePercent != null
    ? { kind: 'percent', value: last.feePercent }
    : { kind: 'euro', value: last.fee }
}

/** Acidity of the most recent sale that recorded one, to suggest for the next sale. */
export function lastSaleAcidity(transactions: Transaction[]): number | undefined {
  return live(transactions)
    .filter((tx) => tx.kind === 'sale' && tx.acidity != null)
    .sort(byNewest)[0]?.acidity
}
