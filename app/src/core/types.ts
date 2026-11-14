/**
 * Domain types shared by the UI, the local database and (later) the sync server.
 * Every record carries `farmId` so one installation can host many farms.
 * Quantities are stored in base units; formatting happens only in the UI.
 */

export type ISODate = string; // 'YYYY-MM-DD'

export interface BaseRecord {
  id: string; // UUID, created on the device so records can be made offline
  farmId: string;
  updatedAt: number; // ms epoch, used by sync later
  deletedAt?: number; // soft delete, so deletions can sync
}

export interface Farm {
  id: string;
  name: string;
  createdAt: number;
}

export type YieldFormat = 'ratio' | 'percent';
export type Language = 'en' | 'el';

export interface FarmSettings {
  farmId: string;
  language: Language;
  yieldFormat: YieldFormat;
  seasonStartMonth: number; // 1-12, default 10 (October)
  labourEnabled: boolean;
  setupDone: boolean;
}

export interface Field extends BaseRecord {
  name: string;
  trees: number; // 0 = unknown
  notes?: string;
  archived: boolean;
  order: number;
}

export interface Unit extends BaseRecord {
  name: string;
  /** Optional user estimate in kg. The app will refine it from extractions (v0.2). */
  approxKg?: number;
  isDefault: boolean;
  archived: boolean;
}

/** How a task type collects its data. */
export type InputKind = 'harvest' | 'trees' | 'quantity' | 'done';

export type BuiltinTask = 'harvest' | 'pruning' | 'fertilizer' | 'weeding';

export interface TaskType extends BaseRecord {
  /** Set for the four built-in types; their name comes from translations. */
  builtin?: BuiltinTask;
  name: string; // used for custom types (and as fallback)
  color: string;
  icon: string;
  inputKind: InputKind;
  activeMonths: number[]; // 1-12
  archived: boolean;
  order: number;
}

export interface UnitAmount {
  unitId: string;
  amount: number;
}

export interface TaskEntry extends BaseRecord {
  date: ISODate;
  fieldId: string;
  taskTypeId: string;
  trees?: number; // harvest, pruning, quantity kinds
  quantities?: UnitAmount[]; // harvest kind
  product?: string; // quantity kind
  amount?: number; // quantity kind
  amountUnit?: string; // quantity kind: kg, bags, L
  fieldFinished: boolean;
  workers?: number; // labour module
  hours?: number; // labour module
  notes?: string;
}
