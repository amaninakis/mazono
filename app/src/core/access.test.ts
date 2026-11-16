import { describe, expect, it } from 'vitest'
import {
  accessSignature,
  can,
  cleanPermissions,
  presetOf,
  PRESETS,
  readableTables,
  writableTables,
} from './access'

const admin = { role: 'admin' as const, permissions: PRESETS.worker }
const worker = { role: 'user' as const, permissions: PRESETS.worker }
const family = { role: 'user' as const, permissions: PRESETS.family }
const accountant = { role: 'user' as const, permissions: PRESETS.accountant }

describe('access', () => {
  it('lets administrators do everything', () => {
    expect(can(admin, 'money', 'change')).toBe(true)
    expect(writableTables(admin).has('transactions')).toBe(true)
    expect(readableTables(admin).has('categories')).toBe(true)
  })

  it('keeps money away from a worker', () => {
    expect(can(worker, 'work', 'change')).toBe(true)
    expect(can(worker, 'money')).toBe(false)
    expect([...readableTables(worker)].sort()).toEqual(
      ['entries', 'farms', 'fields', 'settings', 'taskTypes', 'units'].sort(),
    )

    expect([...writableTables(worker)]).toEqual(['entries'])
  })

  it('lets an accountant see money, oil and reports but change nothing', () => {
    expect(readableTables(accountant).has('transactions')).toBe(true)
    expect(readableTables(accountant).has('extractions')).toBe(true)
    expect(writableTables(accountant).size).toBe(0)
  })

  it('lets family log work and oil, and only see money', () => {
    expect(writableTables(family).has('extractions')).toBe(true)
    expect(writableTables(family).has('transactions')).toBe(false)
    expect(readableTables(family).has('transactions')).toBe(true)
  })

  it('recognises presets and cleans stored permissions', () => {
    expect(presetOf(PRESETS.accountant)).toBe('accountant')
    expect(presetOf({ ...PRESETS.worker, oil: 'see' })).toBeUndefined()
    expect(cleanPermissions({ work: 'change', reports: 'change', money: 'hack' })).toEqual({
      work: 'change',
      oil: 'none',
      money: 'none',
      reports: 'see',
      settings: 'none',
    })
  })

  it('changes the signature only when what can be seen changes', () => {
    expect(accessSignature(worker)).not.toBe(accessSignature(accountant))
    expect(accessSignature(worker)).toBe(
      accessSignature({ role: 'user', permissions: { ...PRESETS.worker, settings: 'see' } }),
    )
  })
})
