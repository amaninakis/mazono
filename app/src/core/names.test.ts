import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, isBackupFormat } from './names'

describe('names', () => {
  it('knows a Mazono backup file', () => {
    expect(BACKUP_FORMAT).toBe('mazono-export')
    expect(isBackupFormat('mazono-export')).toBe(true)
    expect(isBackupFormat('something-else')).toBe(false)
    expect(isBackupFormat(undefined)).toBe(false)
  })
})
