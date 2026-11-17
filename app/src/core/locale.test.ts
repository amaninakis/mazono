import { describe, expect, it } from 'vitest'
import { detectDateFormat, formatLocaleFor, pickLanguage } from './locale'

function fmt(loc: string) {
  return `${new Intl.DateTimeFormat(loc).format(new Date(2026, 10, 15))} ${new Intl.NumberFormat(loc).format(1234.5)}`
}

describe('date and number format', () => {
  it('English on a Mac set to region Greece: detected from the time zone', () => {
    // macOS en_US@rg=grzzzz: the browser only reports en-US
    expect(detectDateFormat('en', ['en-US'], 'Europe/Athens')).toBe('GR')
    expect(fmt(formatLocaleFor('en', 'auto', ['en-US'], 'Europe/Athens'))).toBe(
      '15/11/2026 1.234,5',
    )
  })

  it('detects from the language list', () => {
    expect(detectDateFormat('en', ['en-US', 'el-GR'], 'UTC')).toBe('GR')
    expect(detectDateFormat('en', ['en-US'], 'America/New_York')).toBe('US')
    expect(detectDateFormat('en', ['en-GB'], 'Europe/London')).toBe('GB')
    expect(detectDateFormat('el', ['en-US'], 'America/New_York')).toBe('GR')
  })

  it('a chosen format wins over detection', () => {
    expect(fmt(formatLocaleFor('en', 'US', ['en-GB'], 'Europe/Athens'))).toBe(
      '11/15/2026 1,234.5',
    )

    expect(fmt(formatLocaleFor('en', 'GB', [], 'Europe/Athens'))).toBe('15/11/2026 1,234.5')
    expect(fmt(formatLocaleFor('el', 'auto', [], undefined))).toBe('15/11/2026 1.234,5')
  })
})

describe('pickLanguage', () => {
  it("prefers this phone's choice over the grove's", () => {
    expect(pickLanguage('en', 'el', 'el')).toBe('en')
  })

  it("starts from the grove's language, then the browser's", () => {
    expect(pickLanguage(null, 'el', 'en')).toBe('el')
    expect(pickLanguage(undefined, undefined, 'en')).toBe('en')
  })

  it('ignores anything that is not a language', () => {
    expect(pickLanguage('fr', undefined, 'el')).toBe('el')
  })
})
