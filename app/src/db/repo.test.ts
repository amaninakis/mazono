import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { HarvestDB } from './db'
import { createFarm, currentFarmId, importFarm, uuid } from './repo'

describe('farm repo', () => {
  it('creates a farm with built-in task types and keeps data per farm', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const item = await createFarm('Farm A', 'el', db)
    const other = await createFarm('Farm B', 'en', db)

    expect(await currentFarmId(db)).toBe(other.farmId)
    expect(await db.taskTypes.where('farmId').equals(item.farmId).count()).toBe(4)

    await item.addField({ name: 'Monastiri', trees: 17, archived: false, order: 0 })

    expect(await db.fields.where('farmId').equals(item.farmId).count()).toBe(1)
    expect(await db.fields.where('farmId').equals(other.farmId).count()).toBe(0)
  })

  it('keeps a single default unit', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'en', db)
    const sack = await row.addUnit({ name: 'Sack', isDefault: true, archived: false })
    const bin = await row.addUnit({ name: 'Bin', isDefault: true, archived: false })

    expect((await db.units.get(sack.id))!.isDefault).toBe(false)
    await row.setDefaultUnit(sack.id)

    expect((await db.units.get(sack.id))!.isDefault).toBe(true)
    expect((await db.units.get(bin.id))!.isDefault).toBe(false)
  })

  it('round-trips an export', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'en', db)
    const field = await row.addField({ name: 'Ryaki', trees: 10, archived: false, order: 0 })
    await row.saveEntry({
      date: '2025-11-18',
      fieldId: field.id,
      taskTypeId: 'x',
      trees: 10,
      fieldFinished: false,
    })
    const data: unknown = JSON.parse(JSON.stringify(await row.exportAll()))

    const db2 = new HarvestDB(`test-${Math.random()}`)
    const id = await importFarm(data, db2)

    expect(id).toBe(row.farmId)
    expect(await db2.entries.count()).toBe(1)
    await expect(importFarm({ nope: 1 }, db2)).rejects.toThrow()
  })

  it('writes Mazono backups and still reads backups from before the rename', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('Old grove', 'el', db)
    await row.addField({ name: 'Ρυάκι', trees: 14, archived: false, order: 0 })
    const backup = JSON.parse(JSON.stringify(await row.exportAll())) as Record<string, unknown>

    expect(backup.format).toBe('mazono-export')
    // Nothing the phone keeps for itself (fields starting with "_") goes into the file.
    expect(JSON.stringify(backup)).not.toMatch(/"_\w+":/)

    const db2 = new HarvestDB(`test-${Math.random()}`)

    expect(await importFarm({ ...backup, format: 'harvestlog-export' }, db2)).toBe(row.farmId)
    expect((await db2.fields.toArray()).map((field) => field.name)).toEqual(['Ρυάκι'])
    await expect(importFarm({ ...backup, format: 'other-app' }, db2)).rejects.toThrow()
  })
})

describe('uuid', () => {
  it('works where crypto.randomUUID is missing (plain http pages)', () => {
    const original = crypto.randomUUID.bind(crypto)
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })

    try {
      const ids = new Set(Array.from({ length: 200 }, () => uuid()))

      expect(ids.size).toBe(200)

      for (const id of ids) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
      }
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})

describe('v0.2 data', () => {
  it('new farms get default charges and storage locations', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'el', db)

    expect(
      (await db.chargeTypes.where('farmId').equals(row.farmId).toArray())
        .map((chargeType) => chargeType.builtin ?? '')
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['bugSpraying', 'millFee', 'vat'])

    expect(
      (await db.locations.where('farmId').equals(row.farmId).toArray())
        .map((location) => location.builtin ?? '')
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['home', 'mill'])
  })

  it('farms from before v0.2 get them when the database upgrades', async () => {
    const name = `upgrade3-${Math.random()}`
    const old = new Dexie(name)
    old.version(2).stores({
      meta: 'key',
      farms: 'id',
      settings: 'farmId',
      fields: 'id, farmId',
      units: 'id, farmId',
      taskTypes: 'id, farmId',
      entries: 'id, farmId, [farmId+date], fieldId, taskTypeId',
    })
    await old.table('farms').put({ id: 'farm1', name: 'Old', createdAt: 0 })
    old.close()
    const db = new HarvestDB(name)

    expect(await db.chargeTypes.where('farmId').equals('farm1').count()).toBe(3)
    expect(await db.locations.where('farmId').equals('farm1').count()).toBe(2)
  })

  it('exports and restores extractions and stock', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'en', db)
    await row.saveExtraction({
      date: '2025-11-25',
      oliveKg: 800,
      oilKg: 180,
      charges: [],
      storage: [],
      allocations: [],
    })
    const data: unknown = JSON.parse(JSON.stringify(await row.exportAll()))
    const db2 = new HarvestDB(`test-${Math.random()}`)
    await importFarm(data, db2)

    expect(await db2.extractions.count()).toBe(1)
    expect(await db2.chargeTypes.count()).toBe(3)
  })
})

describe('v0.3 data', () => {
  it('new farms get expense and income categories', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'el', db)
    const categories = await db.categories.where('farmId').equals(row.farmId).toArray()

    expect(categories.filter((category) => category.kind === 'expense')).toHaveLength(6)
    expect(
      categories
        .filter((category) => category.kind === 'income')
        .map((category) => category.builtin ?? '')
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['otherIncome', 'subsidy', 'vatRefund'])
  })

  it('farms from before v0.3 get them when the database upgrades', async () => {
    const name = `upgrade4-${Math.random()}`
    const old = new Dexie(name)
    old.version(3).stores({
      meta: 'key',
      farms: 'id',
      settings: 'farmId',
      fields: 'id, farmId',
      units: 'id, farmId',
      taskTypes: 'id, farmId',
      entries: 'id, farmId, [farmId+date], fieldId, taskTypeId',
      mills: 'id, farmId',
      chargeTypes: 'id, farmId',
      locations: 'id, farmId',
      extractions: 'id, farmId, [farmId+date]',
      stockMovements: 'id, farmId',
    })
    await old.table('farms').put({ id: 'farm1', name: 'Old', createdAt: 0 })
    old.close()
    const db = new HarvestDB(name)

    expect(await db.categories.where('farmId').equals('farm1').count()).toBe(9)
  })

  it('backups include transactions', async () => {
    const db = new HarvestDB(`test-${Math.random()}`)
    const row = await createFarm('F', 'en', db)
    await row.put('transactions', {
      date: '2025-12-01',
      kind: 'sale',
      party: 'Coop',
      amount: 850,
      kg: 100,
      pricePerKg: 8.5,
    })
    const db2 = new HarvestDB(`test-${Math.random()}`)
    await importFarm(JSON.parse(JSON.stringify(await row.exportAll())), db2)

    expect(await db2.transactions.count()).toBe(1)
    expect(await db2.categories.count()).toBe(9)
  })
})
