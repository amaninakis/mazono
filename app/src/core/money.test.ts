import type { Extraction, Transaction } from './types'
import { describe, expect, it } from 'vitest'
import {
  categoryForParty,
  defaultSaleSource,
  feeForBuyer,
  inPeriod,
  lastSaleAcidity,
  lastSalePrice,
  moneyTotals,
  partyNames,
  saleAmounts,
  stockForValue,
  taxChoiceFor,
  taxEstimate,
} from './money'
import { isUntrackedSale, stockLevels, trackedVintages } from './oil'

const base = { farmId: 'f', updatedAt: 0 }
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    ...base,
    id: Math.random().toString(),
    date: '2025-11-20',
    kind: 'expense',
    party: '',
    amount: 0,

    ...overrides,
  }
}

describe('periods', () => {
  it('season vs calendar year', () => {
    expect(inPeriod('2026-01-10', { kind: 'season', year: 2025 })).toBe(true)
    expect(inPeriod('2026-01-10', { kind: 'year', year: 2025 })).toBe(false)
    expect(inPeriod('2025-02-28', { kind: 'season', year: 2025 })).toBe(false)
    expect(inPeriod('2025-09-30', { kind: 'season', year: 2025 }, 10)).toBe(false)
  })
})

describe('money totals', () => {
  const list = [
    tx({
      kind: 'sale',
      party: 'Agrocoop',
      kg: 100,
      pricePerKg: 8.5,
      amount: 850,
      date: '2025-12-01',
    }),
    tx({
      kind: 'sale',
      party: 'Neighbour',
      kg: 20,
      pricePerKg: 10,
      amount: 200,
      date: '2026-02-01',
    }),
    tx({
      kind: 'income',
      party: 'ΟΠΕΚΕΠΕ',
      categoryId: 'subsidy',
      amount: 400,
      date: '2026-06-30',
    }),
    tx({
      kind: 'expense',
      party: 'Fuel station',
      categoryId: 'fuel',
      amount: 60.5,
      date: '2025-11-02',
    }),
    tx({
      kind: 'expense',
      party: 'Fuel station',
      categoryId: 'fuel',
      amount: 40,
      date: '2025-11-20',
    }),
    tx({ kind: 'expense', party: 'Old', categoryId: 'fuel', amount: 999, date: '2025-09-01' }), // previous season
    tx({ kind: 'expense', party: 'Deleted', amount: 5, deletedAt: 1 }),
  ]
  it('by season', () => {
    const totals = moneyTotals(list, { kind: 'season', year: 2025 }, 10)

    expect(totals).toMatchObject({
      sales: 1050,
      salesKg: 120,
      otherIncome: 400,
      income: 1450,
      expenses: 100.5,
      net: 1349.5,
      averagePrice: 8.75,
    })

    expect(totals.byCategory).toEqual({ subsidy: 400, fuel: 100.5 })
  })

  it('by calendar year', () => {
    const totals = moneyTotals(list, { kind: 'year', year: 2025 })

    expect(totals).toMatchObject({ sales: 850, expenses: 1099.5, net: -249.5 })
  })

  it('tax estimate only on a profit', () => {
    expect(taxEstimate(1000, 22)).toBe(220)
    expect(taxEstimate(-50, 22)).toBe(0)
    expect(taxEstimate(1000, undefined)).toBe(0)
  })

  it('last sale price, remembered categories and names', () => {
    expect(lastSalePrice(list)).toBe(10)
    expect(categoryForParty(list, ' fuel station ', 'expense')).toBe('fuel')
    expect(categoryForParty(list, 'Unknown', 'expense')).toBeUndefined()
    expect(partyNames(list, 'expense')[0]).toBe('Fuel station')
  })
})

describe('sales and stock', () => {
  const x: Extraction = {
    ...base,
    id: 'x',
    date: '2025-11-25',
    oliveKg: 800,
    oilKg: 180,
    charges: [],

    allocations: [],
    storage: [
      { locationId: 'mill', kg: 150 },
      { locationId: 'home', kg: 30 },
    ],
  }
  it('a sale takes oil out of its season and place', () => {
    const stock = stockLevels([x], [], 10, [
      tx({ kind: 'sale', kg: 100, vintage: 2025, locationId: 'mill', amount: 850 }),
    ])

    expect(stock[2025]).toEqual({ mill: 50, home: 30 })
  })

  it('sells from the oldest oil at the mill by default', () => {
    expect(
      defaultSaleSource({ 2024: { mill: 0, home: 5 }, 2025: { mill: 50 } }, 'mill'),
    ).toEqual({ vintage: 2025, locationId: 'mill' })

    expect(defaultSaleSource({ 2024: { mill: 10 }, 2025: { mill: 50 } }, 'mill')).toEqual({
      vintage: 2024,
      locationId: 'mill',
    })

    expect(defaultSaleSource({ 2025: { home: 7 } }, 'mill')).toEqual({
      vintage: 2025,
      locationId: 'home',
    })

    expect(defaultSaleSource({}, 'mill')).toBeUndefined()
  })
})

