import { describe, expect, it } from 'vitest';
import {
  allocationShares,
  availableUnits,
  batchTrees,
  chargeFromPercent,
  chargeShare,
  netOil,
  oilByEntry,
  previousExtractionDate,
  seasonTotals,
  stockLevels,
  unitWeights,
} from './oil';
import type { Extraction, StockMovement, TaskEntry, Unit } from './types';

const base = { farmId: 'f', updatedAt: 0 };
const sack: Unit = { ...base, id: 's', name: 'Sack', isDefault: true, archived: false };
const bin: Unit = { ...base, id: 'b', name: 'Bin', isDefault: false, archived: false, approxKg: 300 };
const entry = (id: string, trees: number, qs: [string, number][]): TaskEntry => ({
  ...base, id, date: '2025-11-20', fieldId: 'A', taskTypeId: 'h', trees, fieldFinished: false,
  quantities: qs.map(([unitId, amount]) => ({ unitId, amount })),
});
const extraction = (p: Partial<Extraction>): Extraction => ({
  ...base, id: Math.random().toString(), date: '2025-11-25', oliveKg: 0, oilKg: 0,
  charges: [], storage: [], allocations: [], ...p,
});

describe('charges', () => {
  it('net oil and shares', () => {
    const x = extraction({ oilKg: 181, charges: [{ chargeTypeId: 'fee', kg: 25.3 }, { chargeTypeId: 'vat', kg: 3.4 }] });
    expect(netOil(x)).toBeCloseTo(152.3);
    expect(chargeShare(25.3, 181)).toBeCloseTo(0.1398, 3);
    expect(chargeFromPercent(14, 181)).toBe(25.3);
  });
});

describe('allocation', () => {
  const e1 = entry('e1', 14, [['s', 7]]);
  it('splits an entry across extractions', () => {
    const first = extraction({ allocations: [{ entryId: 'e1', quantities: [{ unitId: 's', amount: 4 }] }] });
    expect(availableUnits(e1, [first])).toEqual([{ unitId: 's', amount: 3 }]);
    expect(availableUnits(e1, [first], first.id)).toEqual([{ unitId: 's', amount: 7 }]);
    expect(availableUnits(e1, [{ ...first, deletedAt: 1 }])).toEqual([{ unitId: 's', amount: 7 }]);
  });
  it('one unit type: plain split by units', () => {
    const shares = allocationShares(
      [
        { entryId: 'a', quantities: [{ unitId: 's', amount: 6 }] },
        { entryId: 'b', quantities: [{ unitId: 's', amount: 2 }] },
      ],
      {},
    );
    expect(shares).toEqual([0.75, 0.25]);
  });
  it('mixed units: by weight', () => {
    const shares = allocationShares(
      [
        { entryId: 'a', quantities: [{ unitId: 'b', amount: 1 }] }, // 300 kg
        { entryId: 'b', quantities: [{ unitId: 's', amount: 2 }] }, // 2 × 50 kg
      ],
      { b: { kg: 300, source: 'user', batches: 0 }, s: { kg: 50, source: 'learned', batches: 1 } },
    );
    expect(shares[0]).toBeCloseTo(0.75);
  });
  it('oil per entry and trees in the batch', () => {
    const x = extraction({
      oilKg: 100,
      charges: [{ chargeTypeId: 'fee', kg: 20 }],
      allocations: [
        { entryId: 'e1', quantities: [{ unitId: 's', amount: 4 }] },
        { entryId: 'e2', quantities: [{ unitId: 's', amount: 4 }] },
      ],
    });
    expect(oilByEntry(x, {})).toEqual({ e1: { oil: 50, net: 40 }, e2: { oil: 50, net: 40 } });
    expect(batchTrees(x, [e1, entry('e2', 10, [['s', 4]])])).toBeCloseTo(14 * (4 / 7) + 10);
  });
  it('previous extraction date', () => {
    const xs = [extraction({ date: '2025-11-10' }), extraction({ date: '2025-11-20' }), extraction({ date: '2025-12-01' })];
    expect(previousExtractionDate(xs, '2025-11-25')).toBe('2025-11-20');
    expect(previousExtractionDate(xs, '2025-11-01')).toBeUndefined();
  });
});

describe('unit weights', () => {
  it('learns from single-unit batches and falls back to the user estimate', () => {
    const xs = [
      extraction({ oliveKg: 400, allocations: [{ entryId: 'a', quantities: [{ unitId: 's', amount: 8 }] }] }),
      extraction({ oliveKg: 600, allocations: [{ entryId: 'b', quantities: [{ unitId: 's', amount: 12 }] }] }),
      // mixed batch: not used for learning
      extraction({ oliveKg: 999, allocations: [{ entryId: 'c', quantities: [{ unitId: 's', amount: 1 }, { unitId: 'b', amount: 1 }] }] }),
    ];
    const w = unitWeights([sack, bin], xs);
    expect(w.s).toEqual({ kg: 50, source: 'learned', batches: 2 });
    expect(w.b).toEqual({ kg: 300, source: 'user', batches: 0 });
  });
});

describe('stock', () => {
  it('per vintage and location, with transfers and own use', () => {
    const xs = [
      extraction({ date: '2025-11-25', storage: [{ locationId: 'mill', kg: 150 }, { locationId: 'home', kg: 20 }] }),
      extraction({ date: '2024-12-10', storage: [{ locationId: 'mill', kg: 80 }] }),
    ];
    const mv = (p: Partial<StockMovement>): StockMovement => ({
      ...base, id: Math.random().toString(), date: '2026-01-10', vintage: 2025, kind: 'transfer', fromLocationId: 'mill', kg: 0, ...p,
    });
    const s = stockLevels(xs, [
      mv({ kind: 'transfer', toLocationId: 'home', kg: 30 }),
      mv({ kind: 'ownUse', fromLocationId: 'home', kg: 5 }),
      mv({ vintage: 2024, kind: 'ownUse', kg: 10 }),
    ]);
    expect(s[2025]).toEqual({ mill: 120, home: 45 });
    expect(s[2024]).toEqual({ mill: 70 });
  });
  it('season totals', () => {
    const xs = [
      extraction({ date: '2025-11-25', oliveKg: 792, oilKg: 181, charges: [{ chargeTypeId: 'fee', kg: 25 }], storage: [{ locationId: 'mill', kg: 156 }] }),
      extraction({ date: '2026-01-05', oliveKg: 1000, oilKg: 230, charges: [{ chargeTypeId: 'fee', kg: 30 }], storage: [{ locationId: 'mill', kg: 200 }] }),
      extraction({ date: '2025-01-05', oliveKg: 1, oilKg: 1 }), // previous season
    ];
    expect(seasonTotals(xs, 2025)).toMatchObject({ count: 2, oliveKg: 1792, oilKg: 411, chargesKg: 55, netKg: 356, storedKg: 356, byCharge: { fee: 55 } });
  });
});
