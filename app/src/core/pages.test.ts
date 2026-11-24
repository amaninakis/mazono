import { describe, expect, it } from 'vitest'
import { neighbourTab, tabOf } from './pages'

const tabs = ['/', '/journal', '/oil', '/money', '/reports', '/settings']

describe('swiping between pages', () => {
  it('knows which tab a page belongs to, including the pages opened from it', () => {
    expect(tabOf('/', tabs)).toBe(0)
    expect(tabOf('/entry/abc', tabs)).toBe(0)
    expect(tabOf('/journal', tabs)).toBe(1)
    expect(tabOf('/oil/new', tabs)).toBe(2)
    expect(tabOf('/money/123', tabs)).toBe(3)
    expect(tabOf('/settings/fields', tabs)).toBe(5)
    expect(tabOf('/oilcan', tabs)).toBe(-1)
  })

  it('goes to the neighbouring tab, and nowhere past the first and last', () => {
    expect(neighbourTab('/journal', tabs, 1)).toBe('/oil')
    expect(neighbourTab('/journal', tabs, -1)).toBe('/')
    expect(neighbourTab('/oil/new', tabs, 1)).toBe('/money')
    expect(neighbourTab('/', tabs, -1)).toBeUndefined()
    expect(neighbourTab('/settings/fields', tabs, 1)).toBeUndefined()
  })

  it('follows the tabs this person can see', () => {
    const fewer = ['/journal', '/reports', '/settings']

    expect(neighbourTab('/journal', fewer, 1)).toBe('/reports')
    expect(neighbourTab('/journal', fewer, -1)).toBeUndefined()
  })
})
