import type { TFunction } from 'i18next';
import { inject, provide, type ComputedRef, type InjectionKey } from 'vue';
import type {
  ChargeType,
  Extraction,
  FarmSettings,
  Field,
  Mill,
  StockMovement,
  StorageLocation,
  TaskEntry,
  TaskType,
  Unit,
} from '../core/types';
import type { FarmRepo } from '../db/repo';

export interface FarmData {
  repo: FarmRepo;
  farmName: string;
  settings: FarmSettings;
  fields: Field[]; // includes archived, excludes deleted
  units: Unit[];
  taskTypes: TaskType[];
  entries: TaskEntry[];
  mills: Mill[];
  chargeTypes: ChargeType[];
  locations: StorageLocation[];
  extractions: Extraction[];
  stockMovements: StockMovement[];
}

const FarmKey: InjectionKey<ComputedRef<FarmData>> = Symbol('farm');

export function provideFarm(farm: ComputedRef<FarmData>) {
  provide(FarmKey, farm);
}

/** The current farm's data, kept live from the local database. */
export function useFarm(): ComputedRef<FarmData> {
  const farm = inject(FarmKey);
  if (!farm) throw new Error('useFarm used outside the farm shell');
  return farm;
}

export function taskName(t: TFunction, type: TaskType): string {
  return type.builtin && type.name === type.builtin ? t(`task.${type.builtin}`) : type.name;
}

export function chargeName(t: TFunction, c: ChargeType): string {
  return c.builtin && c.name === c.builtin ? t(`chargeType.${c.builtin}`) : c.name;
}

export function locationName(t: TFunction, l: StorageLocation): string {
  return l.builtin && l.name === l.builtin ? t(`location.${l.builtin}`) : l.name;
}
