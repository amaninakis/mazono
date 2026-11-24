/**
 * The name the app gives everything it stores: the phone's database, saved settings, backup
 * files and the server's files. The app was first called HarvestLog; installs from that time
 * keep their old names where they already exist, so nothing has to be moved, and new installs
 * only ever see Mazono.
 */
export const STORE_NAME = 'mazono'
export const OLD_STORE_NAME = 'harvestlog'

/** What a backup file says it is. Files made before the rename say the old name. */
export const BACKUP_FORMAT = `${STORE_NAME}-export`
const BACKUP_FORMATS = new Set([BACKUP_FORMAT, `${OLD_STORE_NAME}-export`])

/** Whether a file is a Mazono backup, from before or after the rename. */
export function isBackupFormat(format: unknown) {
  return typeof format === 'string' && BACKUP_FORMATS.has(format)
}

/**
 * The new name for a setting saved on the phone under the old one ("harvestlog.language" →
 * "mazono.language"), or undefined when the setting is not one of ours from before.
 */
export function renamedSettingKey(key: string) {
  const prefix = `${OLD_STORE_NAME}.`
  return key.startsWith(prefix) ? `${STORE_NAME}.${key.slice(prefix.length)}` : undefined
}
