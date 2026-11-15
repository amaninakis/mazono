import { describe, expect, it } from 'vitest'
import el from './locales/el.json'
import en from './locales/en.json'

function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]: [string, unknown]) =>
    value !== null && typeof value === 'object'
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

describe('translations', () => {
  it('Greek has exactly the same keys as English', () => {
    expect(keys(el).sort()).toEqual(keys(en).sort())
  })
})
