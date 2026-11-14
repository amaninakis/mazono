import { createContext, useContext, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
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

const Ctx = createContext<FarmData | null>(null);

export function FarmProvider({ value, children }: { value: FarmData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFarm(): FarmData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFarm outside FarmProvider');
  return v;
}

export function taskName(t: TFunction, type: TaskType): string {
  return type.builtin && type.name === type.builtin ? t(`task.${type.builtin}`) : type.name;
}
