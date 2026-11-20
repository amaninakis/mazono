/*
 * Where the app opens. Phones close apps in the background, and an installed app always
 * starts at its home address, so the first page is chosen from what makes sense right now:
 *
 * 1. a new production being entered (an unsaved draft) → back to that form;
 * 2. a new task being entered (an unsaved draft) → back to the task page;
 * 3. work already entered for today, or the harvest finished in every field → this year's
 *    report, to see how things stand;
 * 4. otherwise → the task page, to enter today's work.
 *
 * Pages the person may not use are skipped.
 */

import type { Field, ISODate, TaskEntry, TaskType } from './types'
import { fieldProgress } from './progress'

export type Landing = '/' | '/oil/new' | '/reports'

export interface LandingInput {
  today: ISODate
  entries: TaskEntry[]
  fields: Field[]
  taskTypes: TaskType[]
  seasonStartMonth?: number
  /** Unsaved drafts of a new production and of a new task. */
  drafts: { extraction: boolean; task: boolean }
  /** What this person may do. */
  may: { enterWork: boolean; enterOil: boolean; seeReports: boolean }
}

/** Whether every field in use has its harvest finished this farming year. */
export function harvestFinished(input: Omit<LandingInput, 'drafts' | 'may'>) {
  const harvest = input.taskTypes.find(
    (type) => type.inputKind === 'harvest' && !type.archived && !type.deletedAt,
  )
  if (!harvest) {
    return false
  }
  const progress = fieldProgress(
    input.fields,
    input.entries,
    harvest,
    input.today,
    input.seasonStartMonth,
    undefined,
    input.taskTypes,
  )

  return progress.length > 0 && progress.every((row) => row.finished)
}

export function landingPage(input: LandingInput): Landing {
  const { may } = input
  if (input.drafts.extraction && may.enterOil) {
    return '/oil/new'
  }
  if (input.drafts.task && may.enterWork) {
    return '/'
  }
  const workedToday = input.entries.some(
    (entry) => !entry.deletedAt && entry.date === input.today,
  )
  if (may.seeReports && (workedToday || harvestFinished(input))) {
    return '/reports'
  }

  return '/'
}
