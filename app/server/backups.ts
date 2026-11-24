/** Daily copies kept before the oldest is removed. */
export const BACKUPS_KEPT = 14

/** Today's backup file name, e.g. mazono-2026-11-24.db. */
export function backupName(day: Date) {
  return `mazono-${day.toISOString().slice(0, 10)}.db`
}

/**
 * Which backup files to remove so only the newest `kept` days stay. Copies from before the
 * rename (harvestlog-….db) count too, by their date, so they go in turn as they get old.
 * Other files in the folder are never touched.
 */
export function backupsToRemove(files: string[], kept = BACKUPS_KEPT) {
  const backups = files.filter((file) =>
    /^(?:mazono|harvestlog)-\d{4}-\d{2}-\d{2}\.db$/.test(file),
  )
  const byDay = backups.sort(
    (first, second) =>
      dayOf(first).localeCompare(dayOf(second)) || first.localeCompare(second),
  )

  return byDay.slice(0, Math.max(byDay.length - kept, 0))
}

function dayOf(file: string) {
  return file.slice(file.indexOf('-') + 1)
}
