import type { BuiltinTask, InputKind } from './types';

export interface BuiltinTaskDef {
  builtin: BuiltinTask;
  inputKind: InputKind;
  color: string;
  icon: string;
  activeMonths: number[];
}

/** Built-in task types. Colours are chosen to stay distinct for common colour-blindness. */
export const BUILTIN_TASKS: BuiltinTaskDef[] = [
  { builtin: 'harvest', inputKind: 'harvest', color: '#2f6b3a', icon: '🫒', activeMonths: [10, 11, 12, 1] },
  { builtin: 'pruning', inputKind: 'trees', color: '#b5651d', icon: '✂️', activeMonths: [1, 2, 3, 4] },
  { builtin: 'fertilizer', inputKind: 'quantity', color: '#3a6ea5', icon: '🧪', activeMonths: [2, 3, 10, 11] },
  { builtin: 'weeding', inputKind: 'done', color: '#8e5ea2', icon: '🌿', activeMonths: [3, 4, 5, 6, 9] },
];

/** Unit presets offered in setup; keys are translation keys. */
export const UNIT_PRESETS: { key: string; approxKg?: number }[] = [
  { key: 'sack' },
  { key: 'halfSack' },
  { key: 'crate' },
  { key: 'palletBin' },
  { key: 'bigBag' },
];

export const TASK_COLORS = ['#2f6b3a', '#b5651d', '#3a6ea5', '#8e5ea2', '#c23b4e', '#1d8a8a', '#7a6a1f', '#555555'];
export const TASK_ICONS = ['🫒', '✂️', '🧪', '🌿', '💧', '🚜', '🔥', '🐛', '🪓', '📋'];
export const AMOUNT_UNITS = ['kg', 'bags', 'L'];
