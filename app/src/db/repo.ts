import type {
  BaseRecord,
  Category,
  ChargeType,
  Extraction,
  FarmSettings,
  Field,
  Language,
  Mill,
  StockMovement,
  StorageLocation,
  TaskEntry,
  TaskType,
  Transaction,
  Unit,
} from '../core/types'
import { BUILTIN_TASKS } from '../core/defaults'
import { uuid } from '../core/uuid'
import { db as defaultDb, type HarvestDB, moneyDefaults, oilDefaults } from './db'

export { uuid }
function now() {
  return Date.now()
}

export type New<T extends BaseRecord> = Omit<T, 'id' | 'farmId' | 'updatedAt'> & {
  id?: string
}

/** Tables holding farm records (each row has id, farmId, updatedAt, deletedAt?). */
export type FarmTable =
  | 'fields'
  | 'units'
  | 'taskTypes'
  | 'entries'
  | 'mills'
  | 'chargeTypes'
  | 'locations'
  | 'extractions'
  | 'stockMovements'
  | 'categories'
  | 'transactions'

const FARM_TABLES: FarmTable[] = [
  'fields',
  'units',
  'taskTypes',
  'entries',
  'mills',
  'chargeTypes',
  'locations',
  'extractions',
  'stockMovements',
  'categories',
  'transactions',
]

interface TableRow {
  fields: Field
  units: Unit
  taskTypes: TaskType
  entries: TaskEntry
  mills: Mill
  chargeTypes: ChargeType
  locations: StorageLocation
  extractions: Extraction
  stockMovements: StockMovement
  categories: Category
  transactions: Transaction
}

interface AnyTable {
  put: (row: object) => Promise<unknown>
  update: (id: string, changes: object) => Promise<number>
  where: (key: string) => { equals: (value: string) => { toArray: () => Promise<object[]> } }
}

/** Data access for one farm. All writes stamp `updatedAt` for future sync. */
export class FarmRepo {
  public constructor(
    public farmId: string,
    private readonly db: HarvestDB = defaultDb,
  ) {}

  /** Create or replace a record (keeps its id when given). */
  public async put<K extends FarmTable>(
    table: K,
    row: New<TableRow[K]>,
  ): Promise<TableRow[K]> {
    const stamped = { ...row, id: row.id ?? uuid(), farmId: this.farmId, updatedAt: now() }
    const full = stamped as TableRow[K]
    await this.table(table).put(full)

    return full
  }

  public async update(table: FarmTable, id: string, patch: Record<string, unknown>) {
    return await this.table(table).update(id, { ...patch, updatedAt: now() })
  }

  public async softDelete(table: FarmTable, id: string) {
    return await this.update(table, id, { deletedAt: now() })
  }

  public async restore(table: FarmTable, id: string) {
    return await this.update(table, id, { deletedAt: undefined })
  }

  public async settings() {
    return await this.db.settings.get(this.farmId)
  }

  public async updateSettings(patch: Partial<FarmSettings>) {
    return await this.db.settings.update(this.farmId, patch)
  }

  public async addField(field: New<Field>) {
    return await this.put('fields', field)
  }

  public async addUnit(unit: New<Unit>) {
    if (unit.isDefault) {
      await this.clearDefaultUnit()
    }

    return await this.put('units', unit)
  }

  public async addTaskType(taskType: New<TaskType>) {
    return await this.put('taskTypes', taskType)
  }

  public async saveEntry(entry: New<TaskEntry>) {
    return await this.put('entries', entry)
  }

  public async saveExtraction(extraction: New<Extraction>) {
    return await this.put('extractions', extraction)
  }

  public async setDefaultUnit(id: string) {
    await this.db.transaction('rw', this.db.units, async () => {
      await this.clearDefaultUnit()
      await this.db.units.update(id, { isDefault: true, updatedAt: now() })
    })
  }

