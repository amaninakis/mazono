import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { HarvestDB } from '../db/db'
import { presetPlural, unitLabel } from './units'

describe('unit names', () => {
  const sack = { name: 'Τσουβάλι', pluralName: 'Τσουβάλια' }
  it('uses the plural above one', () => {
    expect(unitLabel(sack, 8.5)).toBe('Τσουβάλια')
    expect(unitLabel(sack, 2)).toBe('Τσουβάλια')
    expect(unitLabel(sack, 1)).toBe('Τσουβάλι')
    expect(unitLabel(sack, 0.5)).toBe('Τσουβάλι')
  })

  it('falls back to the singular when there is no plural', () => {
    expect(unitLabel({ name: 'Κοφίνι' }, 3)).toBe('Κοφίνι')
  })

  it('knows the presets in both languages', () => {
    expect(presetPlural('Τσουβάλι')).toBe('Τσουβάλια')
    expect(presetPlural('μισό τσουβάλι')).toBe('Μισά τσουβάλια')
    expect(presetPlural('Pallet bin')).toBe('Pallet bins')
    expect(presetPlural('Κοφίνι')).toBeUndefined()
  })

  it('fills in plurals for units saved before plurals existed', async () => {
    const name = `upgrade-${Math.random()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({
      meta: 'key',
      farms: 'id',
      settings: 'farmId',
      fields: 'id, farmId',
      units: 'id, farmId',
      taskTypes: 'id, farmId',
      entries: 'id, farmId, [farmId+date], fieldId, taskTypeId',
    })
    await v1.table('units').bulkPut([
      {
        id: 'a',
        farmId: 'f',
        name: 'Τσουβάλι',
        isDefault: true,
        archived: false,
        updatedAt: 0,
      },
      {
        id: 'b',
        farmId: 'f',
        name: 'Κοφίνι',
        isDefault: false,
        archived: false,
        updatedAt: 0,
      },
    ])
    v1.close()
    const db = new HarvestDB(name)

    expect((await db.units.get('a'))!.pluralName).toBe('Τσουβάλια')
    expect((await db.units.get('b'))!.pluralName).toBeUndefined()
  })
})
