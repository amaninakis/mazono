import Dexie, { type EntityTable } from 'dexie';
import type { Farm, FarmSettings, Field, TaskEntry, TaskType, Unit } from '../core/types';

interface Meta {
  key: string;
  value: string;
}

/** Local, offline-first database (IndexedDB). A sync server comes in a later version. */
export class HarvestDB extends Dexie {
  meta!: EntityTable<Meta, 'key'>;
  farms!: EntityTable<Farm, 'id'>;
  settings!: EntityTable<FarmSettings, 'farmId'>;
  fields!: EntityTable<Field, 'id'>;
  units!: EntityTable<Unit, 'id'>;
  taskTypes!: EntityTable<TaskType, 'id'>;
  entries!: EntityTable<TaskEntry, 'id'>;

  constructor(name = 'harvestlog') {
    super(name);
    this.version(1).stores({
      meta: 'key',
      farms: 'id',
      settings: 'farmId',
      fields: 'id, farmId',
      units: 'id, farmId',
      taskTypes: 'id, farmId',
      entries: 'id, farmId, [farmId+date], fieldId, taskTypeId',
    });
  }
}

export const db = new HarvestDB();
