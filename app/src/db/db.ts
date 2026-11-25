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
import Dexie, { type Transaction as DexieTransaction, type EntityTable } from 'dexie'
import { BUILTIN_CATEGORIES, BUILTIN_CHARGES, BUILTIN_LOCATIONS } from '../core/defaults'
import { STORE_NAME } from '../core/names'
import { SYNC_TABLES, type SyncTable } from '../core/syncFormat'
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

/*
 * Change tracking for sync. Every row written on this device gets `_dirty: 1` ("not yet
 * sent to the server"). Rows written by the sync itself, from the server, do not: those
 * writes run in transactions marked with markRemote().
 */
const remoteTransactions = new WeakSet<object>()
let localChangeListener: (() => void) | undefined

/** Called after every local change, e.g. to schedule a sync. */
export function onLocalChange(listener: (() => void) | undefined): void {
  localChangeListener = listener
}

/** Mark the current transaction as writing data from the server. */
export function markRemote(transaction: DexieTransaction | null): void {
  if (transaction) {
    remoteTransactions.add(transaction)
  }
}

function isRemote(transaction: DexieTransaction): boolean {
  let current: DexieTransaction | undefined = transaction
  while (current) {
    if (remoteTransactions.has(current)) {
      return true
    }
    current = (current as DexieTransaction & { parent?: DexieTransaction }).parent
  }

  return false
}

/** Rows of `farms` and `settings` carry no updatedAt from the app code: stamp it here. */
const STAMPED_HERE = new Set<SyncTable>(['farms', 'settings'])

function trackChanges(database: Dexie): void {
  for (const tableName of SYNC_TABLES) {
    const table = database.table(tableName)
    table.hook('creating', (_key, row: Record<string, unknown>, transaction) => {
      if (isRemote(transaction)) {
        return
      }
      row._dirty = 1
      if (STAMPED_HERE.has(tableName)) {
        row.updatedAt = Date.now()
      }
      queueMicrotask(() => localChangeListener?.())
    })
    table.hook('updating', (changes: object, _key, _row, transaction) => {
      const changed = Object.keys(changes)
      if (isRemote(transaction) || (changed.length === 1 && changed[0] === '_dirty')) {
        return undefined
      }
      queueMicrotask(() => localChangeListener?.())

      return STAMPED_HERE.has(tableName) ? { _dirty: 1, updatedAt: Date.now() } : { _dirty: 1 }
    })
  }
}

/**
 * Local, offline-first database (IndexedDB), kept in step with the server when there is one.
 */
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

  public constructor(name: string = STORE_NAME) {
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
    // v5: the farming year starts in March (spring work) instead of October, so that a
    // year holds all the work that leads to its harvest.
    this.version(5).upgrade(
      async (tx) =>
        await tx
          .table('settings')
          .toCollection()
          .modify((settings: { seasonStartMonth?: number }) => {
            if (settings.seasonStartMonth === 10) {
              settings.seasonStartMonth = 3
            }
          }),
    )
    trackChanges(this)
  }
}

/**
 * The grove data on this phone. `openLocalDatabase()` opens it once, before the app starts;
 * `localDb()` is the one opened.
 */
let chosen: HarvestDB | undefined

export async function openLocalDatabase() {
  chosen = new HarvestDB(STORE_NAME)
  return await Promise.resolve(chosen)
}

export function localDb() {
  chosen ??= new HarvestDB(STORE_NAME)
  return chosen
}
