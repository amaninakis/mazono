import Dexie, { type EntityTable } from 'dexie';
import { presetPlural } from '../core/units';
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
    // v2: units get a plural name. Fill it in for units created from the presets.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
      tx
        .table<Unit>('units')
        .toCollection()
        .modify((u) => {
          if (!u.pluralName) {
            const plural = presetPlural(u.name);
            if (plural) u.pluralName = plural;
          }
        }),
    );
  }
}

export const db = new HarvestDB();
