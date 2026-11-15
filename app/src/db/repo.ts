import { BUILTIN_TASKS } from '../core/defaults';
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
} from '../core/types';
import { uuid } from '../core/uuid';
import { db as defaultDb, moneyDefaults, oilDefaults, type HarvestDB } from './db';

export { uuid };
const now = () => Date.now();

export type New<T extends BaseRecord> = Omit<T, 'id' | 'farmId' | 'updatedAt'> & { id?: string };

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
  | 'transactions';

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
];

interface TableRow {
  fields: Field;
  units: Unit;
  taskTypes: TaskType;
  entries: TaskEntry;
  mills: Mill;
  chargeTypes: ChargeType;
  locations: StorageLocation;
  extractions: Extraction;
  stockMovements: StockMovement;
  categories: Category;
  transactions: Transaction;
}

type AnyTable = {
  put: (row: object) => Promise<unknown>;
  update: (id: string, p: object) => Promise<number>;
  where: (k: string) => { equals: (v: string) => { toArray: () => Promise<object[]> } };
};

/** Data access for one farm. All writes stamp `updatedAt` for future sync. */
export class FarmRepo {
  constructor(
    public farmId: string,
    private db: HarvestDB = defaultDb,
  ) {}

  private table(name: FarmTable) {
    return this.db[name] as unknown as AnyTable;
  }

  /** Create or replace a record (keeps its id when given). */
  async put<K extends FarmTable>(table: K, row: New<TableRow[K]>): Promise<TableRow[K]> {
    const full = { ...row, id: row.id ?? uuid(), farmId: this.farmId, updatedAt: now() } as TableRow[K];
    await this.table(table).put(full);
    return full;
  }

  update(table: FarmTable, id: string, patch: Record<string, unknown>) {
    return this.table(table).update(id, { ...patch, updatedAt: now() });
  }

  softDelete(table: FarmTable, id: string) {
    return this.update(table, id, { deletedAt: now() });
  }
  restore(table: FarmTable, id: string) {
    return this.update(table, id, { deletedAt: undefined });
  }

  settings() {
    return this.db.settings.get(this.farmId);
  }
  updateSettings(patch: Partial<FarmSettings>) {
    return this.db.settings.update(this.farmId, patch);
  }

  addField(f: New<Field>) {
    return this.put('fields', f);
  }
  async addUnit(u: New<Unit>) {
    if (u.isDefault) await this.clearDefaultUnit();
    return this.put('units', u);
  }
  addTaskType(t: New<TaskType>) {
    return this.put('taskTypes', t);
  }
  saveEntry(e: New<TaskEntry>) {
    return this.put('entries', e);
  }
  saveExtraction(x: New<Extraction>) {
    return this.put('extractions', x);
  }

  async setDefaultUnit(id: string) {
    await this.db.transaction('rw', this.db.units, async () => {
      await this.clearDefaultUnit();
      await this.db.units.update(id, { isDefault: true, updatedAt: now() });
    });
  }
  private async clearDefaultUnit() {
    const all = await this.db.units.where('farmId').equals(this.farmId).toArray();
    await Promise.all(
      all.filter((u) => u.isDefault).map((u) => this.db.units.update(u.id, { isDefault: false, updatedAt: now() })),
    );
  }

  async exportAll() {
    const tables: Record<string, object[]> = {};
    for (const t of FARM_TABLES) tables[t] = await this.table(t).where('farmId').equals(this.farmId).toArray();
    return {
      format: 'harvestlog-export',
      version: 3,
      exportedAt: new Date().toISOString(),
      farm: await this.db.farms.get(this.farmId),
      settings: await this.settings(),
      ...tables,
    };
  }
}

/** Create a farm with settings, the built-in task types, charges and storage locations. */
export async function createFarm(name: string, language: Language, database: HarvestDB = defaultDb): Promise<FarmRepo> {
  const farmId = uuid();
  const oil = oilDefaults(farmId, uuid);
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
      await database.farms.put({ id: farmId, name, createdAt: now() });
      await database.settings.put({
        farmId,
        language,
        yieldFormat: 'ratio',
        seasonStartMonth: 10,
        labourEnabled: false,
        setupDone: false,
      });
      await database.taskTypes.bulkPut(
        BUILTIN_TASKS.map((t, i) => ({
          ...t,
          id: uuid(),
          farmId,
          name: t.builtin,
          archived: false,
          order: i,
          updatedAt: now(),
        })),
      );
      await database.chargeTypes.bulkPut(oil.chargeTypes);
      await database.locations.bulkPut(oil.locations);
      await database.categories.bulkPut(moneyDefaults(farmId, uuid));
      await database.meta.put({ key: 'currentFarmId', value: farmId });
    },
  );
  return new FarmRepo(farmId, database);
}

export async function currentFarmId(database: HarvestDB = defaultDb): Promise<string | undefined> {
  return (await database.meta.get('currentFarmId'))?.value;
}

/** Import a JSON export into this device, keeping record ids, and switch to that farm. */
export async function importFarm(data: unknown, database: HarvestDB = defaultDb): Promise<string> {
  const d = data as Awaited<ReturnType<FarmRepo['exportAll']>> & Partial<Record<FarmTable, object[]>>;
  if (d?.format !== 'harvestlog-export' || !d.farm) throw new Error('Not a HarvestLog export file');
  const farmId = d.farm.id;
  const tables = FARM_TABLES.map((t) => database[t]);
  await database.transaction('rw', [database.farms, database.settings, database.meta, ...tables], async () => {
    await database.farms.put(d.farm!);
    if (d.settings) await database.settings.put(d.settings);
    for (const t of FARM_TABLES) {
      const rows = d[t];
      if (rows?.length) await (database[t] as unknown as { bulkPut: (r: object[]) => Promise<unknown> }).bulkPut(rows);
    }
    // Backups from v0.1 have no charges or storage locations: add the defaults.
    if (!d.chargeTypes?.length) {
      const oil = oilDefaults(farmId, uuid);
      await database.chargeTypes.bulkPut(oil.chargeTypes);
      await database.locations.bulkPut(oil.locations);
    }
    // Backups from before v0.3 have no categories: add the defaults.
    if (!d.categories?.length) await database.categories.bulkPut(moneyDefaults(farmId, uuid));
    await database.meta.put({ key: 'currentFarmId', value: farmId });
  });
  return farmId;
}
