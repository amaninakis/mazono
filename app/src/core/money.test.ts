import { describe, expect, it } from 'vitest';
import { categoryForParty, defaultSaleSource, inPeriod, lastSalePrice, moneyTotals, partyNames, taxEstimate } from './money';
import { isUntrackedSale, stockLevels, trackedVintages } from './oil';
import type { Extraction, Transaction } from './types';

const base = { farmId: 'f', updatedAt: 0 };
const tx = (p: Partial<Transaction>): Transaction => ({
  ...base, id: Math.random().toString(), date: '2025-11-20', kind: 'expense', party: '', amount: 0, ...p,
});

describe('periods', () => {
  it('season vs calendar year', () => {
    expect(inPeriod('2026-01-10', { kind: 'season', year: 2025 })).toBe(true);
    expect(inPeriod('2026-01-10', { kind: 'year', year: 2025 })).toBe(false);
    expect(inPeriod('2025-09-30', { kind: 'season', year: 2025 })).toBe(false);
  });
});

describe('money totals', () => {
  const list = [
    tx({ kind: 'sale', party: 'Agrocoop', kg: 100, pricePerKg: 8.5, amount: 850, date: '2025-12-01' }),
    tx({ kind: 'sale', party: 'Neighbour', kg: 20, pricePerKg: 10, amount: 200, date: '2026-02-01' }),
    tx({ kind: 'income', party: 'ΟΠΕΚΕΠΕ', categoryId: 'subsidy', amount: 400, date: '2026-06-30' }),
    tx({ kind: 'expense', party: 'Fuel station', categoryId: 'fuel', amount: 60.5, date: '2025-11-02' }),
    tx({ kind: 'expense', party: 'Fuel station', categoryId: 'fuel', amount: 40, date: '2025-11-20' }),
    tx({ kind: 'expense', party: 'Old', categoryId: 'fuel', amount: 999, date: '2025-09-01' }), // previous season
    tx({ kind: 'expense', party: 'Deleted', amount: 5, deletedAt: 1 }),
  ];
  it('by season', () => {
    const t = moneyTotals(list, { kind: 'season', year: 2025 });
    expect(t).toMatchObject({ sales: 1050, salesKg: 120, otherIncome: 400, income: 1450, expenses: 100.5, net: 1349.5, averagePrice: 8.75 });
    expect(t.byCategory).toEqual({ subsidy: 400, fuel: 100.5 });
  });
  it('by calendar year', () => {
    const t = moneyTotals(list, { kind: 'year', year: 2025 });
    expect(t).toMatchObject({ sales: 850, expenses: 1099.5, net: -249.5 });
  });
  it('tax estimate only on a profit', () => {
    expect(taxEstimate(1000, 22)).toBe(220);
    expect(taxEstimate(-50, 22)).toBe(0);
    expect(taxEstimate(1000, undefined)).toBe(0);
  });
  it('last sale price, remembered categories and names', () => {
    expect(lastSalePrice(list)).toBe(10);
    expect(categoryForParty(list, ' fuel station ', 'expense')).toBe('fuel');
    expect(categoryForParty(list, 'Unknown', 'expense')).toBeUndefined();
    expect(partyNames(list, 'expense')[0]).toBe('Fuel station');
  });
});

describe('sales and stock', () => {
  const x: Extraction = {
    ...base, id: 'x', date: '2025-11-25', oliveKg: 800, oilKg: 180, charges: [], allocations: [],
    storage: [{ locationId: 'mill', kg: 150 }, { locationId: 'home', kg: 30 }],
  };
  it('a sale takes oil out of its season and place', () => {
    const s = stockLevels([x], [], 10, [tx({ kind: 'sale', kg: 100, vintage: 2025, locationId: 'mill', amount: 850 })]);
    expect(s[2025]).toEqual({ mill: 50, home: 30 });
  });
  it('sells from the oldest oil at the mill by default', () => {
    expect(defaultSaleSource({ 2024: { mill: 0, home: 5 }, 2025: { mill: 50 } }, 'mill')).toEqual({ vintage: 2025, locationId: 'mill' });
    expect(defaultSaleSource({ 2024: { mill: 10 }, 2025: { mill: 50 } }, 'mill')).toEqual({ vintage: 2024, locationId: 'mill' });
    expect(defaultSaleSource({ 2025: { home: 7 } }, 'mill')).toEqual({ vintage: 2025, locationId: 'home' });
    expect(defaultSaleSource({}, 'mill')).toBeUndefined();
  });
});

describe('sales of oil not recorded in the app', () => {
  const x2025: Extraction = {
    ...base, id: 'x', date: '2025-11-25', oliveKg: 800, oilKg: 180, charges: [], allocations: [],
    storage: [{ locationId: 'mill', kg: 150 }],
  };
  const oldSale = tx({ kind: 'sale', kg: 200, vintage: 2024, locationId: 'mill', amount: 1600, date: '2026-02-10' });

  it('does not reduce stock while that season has no extractions', () => {
    expect(isUntrackedSale(oldSale, trackedVintages([x2025]))).toBe(true);
    expect(stockLevels([x2025], [], 10, [oldSale])).toEqual({ 2025: { mill: 150 } });
  });

  it('is deducted once the season\'s extraction is entered later', () => {
    const x2024: Extraction = { ...x2025, id: 'y', date: '2024-12-01', storage: [{ locationId: 'mill', kg: 250 }] };
    expect(isUntrackedSale(oldSale, trackedVintages([x2025, x2024]))).toBe(false);
    expect(stockLevels([x2025, x2024], [], 10, [oldSale])[2024]).toEqual({ mill: 50 });
  });
});
