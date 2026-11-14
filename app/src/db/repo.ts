import { BUILTIN_TASKS } from '../core/defaults';
import type {
  BaseRecord,
  FarmSettings,
  Field,
  Language,
  TaskEntry,
  TaskType,
  Unit,
} from '../core/types';
import { db as defaultDb, type HarvestDB } from './db';

export const uuid = () => crypto.randomUUID();
const now = () => Date.now();

type New<T extends BaseRecord> = Omit<T, 'id' | 'farmId' | 'updatedAt'> & { id?: string };

/** Data access for one farm. All writes stamp `updatedAt` for future sync. */
export class FarmRepo {
  constructor(
    public farmId: string,
    private db: HarvestDB = defaultDb,
  ) {}

  private stamp<T extends BaseRecord>(row: New<T>): T {
    return { ...row, id: row.id ?? uuid(), farmId: this.farmId, updatedAt: now() } as T;
  }

  settings() {
    return this.db.settings.get(this.farmId);
  }
  updateSettings(patch: Partial<FarmSettings>) {
    return this.db.settings.update(this.farmId, patch);
  }

  async addField(f: New<Field>) {
    const row = this.stamp<Field>(f);
    await this.db.fields.put(row);
    return row;
  }
  async addUnit(u: New<Unit>) {
    const row = this.stamp<Unit>(u);
    if (row.isDefault) await this.clearDefaultUnit();
    await this.db.units.put(row);
    return row;
  }
  async addTaskType(t: New<TaskType>) {
    const row = this.stamp<TaskType>(t);
    await this.db.taskTypes.put(row);
    return row;
  }
  async saveEntry(e: New<TaskEntry>) {
    const row = this.stamp<TaskEntry>(e);
    await this.db.entries.put(row);
    return row;
  }

  update<K extends 'fields' | 'units' | 'taskTypes' | 'entries'>(
    table: K,
    id: string,
    patch: Record<string, unknown>,
  ) {
    return (this.db[table] as unknown as { update: (id: string, p: object) => Promise<number> }).update(id, {
      ...patch,
      updatedAt: now(),
    });
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

  softDelete(table: 'fields' | 'units' | 'taskTypes' | 'entries', id: string) {
    return this.update(table, id, { deletedAt: now() });
  }
  restore(table: 'fields' | 'units' | 'taskTypes' | 'entries', id: string) {
    return this.update(table, id, { deletedAt: undefined });
  }

  async exportAll() {
    const by = <T>(t: { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } } }) =>
      t.where('farmId').equals(this.farmId).toArray();
    return {
      format: 'harvestlog-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      farm: await this.db.farms.get(this.farmId),
      settings: await this.settings(),
      fields: await by<Field>(this.db.fields),
      units: await by<Unit>(this.db.units),
      taskTypes: await by<TaskType>(this.db.taskTypes),
      entries: await by<TaskEntry>(this.db.entries),
    };
  }
}

/** Create a farm with settings and the four built-in task types. */
export async function createFarm(
  name: string,
  language: Language,
  database: HarvestDB = defaultDb,
): Promise<FarmRepo> {
  const farmId = uuid();
  await database.transaction(
    'rw',
    [database.farms, database.settings, database.taskTypes, database.meta],
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
      await database.meta.put({ key: 'currentFarmId', value: farmId });
    },
  );
  return new FarmRepo(farmId, database);
}

export async function currentFarmId(database: HarvestDB = defaultDb): Promise<string | undefined> {
  return (await database.meta.get('currentFarmId'))?.value;
}

/** Import a JSON export into a new farm, keeping record ids. */
export async function importFarm(data: unknown, database: HarvestDB = defaultDb): Promise<string> {
  const d = data as Awaited<ReturnType<FarmRepo['exportAll']>>;
  if (d?.format !== 'harvestlog-export' || !d.farm) throw new Error('Not a HarvestLog export file');
  const farmId = d.farm.id;
  await database.transaction(
    'rw',
    [database.farms, database.settings, database.fields, database.units, database.taskTypes, database.entries, database.meta],
    async () => {
      await database.farms.put(d.farm!);
      if (d.settings) await database.settings.put(d.settings);
      await database.fields.bulkPut(d.fields ?? []);
      await database.units.bulkPut(d.units ?? []);
      await database.taskTypes.bulkPut(d.taskTypes ?? []);
      await database.entries.bulkPut(d.entries ?? []);
      await database.meta.put({ key: 'currentFarmId', value: farmId });
    },
  );
  return farmId;
}
