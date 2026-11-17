import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH } from './syncFormat'
import { suggestTemporaryPassword } from './tempPassword'

describe('suggestTemporaryPassword', () => {
  it('makes two different words and a two-digit number, long enough to be accepted', () => {
    for (let i = 0; i < 200; i++) {
      const password = suggestTemporaryPassword()

      expect(password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/)
      const [first, second] = password.split('-')

      expect(first).not.toBe(second)
      expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH)
    }
  })

  it('avoids the same word twice', () => {
    expect(suggestTemporaryPassword(() => 0)).toBe('elia-ladi-10')
  })
})