describe('sales of oil not recorded in the app', () => {
  const x2025: Extraction = {
    ...base,
    id: 'x',
    date: '2025-11-25',
    oliveKg: 800,
    oilKg: 180,
    charges: [],

    allocations: [],
    storage: [{ locationId: 'mill', kg: 150 }],
  }
  const oldSale = tx({
    kind: 'sale',
    kg: 200,
    vintage: 2024,
    locationId: 'mill',
    amount: 1600,
    date: '2026-02-10',
  })

  it('does not reduce stock while that season has no extractions', () => {
    expect(isUntrackedSale(oldSale, trackedVintages([x2025]))).toBe(true)
    expect(stockLevels([x2025], [], 10, [oldSale])).toEqual({ 2025: { mill: 150 } })
  })

  it("is deducted once the season's extraction is entered later", () => {
    const x2024: Extraction = {
      ...x2025,
      id: 'y',
      date: '2024-12-01',
      storage: [{ locationId: 'mill', kg: 250 }],
    }

    expect(isUntrackedSale(oldSale, trackedVintages([x2025, x2024]))).toBe(false)
    expect(stockLevels([x2025, x2024], [], 10, [oldSale])[2024]).toEqual({ mill: 50 })
  })
})

describe('sale fees', () => {
  it('as a percentage or in euros', () => {
    expect(saleAmounts(100, 8.5, { kind: 'percent', value: 1 })).toEqual({
      gross: 850,
      fee: 8.5,
      received: 841.5,
    })

    expect(saleAmounts(100, 8.5, { kind: 'euro', value: 12 })).toEqual({
      gross: 850,
      fee: 12,
      received: 838,
    })

    expect(saleAmounts(100, 8.5)).toEqual({ gross: 850, fee: 0, received: 850 })
  })

  it('totals count the money received; the average price is before fees', () => {
    const totals = moneyTotals(
      [
        tx({
          kind: 'sale',
          kg: 100,
          pricePerKg: 8.5,
          amount: 841.5,
          fee: 8.5,
          feePercent: 1,
          date: '2026-01-10',
        }),
        tx({ kind: 'sale', kg: 100, pricePerKg: 9.5, amount: 950, date: '2026-02-10' }),
      ],
      { kind: 'year', year: 2026 },
    )

    expect(totals).toMatchObject({
      sales: 1791.5,
      salesFees: 8.5,
      salesKg: 200,
      averagePrice: 9,
    })
  })

  it('remembers the fee per buyer', () => {
    const list = [
      tx({ kind: 'sale', party: 'Mill coop', fee: 8.5, feePercent: 1, amount: 841.5 }),
    ]

    expect(feeForBuyer(list, 'mill coop')).toEqual({ kind: 'percent', value: 1 })
    expect(feeForBuyer(list, 'Other')).toBeUndefined()
  })
})

describe('lastSaleAcidity', () => {
  it('suggests the acidity of the latest sale that had one', () => {
    expect(
      lastSaleAcidity([
        tx({ kind: 'sale', date: '2026-01-10', acidity: 0.4 }),
        tx({ kind: 'sale', date: '2026-03-02', acidity: 0.3 }),
        tx({ kind: 'sale', date: '2026-05-20' }),
        tx({ kind: 'expense', date: '2026-06-01' }),
      ]),
    ).toBe(0.3)

    expect(lastSaleAcidity([tx({ kind: 'sale' })])).toBeUndefined()
  })
})

describe('stockForValue', () => {
  const stock = { 2024: { mill: 50, home: 20 }, 2025: { mill: 300, home: 40, village: 10 } }

  it('counts every place by default', () => {
    expect(stockForValue(stock)).toBe(420)
  })

  it('counts only the chosen places', () => {
    expect(stockForValue(stock, ['home'])).toBe(60)
    expect(stockForValue(stock, ['mill', 'village'])).toBe(360)
    expect(stockForValue(stock, [])).toBe(0)
  })
})

describe('tax estimate choice', () => {
  const year = { kind: 'year' as const, year: 2025 }

  it('leaves out what does not count from the taxable net only', () => {
    const totals = moneyTotals(
      [
        tx({ kind: 'sale', amount: 1000, kg: 200 }),
        tx({ kind: 'income', amount: 300, taxCounted: false }),
        tx({ kind: 'expense', amount: 200 }),
        tx({ kind: 'expense', amount: 50, taxCounted: false }),
        tx({ kind: 'expense', amount: 10, taxCounted: true }),
      ],
      year,
    )

    expect(totals.net).toBe(1040)
    expect(totals.taxableNet).toBe(790)
  })

  it('counts by default', () => {
    expect(taxChoiceFor([], 'expense', 'Agrocoop', 'fuel')).toBe(true)
    expect(taxChoiceFor([tx({ party: 'Agrocoop' })], 'expense', 'Agrocoop')).toBe(true)
  })

  it('remembers the choice for the same business, buyer or source', () => {
    const past = [
      tx({ party: 'Kalogridis', taxCounted: false, date: '2025-05-01' }),
      tx({ party: 'kalogridis ', taxCounted: true, date: '2025-03-01' }),
      tx({ kind: 'sale', party: 'Kalogridis', taxCounted: true }),
    ]

    expect(taxChoiceFor(past, 'expense', 'KALOGRIDIS')).toBe(false)
    expect(taxChoiceFor(past, 'sale', 'Kalogridis')).toBe(true)
  })

  it('otherwise remembers it for the same category', () => {
    const past = [tx({ party: 'Home shop', categoryId: 'fuel', taxCounted: false })]

    expect(taxChoiceFor(past, 'expense', 'Other shop', 'fuel')).toBe(false)
    expect(taxChoiceFor(past, 'expense', 'Other shop', 'tools')).toBe(true)
    // The business's own choice comes first.
    const both = [...past, tx({ party: 'Other shop', categoryId: 'tools', taxCounted: true })]

    expect(taxChoiceFor(both, 'expense', 'Other shop', 'fuel')).toBe(true)
  })

  it('ignores deleted entries', () => {
    const past = [tx({ party: 'A', taxCounted: false, deletedAt: 1 })]

    expect(taxChoiceFor(past, 'expense', 'A')).toBe(true)
  })
})
