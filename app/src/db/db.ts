import Dexie, { type EntityTable } from 'dexie';
import { BUILTIN_CHARGES, BUILTIN_LOCATIONS } from '../core/defaults';
import { presetPlural } from '../core/units';
import { uuid } from '../core/uuid';
import type {
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
  Unit,
} from '../core/types';

/** Default charge types and storage locations for a farm (names come from translations). */
export function oilDefaults(farmId: string, id: () => string) {
  const now = Date.now();
  return {
    chargeTypes: BUILTIN_CHARGES.map(
      (builtin, order): ChargeType => ({ id: id(), farmId, builtin, name: builtin, archived: false, order, updatedAt: now }),
    ),
    locations: BUILTIN_LOCATIONS.map(
      (builtin, order): StorageLocation => ({ id: id(), farmId, builtin, name: builtin, archived: false, order, updatedAt: now }),
    ),
  };
}

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
  mills!: EntityTable<Mill, 'id'>;
  chargeTypes!: EntityTable<ChargeType, 'id'>;
  locations!: EntityTable<StorageLocation, 'id'>;
  extractions!: EntityTable<Extraction, 'id'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;

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
        const farms = await tx.table<Farm>('farms').toArray();
        for (const f of farms) {
          const d = oilDefaults(f.id, uuid);
          await tx.table('chargeTypes').bulkPut(d.chargeTypes);
          await tx.table('locations').bulkPut(d.locations);
        }
      });
  }
}

export const db = new HarvestDB();
