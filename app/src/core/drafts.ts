import { STORE_NAME } from './names'
/**
 * Drafts: what someone typed into a form and has not saved yet, kept on the device so that a
 * phone call, a wrong tap or closing the app loses nothing.
 *
 * A draft holds only the values that differ from how the form started (its defaults), so
 * values the app fills in by itself (today's date, the trees left in a field) never get frozen
 * into a draft, and a form nobody touched has no draft at all.
 */

export type FormValues = Record<string, unknown>

export interface Draft {
  /** When it was last written (ms). */
  savedAt: number
  /** Only the changed values, by name. */
  changes: FormValues
}

/**
 * Drafts older than this are dropped: by then the work was saved some other way, or not
 * wanted.
 */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** The values in `current` that differ from `start`. Empty when nothing was changed. */
export function changedValues(start: FormValues, current: FormValues): FormValues {
  const changes: FormValues = {}
  for (const [name, value] of Object.entries(current)) {
    if (!same(value, start[name])) {
      changes[name] = value
    }
  }

  return changes
}

/** Where a form's draft is kept: per grove, per form and (when editing) per record. */
export function draftKey(farmId: string, form: string, recordId?: string) {
  return [`${STORE_NAME}.draft`, farmId, form, recordId ?? 'new'].join(':')
}

/** A stored draft if it can be read and is recent enough, else undefined. */
export function readDraft(text: string | null, now: number, maxAge = DRAFT_MAX_AGE_MS) {
  if (!text) {
    return undefined
  }

  try {
    const draft = JSON.parse(text) as Partial<Draft>
    const fresh =
      typeof draft.savedAt === 'number' &&
      now - draft.savedAt <= maxAge &&
      draft.changes != null &&
      typeof draft.changes === 'object' &&
      Object.keys(draft.changes).length > 0

    return fresh ? (draft as Draft) : undefined
  } catch {
    return undefined
  }
}