  public async exportAll() {
    const tables: Record<string, object[]> = {}
    for (const tableName of FARM_TABLES) {
      tables[tableName] = await this.table(tableName)
        .where('farmId')
        .equals(this.farmId)
        .toArray()
    }

    return {
      format: 'harvestlog-export',
      version: 3,
      exportedAt: new Date().toISOString(),
      farm: await this.db.farms.get(this.farmId),
      settings: await this.settings(),
      ...tables,
    }
  }

  private table(name: FarmTable) {
    return this.db[name] as unknown as AnyTable
  }

  private async clearDefaultUnit() {
    const all = await this.db.units.where('farmId').equals(this.farmId).toArray()
    await Promise.all(
      all
        .filter((unit) => unit.isDefault)
        .map(
          async (unit) =>
            await this.db.units.update(unit.id, { isDefault: false, updatedAt: now() }),
        ),
    )
  }
}

/** Create a farm with settings, the built-in task types, charges and storage locations. */
export async function createFarm(
  name: string,
  language: Language,
  database: HarvestDB = defaultDb,
): Promise<FarmRepo> {
  const farmId = uuid()
  const oil = oilDefaults(farmId, uuid)
  await database.transaction(
    'rw',
    [
      database.farms,
      database.settings,
      database.taskTypes,
      database.chargeTypes,
      database.locations,
      database.categories,
      database.meta,
    ],
    async () => {
      await database.farms.put({ id: farmId, name, createdAt: now() })
      await database.settings.put({
        farmId,
        language,
        yieldFormat: 'ratio',
        seasonStartMonth: 10,
        labourEnabled: false,
        setupDone: false,
      })
      await database.taskTypes.bulkPut(
        BUILTIN_TASKS.map((builtinTask, i) => ({
          ...builtinTask,
          id: uuid(),
          farmId,
          name: builtinTask.builtin,
          archived: false,
          order: i,
          updatedAt: now(),
        })),
      )
      await database.chargeTypes.bulkPut(oil.chargeTypes)
      await database.locations.bulkPut(oil.locations)
      await database.categories.bulkPut(moneyDefaults(farmId, uuid))
      await database.meta.put({ key: 'currentFarmId', value: farmId })
    },
  )

  return new FarmRepo(farmId, database)
}

export async function currentFarmId(
  database: HarvestDB = defaultDb,
): Promise<string | undefined> {
  return (await database.meta.get('currentFarmId'))?.value
}

/** Import a JSON export into this device, keeping record ids, and switch to that farm. */
export async function importFarm(
  data: unknown,
  database: HarvestDB = defaultDb,
): Promise<string> {
  const backup = data as Awaited<ReturnType<FarmRepo['exportAll']>> &
    Partial<Record<FarmTable, object[]>>
  if (backup?.format !== 'harvestlog-export' || !backup.farm) {
    throw new Error('Not a HarvestLog export file')
  }
  const farmId = backup.farm.id
  const tables = FARM_TABLES.map((tableName) => database[tableName])
  await database.transaction(
    'rw',
    [database.farms, database.settings, database.meta, ...tables],
    async () => {
      await database.farms.put(backup.farm!)
      if (backup.settings) {
        await database.settings.put(backup.settings)
      }

      for (const tableName of FARM_TABLES) {
        const rows = backup[tableName]
        if (rows?.length) {
          await (
            database[tableName] as unknown as { bulkPut: (row: object[]) => Promise<unknown> }
          ).bulkPut(rows)
        }
      }
      // Backups from v0.1 have no charges or storage locations: add the defaults.
      if (!backup.chargeTypes?.length) {
        const oil = oilDefaults(farmId, uuid)
        await database.chargeTypes.bulkPut(oil.chargeTypes)
        await database.locations.bulkPut(oil.locations)
      }
      // Backups from before v0.3 have no categories: add the defaults.
      if (!backup.categories?.length) {
        await database.categories.bulkPut(moneyDefaults(farmId, uuid))
      }
      await database.meta.put({ key: 'currentFarmId', value: farmId })
    },
  )

  return farmId
}
