import type { Field, ISODate, TaskEntry, TaskType, UnitAmount } from './types'
import { seasonOf } from './dates'

function live<T extends { deletedAt?: number }>(rows: T[]) {
  return rows.filter((row) => !row.deletedAt)
}

/**
 * Task types whose trees count together. Every task that records a harvest counts the same
 * trees (a tree harvested under "Harvest" is not left for "Harvest with nets"); other tasks
 * count on their own, since pruning and spraying are separate work on the same trees.
 */
export function countedTogether(taskType: TaskType, taskTypes: TaskType[]): string[] {
  if (taskType.inputKind !== 'harvest') {
    return [taskType.id]
  }
  const ids = live(taskTypes)
    .filter((x) => x.inputKind === 'harvest')
    .map((x) => x.id)

  return ids.includes(taskType.id) ? ids : [...ids, taskType.id]
}

/**
 * Trees a day of this work usually covers, for the trees box to start from. Trees of all
 * fields on the same day add up (a day is one day's work). This farming year's days count
 * when there are any; before the first one, all earlier years'. No days at all: 0.
 */
export function averageTreesPerDay(input: {
  entries: TaskEntry[]
  taskTypeIds: string[]
  date: ISODate
  seasonStartMonth?: number
  /** Leave out the entry being edited. */
  excludeId?: string
}): number {
  const startMonth = input.seasonStartMonth ?? 3
  const season = seasonOf(input.date, startMonth)
  const types = new Set(input.taskTypeIds)
  const thisYear = new Map<ISODate, number>()
  const allYears = new Map<ISODate, number>()
  for (const entry of live(input.entries)) {
    if (entry.id === input.excludeId || !types.has(entry.taskTypeId) || !(entry.trees! > 0)) {
      continue
    }
    allYears.set(entry.date, (allYears.get(entry.date) ?? 0) + entry.trees!)
    if (seasonOf(entry.date, startMonth) === season) {
      thisYear.set(entry.date, (thisYear.get(entry.date) ?? 0) + entry.trees!)
    }
  }
  const days = thisYear.size > 0 ? thisYear : allYears
  if (days.size === 0) {
    return 0
  }
  let total = 0
  for (const trees of days.values()) {
    total += trees
  }

  return Math.round(total / days.size)
}

export interface FieldProgress {
  field: Field
  done: number // trees logged this season for the task
  remaining: number | null // null when tree count unknown or task has no tree count
  finished: boolean
  lastDate?: ISODate
}

/**
 * Progress of every active field for one task type in the season containing `date`.
 * A field is finished when its trees are all logged, or when an entry marked it finished
 * (trees are not harvested every year, so the count may never reach zero).
 * Pass all `taskTypes` so harvest tasks share one count (see countedTogether).
 */
export function fieldProgress(
  fields: Field[],
  entries: TaskEntry[],
  taskType: TaskType,
  date: ISODate,
  seasonStartMonth = 3,
  excludeEntryId?: string,
  taskTypes: TaskType[] = [taskType],
): FieldProgress[] {
  const season = seasonOf(date, seasonStartMonth)
  const typeIds = new Set(countedTogether(taskType, taskTypes))
  const relevant = live(entries).filter(
    (entry) =>
      typeIds.has(entry.taskTypeId) &&
      entry.id !== excludeEntryId &&
      seasonOf(entry.date, seasonStartMonth) === season,
  )
  const countsTrees = taskType.inputKind !== 'done'

  return live(fields)
    .filter((field) => !field.archived)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .map((field) => {
      const mine = relevant.filter((entry) => entry.fieldId === field.id)
      const done = mine.reduce((sum, entry) => sum + (entry.trees ?? 0), 0)
      const remaining = countsTrees && field.trees > 0 ? Math.max(field.trees - done, 0) : null
      const flagged = mine.some((entry) => entry.fieldFinished)
      const lastDate = mine
        .map((entry) => entry.date)
        .sort()
        .at(-1)

      return {
        field,
        done,
        remaining,
        finished: flagged || remaining === 0,
        lastDate,
      }
    })
}

/**
 * Field to preselect: the field most recently worked for this task (on or before `date`)
 * that is not finished; otherwise the first unfinished field; otherwise the first field.
 */
