/**
 * The name the app gives everything it stores: the phone's database, saved settings, backup
 * files and the server's files.
 */
export const STORE_NAME = 'mazono'

/** What a backup file says it is. */
export const BACKUP_FORMAT = `${STORE_NAME}-export`

/** Whether a file is a Mazono backup. */
export function isBackupFormat(format: unknown) {
  return format === BACKUP_FORMAT
}
