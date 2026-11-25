import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { HarvestDB } from '../db/db'
import el from '../i18n/locales/el.json'
import en from '../i18n/locales/en.json'
import { pluralOf, presetPlural, unitInUse, unitLabel, unitPlural } from './units'

describe('unit names', () => {
  const sack = { name: 'Τσουβάλι', pluralName: 'Τσουβάλια' }
  it('uses the plural above one', () => {
    expect(unitLabel(sack, 8.5)).toBe('Τσουβάλια')
    expect(unitLabel(sack, 2)).toBe('Τσουβάλια')
    expect(unitLabel(sack, 1)).toBe('Τσουβάλι')
    expect(unitLabel(sack, 0.5)).toBe('Τσουβάλι')
  })

  it('makes the plural from the name when none is saved', () => {
    expect(unitLabel({ name: 'Κοφίνι' }, 3)).toBe('Κοφίνια')
    expect(unitPlural({ name: 'Κάσα', pluralName: '' })).toBe('Κάσες')
    expect(unitPlural({ name: 'Κάσα', pluralName: 'Κασόνια' })).toBe('Κασόνια')
  })

  it('knows Greek endings', () => {
    const cases: Record<string, string> = {
      'Τσουβάλι': 'Τσουβάλια',
      'Σακί': 'Σακιά',
      'Τελάρο': 'Τελάρα',
      'Παλετοκιβώτιο': 'Παλετοκιβώτια',
      'Δοχείο': 'Δοχεία',
      'Δέμα': 'Δέματα',
      'Δίχτυ': 'Δίχτυα',
      'Κάδος': 'Κάδοι',
      'Κουβάς': 'Κουβάδες',
      'Τενεκές': 'Τενεκέδες',
      'Κάσα': 'Κάσες',
      'Σακούλα': 'Σακούλες',
      'Μισό τσουβάλι': 'Μισά τσουβάλια',
      'Κάσα με λαβές': 'Κάσες με λαβές',
      'Big bag': 'Big bags',
      'ΤΕΛΑΡΟ': 'ΤΕΛΑΡΑ',
      'Τσουβάλι 50 κιλών': 'Τσουβάλια 50 κιλών',
    }

    for (const [singular, plural] of Object.entries(cases)) {
      expect(pluralOf(singular)).toBe(plural)
    }
  })

  it('knows English endings', () => {
    expect(pluralOf('Sack')).toBe('Sacks')
    expect(pluralOf('Half sack')).toBe('Half sacks')
    expect(pluralOf('Box')).toBe('Boxes')
    expect(pluralOf('Batch')).toBe('Batches')
    expect(pluralOf('Lorry')).toBe('Lorries')
    expect(pluralOf('Tray')).toBe('Trays')
    expect(pluralOf('Bin 300')).toBe('Bin 300')
  })

  it('makes the same plurals as the presets', () => {
    for (const lang of [el, en]) {
      for (const [key, singular] of Object.entries(lang.unitPreset)) {
        expect(pluralOf(singular)).toBe((lang.unitPresetPlural as Record<string, string>)[key])
      }
    }
  })

  it('knows when a unit is used by work or a pressing', () => {
    const work = [{ quantities: [{ unitId: 'sack', amount: 2 }] }]
    const deletedWork = [{ quantities: [{ unitId: 'crate', amount: 2 }], deletedAt: 3 }]
    const pressing = [
      { allocations: [{ entryId: 'e', quantities: [{ unitId: 'bin', amount: 1 }] }] },
    ]

    expect(unitInUse('sack', work, [])).toBe(true)
    expect(unitInUse('bin', [], pressing)).toBe(true)
    expect(unitInUse('crate', deletedWork, [])).toBe(false)
    expect(unitInUse('bag', work, pressing)).toBe(false)
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
