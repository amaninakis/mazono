import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, isBackupFormat, renamedSettingKey } from './names'

describe('names after the rename to Mazono', () => {
  it('writes backups as Mazono and reads both the new and the old format', () => {
    expect(BACKUP_FORMAT).toBe('mazono-export')
    expect(isBackupFormat('mazono-export')).toBe(true)
    expect(isBackupFormat('harvestlog-export')).toBe(true)
    expect(isBackupFormat('something-else')).toBe(false)
    expect(isBackupFormat(undefined)).toBe(false)
  })

  it('renames settings saved under the old name, and only those', () => {
    expect(renamedSettingKey('harvestlog.language')).toBe('mazono.language')
    expect(renamedSettingKey('harvestlog.draft:farm:today:new')).toBe(
      'mazono.draft:farm:today:new',
    )

    expect(renamedSettingKey('mazono.language')).toBeUndefined()
    expect(renamedSettingKey('account')).toBeUndefined()
    expect(renamedSettingKey('harvestlogger')).toBeUndefined()
  })
})
