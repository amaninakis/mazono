import type { TFunction } from 'i18next';
import { inject, provide, type ComputedRef, type InjectionKey } from 'vue';
import type { FarmSettings, Field, TaskEntry, TaskType, Unit } from '../core/types';
import type { FarmRepo } from '../db/repo';

export interface FarmData {
  repo: FarmRepo;
  farmName: string;
  settings: FarmSettings;
  fields: Field[]; // includes archived, excludes deleted
  units: Unit[];
  taskTypes: TaskType[];
  entries: TaskEntry[];
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
