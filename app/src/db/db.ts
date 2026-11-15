import type {
  Category,
  ChargeType,
  Extraction,
  Farm,
  FarmSettings,
  Field,
  Mill,
  StockMovement,
  StorageLocation,
  TaskEntry,
  TaskType,
  Transaction,
  Unit,
} from '../core/types'
import Dexie, { type EntityTable } from 'dexie'
import { BUILTIN_CATEGORIES, BUILTIN_CHARGES, BUILTIN_LOCATIONS } from '../core/defaults'
import { presetPlural } from '../core/units'
import { uuid } from '../core/uuid'

/** Default expense and income categories for a farm (names come from translations). */
export function moneyDefaults(farmId: string, id: () => string): Category[] {
  const now = Date.now()

  return (['expense', 'income'] as const).flatMap((kind) =>
    BUILTIN_CATEGORIES[kind].map((builtin, order): Category => ({
      id: id(),
      farmId,
      kind,
      builtin,
      name: builtin,
      archived: false,
      order,
      updatedAt: now,
    })),
  )
}

/** Default charge types and storage locations for a farm (names come from translations). */
export function oilDefaults(farmId: string, id: () => string) {
  const now = Date.now()

  return {
    chargeTypes: BUILTIN_CHARGES.map((builtin, order): ChargeType => ({
      id: id(),
      farmId,
      builtin,
      name: builtin,
      archived: false,
      order,
      updatedAt: now,
    })),
    locations: BUILTIN_LOCATIONS.map((builtin, order): StorageLocation => ({
      id: id(),
      farmId,
      builtin,
      name: builtin,
      archived: false,
      order,
      updatedAt: now,
    })),
  }
}

interface Meta {
  key: string
  value: string
}

/** Local, offline-first database (IndexedDB). A sync server comes in a later version. */
export class HarvestDB extends Dexie {
  public meta!: EntityTable<Meta, 'key'>
  public farms!: EntityTable<Farm, 'id'>
  public settings!: EntityTable<FarmSettings, 'farmId'>
  public fields!: EntityTable<Field, 'id'>
  public units!: EntityTable<Unit, 'id'>
  public taskTypes!: EntityTable<TaskType, 'id'>
  public entries!: EntityTable<TaskEntry, 'id'>
  public mills!: EntityTable<Mill, 'id'>
  public chargeTypes!: EntityTable<ChargeType, 'id'>
  public locations!: EntityTable<StorageLocation, 'id'>
  public extractions!: EntityTable<Extraction, 'id'>
  public stockMovements!: EntityTable<StockMovement, 'id'>
  public categories!: EntityTable<Category, 'id'>
  public transactions!: EntityTable<Transaction, 'id'>

  public constructor(name = 'harvestlog') {
    super(name)
    this.version(1).stores({
      meta: 'key',
      farms: 'id',
      settings: 'farmId',
      fields: 'id, farmId',
      units: 'id, farmId',
      taskTypes: 'id, farmId',
      entries: 'id, farmId, [farmId+date], fieldId, taskTypeId',
    })
    // v2: units get a plural name. Fill it in for units created from the presets.
    this.version(2)
      .stores({})
      .upgrade(
        async (tx) =>
          await tx
            .table<Unit>('units')
            .toCollection()
            .modify((unit) => {
              if (!unit.pluralName) {
                const plural = presetPlural(unit.name)
                if (plural) {
                  unit.pluralName = plural
                }
              }
            }),
      )
    // v3: mill, oil and stock. Existing farms get the default charges and locations.
    this.version(3)
      .stores({
        mills: 'id, farmId',
        chargeTypes: 'id, farmId',
        locations: 'id, farmId',
        extractions: 'id, farmId, [farmId+date]',
        stockMovements: 'id, farmId',
      })
      .upgrade(async (tx) => {
        const farms = await tx.table<Farm>('farms').toArray()
        for (const farm of farms) {
          const defaults = oilDefaults(farm.id, uuid)
          await tx.table('chargeTypes').bulkPut(defaults.chargeTypes)
          await tx.table('locations').bulkPut(defaults.locations)
        }
      })
    // v4: money. Existing farms get the default expense and income categories.
    this.version(4)
      .stores({
        categories: 'id, farmId',
        transactions: 'id, farmId, [farmId+date]',
      })
      .upgrade(async (tx) => {
        const farms = await tx.table<Farm>('farms').toArray()
        for (const farm of farms) {
          await tx.table('categories').bulkPut(moneyDefaults(farm.id, uuid))
        }
      })
  }
}

export const db = new HarvestDB()
