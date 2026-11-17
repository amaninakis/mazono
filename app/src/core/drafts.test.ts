import { describe, expect, it } from 'vitest'
import { changedValues, DRAFT_MAX_AGE_MS, draftKey, readDraft } from './drafts'

describe('drafts', () => {
  it('keeps only what was changed from how the form started', () => {
    const start = { date: '2026-11-17', trees: 7, quantities: [{ unitId: 'u', amount: 0 }] }

    expect(changedValues(start, { ...start })).toEqual({})
    expect(
      changedValues(start, { ...start, quantities: [{ unitId: 'u', amount: 4 }], notes: 'x' }),
    ).toEqual({ quantities: [{ unitId: 'u', amount: 4 }], notes: 'x' })
  })

  it('keys drafts by grove, form and record', () => {
    expect(draftKey('farm', 'today')).toBe('harvestlog.draft:farm:today:new')
    expect(draftKey('farm', 'extraction', 'x1')).toBe('harvestlog.draft:farm:extraction:x1')
  })

  it('reads recent drafts and drops old, empty or broken ones', () => {
    const now = 1_800_000_000_000
    const draft = { savedAt: now - 1000, changes: { trees: 5 } }

    expect(readDraft(JSON.stringify(draft), now)).toEqual(draft)
    expect(
      readDraft(JSON.stringify({ ...draft, savedAt: now - DRAFT_MAX_AGE_MS - 1 }), now),
    ).toBeUndefined()

    expect(readDraft(JSON.stringify({ savedAt: now, changes: {} }), now)).toBeUndefined()
    expect(readDraft('{not json', now)).toBeUndefined()
    expect(readDraft(null, now)).toBeUndefined()
  })
})
