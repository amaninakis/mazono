import { describe, expect, it } from 'vitest'
import { backupName, backupsToRemove } from './backups.ts'

describe('daily backups', () => {
  it('names a day’s copy after Mazono', () => {
    expect(backupName(new Date('2026-11-24T10:00:00Z'))).toBe('mazono-2026-11-24.db')
  })

  it('removes the oldest days first', () => {
    const files = [
      'mazono-2026-11-20.db',
      'mazono-2026-11-24.db',
      'mazono-2026-11-22.db',
      'mazono-2026-11-23.db',
      'notes.txt',
    ]

    expect(backupsToRemove(files, 2)).toEqual(['mazono-2026-11-20.db', 'mazono-2026-11-22.db'])

    expect(backupsToRemove(files, 14)).toEqual([])
  })

  it('never touches other files', () => {
    expect(backupsToRemove(['mazono.db', 'readme.md', 'old-2026-11-20.db'], 0)).toEqual([])
  })
})