export function defaultFieldId(progress: FieldProgress[]): string | undefined {
  const open = progress.filter((fieldProgress) => !fieldProgress.finished)
  const recent = open
    .filter((fieldProgress) => fieldProgress.lastDate)
    .sort((left, right) => (right.lastDate! > left.lastDate! ? 1 : -1))[0]

  return (recent ?? open[0] ?? progress[0])?.field.id
}

/** Order fields: unfinished first (most recent first), finished last. */
export function sortForPicker(progress: FieldProgress[]): FieldProgress[] {
  return [...progress].sort((left, right) => Number(left.finished) - Number(right.finished))
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
    .filter((taskType) => !taskType.archived)
    .sort((left, right) => left.order - right.order)
  const month = Number(date.slice(5, 7))
  const active = usable.filter((taskType) => taskType.activeMonths.includes(month))
  const lastUse = new Map<string, string>()
  for (const entry of live(entries)) {
    if (entry.date > date) {
      continue
    }
    const prev = lastUse.get(entry.taskTypeId)
    if (!prev || entry.date > prev) {
      lastUse.set(entry.taskTypeId, entry.date)
    }
  }
  const recentActive = active
    .filter((taskType) => lastUse.has(taskType.id))
    .sort((left, right) => (lastUse.get(right.id)! > lastUse.get(left.id)! ? 1 : -1))[0]

  return (recentActive ?? active[0] ?? usable[0])?.id
}

/** Units per tree for each unit, e.g. { sackId: 1.5 }. */
export function perTree(quantities: UnitAmount[], trees: number): Record<string, number> {
  const out: Record<string, number> = {}
  if (!trees) {
    return out
  }

  for (const quantity of quantities) {
    out[quantity.unitId] = (out[quantity.unitId] ?? 0) + quantity.amount / trees
  }

  return out
}

/**
 * Season-to-date harvest totals for one field: trees and amount per unit. `taskTypeIds` is
 * one task type id, or several that count together (see countedTogether).
 */
export function fieldSeasonHarvest(
  entries: TaskEntry[],
  fieldId: string,
  taskTypeIds: string | string[],
  date: ISODate,
  seasonStartMonth = 3,
): { trees: number; amounts: Record<string, number> } {
  const season = seasonOf(date, seasonStartMonth)
  const typeIds = new Set(typeof taskTypeIds === 'string' ? [taskTypeIds] : taskTypeIds)
  const amounts: Record<string, number> = {}
  let trees = 0
  for (const entry of live(entries)) {
    if (entry.fieldId !== fieldId || !typeIds.has(entry.taskTypeId)) {
      continue
    }
    if (seasonOf(entry.date, seasonStartMonth) !== season) {
      continue
    }
    trees += entry.trees ?? 0

    for (const quantity of entry.quantities ?? []) {
      amounts[quantity.unitId] = (amounts[quantity.unitId] ?? 0) + quantity.amount
    }
  }

  return { trees, amounts }
}

export interface HarvestYields {
  /** Season output per unit, e.g. { sackId: 30 }. */
  amounts: Record<string, number>
  treesHarvested: number
  /** Output ÷ trees actually harvested. Null when no trees were entered. */
  treeYield: Record<string, number> | null
  /** Output ÷ all trees in the field. Null when the field has no tree count. */
  fieldYield: Record<string, number> | null
}

/**
 * Season yields for one field. Tree yield and field yield differ when not every tree in
 * the field was harvested. Entering trees is optional: without it, only field yield exists.
 */
export function harvestYields(
  entries: TaskEntry[],
  field: Field,
  taskTypeIds: string | string[],
  date: ISODate,
  seasonStartMonth = 3,
): HarvestYields {
  const { trees, amounts } = fieldSeasonHarvest(
    entries,
    field.id,
    taskTypeIds,
    date,
    seasonStartMonth,
  )
  function per(trees: number) {
    return Object.fromEntries(
      Object.entries(amounts).map(([unitId, amount]) => [unitId, amount / trees]),
    )
  }

  return {
    amounts,
    treesHarvested: trees,
    treeYield: trees > 0 ? per(trees) : null,
    fieldYield: field.trees > 0 ? per(field.trees) : null,
  }
}

/** Parse a number typed with either comma or dot as decimal separator. */
export function parseDecimal(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') {
    return null
  }
  const value = Number(cleaned)

  return Number.isFinite(value) ? value : null
}
