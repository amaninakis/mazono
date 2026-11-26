import type { TFunction } from 'i18next'
import type { TaskEntry, Unit } from '../core/types'
import { formatNumber } from '../core/format'
import { unitLabel } from '../core/units'

/**
 * One line about a task entry, as the journal and the home page show it:
 * "14 δέντρα · 9 σακιά · Ο αγρός τελείωσε".
 */
export function entryDetails(
  entry: TaskEntry,
  units: Unit[],
  translate: TFunction,
  locale: string,
): string {
  const parts: string[] = []
  if (entry.trees) {
    parts.push(translate('journal.trees', { count: entry.trees }))
  }

  for (const quantity of entry.quantities ?? []) {
    const unit = units.find((x) => x.id === quantity.unitId)
    parts.push(`${formatNumber(quantity.amount, locale)} ${unitLabel(unit, quantity.amount)}`)
  }
  if (entry.amount) {
    parts.push(
      `${entry.product ? `${entry.product} · ` : ''}${formatNumber(entry.amount, locale)} ${entry.amountUnit ?? ''}`,
    )
  }
  if (entry.workers) {
    parts.push(`${entry.workers} × ${formatNumber(entry.hours ?? 0, locale)} h`)
  }
  if (entry.fieldFinished) {
    parts.push(translate('journal.fieldFinished'))
  }

  return parts.join(' · ')
}
