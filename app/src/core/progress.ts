import { seasonOf } from './dates';
import type { Field, ISODate, TaskEntry, TaskType, UnitAmount } from './types';

const live = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export interface FieldProgress {
  field: Field;
  done: number; // trees logged this season for the task
  remaining: number | null; // null when tree count unknown or task has no tree count
  finished: boolean;
  lastDate?: ISODate;
}

/**
 * Progress of every active field for one task type in the season containing `date`.
 * A field is finished when its trees are all logged, or when an entry marked it finished
 * (trees are not harvested every year, so the count may never reach zero).
 */
export function fieldProgress(
  fields: Field[],
  entries: TaskEntry[],
  taskType: TaskType,
  date: ISODate,
  seasonStartMonth = 10,
  excludeEntryId?: string,
): FieldProgress[] {
  const season = seasonOf(date, seasonStartMonth);
  const relevant = live(entries).filter(
    (e) =>
      e.taskTypeId === taskType.id &&
      e.id !== excludeEntryId &&
      seasonOf(e.date, seasonStartMonth) === season,
  );
  const countsTrees = taskType.inputKind !== 'done';

  return live(fields)
    .filter((f) => !f.archived)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((field) => {
      const mine = relevant.filter((e) => e.fieldId === field.id);
      const done = mine.reduce((s, e) => s + (e.trees ?? 0), 0);
      const remaining = countsTrees && field.trees > 0 ? Math.max(field.trees - done, 0) : null;
      const flagged = mine.some((e) => e.fieldFinished);
      const lastDate = mine.map((e) => e.date).sort().at(-1);
      return {
        field,
        done,
        remaining,
        finished: flagged || remaining === 0,
        lastDate,
      };
    });
}

/**
 * Field to preselect: the field most recently worked for this task (on or before `date`)
 * that is not finished; otherwise the first unfinished field; otherwise the first field.
 */
export function defaultFieldId(progress: FieldProgress[]): string | undefined {
  const open = progress.filter((p) => !p.finished);
  const recent = open
    .filter((p) => p.lastDate)
    .sort((a, b) => (b.lastDate! > a.lastDate! ? 1 : -1))[0];
  return (recent ?? open[0] ?? progress[0])?.field.id;
}

/** Order fields: unfinished first (most recent first), finished last. */
export function sortForPicker(progress: FieldProgress[]): FieldProgress[] {
  return [...progress].sort((a, b) => Number(a.finished) - Number(b.finished));
}

/**
 * Task type to preselect for a date: among types active in that month, the one logged most
 * recently; otherwise the first active one; otherwise the first type.
 */
export function defaultTaskTypeId(
  types: TaskType[],
  entries: TaskEntry[],
  date: ISODate,
): string | undefined {
  const usable = live(types)
    .filter((t) => !t.archived)
    .sort((a, b) => a.order - b.order);
  const month = Number(date.slice(5, 7));
  const active = usable.filter((t) => t.activeMonths.includes(month));
  const lastUse = new Map<string, string>();
  for (const e of live(entries)) {
    if (e.date > date) continue;
    const prev = lastUse.get(e.taskTypeId);
    if (!prev || e.date > prev) lastUse.set(e.taskTypeId, e.date);
  }
  const recentActive = active
    .filter((t) => lastUse.has(t.id))
    .sort((a, b) => (lastUse.get(b.id)! > lastUse.get(a.id)! ? 1 : -1))[0];
  return (recentActive ?? active[0] ?? usable[0])?.id;
}

/** Units per tree for each unit, e.g. { sackId: 1.5 }. */
export function perTree(quantities: UnitAmount[], trees: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!trees) return out;
  for (const q of quantities) out[q.unitId] = (out[q.unitId] ?? 0) + q.amount / trees;
  return out;
}

/** Season-to-date harvest totals for one field: trees and amount per unit. */
export function fieldSeasonHarvest(
  entries: TaskEntry[],
  fieldId: string,
  taskTypeId: string,
  date: ISODate,
  seasonStartMonth = 10,
): { trees: number; amounts: Record<string, number> } {
  const season = seasonOf(date, seasonStartMonth);
  const amounts: Record<string, number> = {};
  let trees = 0;
  for (const e of live(entries)) {
    if (e.fieldId !== fieldId || e.taskTypeId !== taskTypeId) continue;
    if (seasonOf(e.date, seasonStartMonth) !== season) continue;
    trees += e.trees ?? 0;
    for (const q of e.quantities ?? []) amounts[q.unitId] = (amounts[q.unitId] ?? 0) + q.amount;
  }
  return { trees, amounts };
}

export interface HarvestYields {
  /** Season output per unit, e.g. { sackId: 30 }. */
  amounts: Record<string, number>;
  treesHarvested: number;
  /** Output ÷ trees actually harvested. Null when no trees were entered. */
  treeYield: Record<string, number> | null;
  /** Output ÷ all trees in the field. Null when the field has no tree count. */
  fieldYield: Record<string, number> | null;
}

/**
 * Season yields for one field. Tree yield and field yield differ when not every tree in
 * the field was harvested. Entering trees is optional: without it, only field yield exists.
 */
export function harvestYields(
  entries: TaskEntry[],
  field: Field,
  taskTypeId: string,
  date: ISODate,
  seasonStartMonth = 10,
): HarvestYields {
  const { trees, amounts } = fieldSeasonHarvest(entries, field.id, taskTypeId, date, seasonStartMonth);
  const per = (n: number) =>
    Object.fromEntries(Object.entries(amounts).map(([u, a]) => [u, a / n]));
  return {
    amounts,
    treesHarvested: trees,
    treeYield: trees > 0 ? per(trees) : null,
    fieldYield: field.trees > 0 ? per(field.trees) : null,
  };
}

/** Parse a number typed with either comma or dot as decimal separator. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
