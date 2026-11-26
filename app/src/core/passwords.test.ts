import { describe, expect, it } from 'vitest'
import { passwordProblem } from './passwords'
import { suggestTemporaryPassword } from './tempPassword'

describe('passwordProblem', () => {
  it('needs the minimum length', () => {
    expect(passwordProblem('kali1')).toBe('password-short')
  })

  it('turns down passwords guessed first', () => {
    for (const password of ['12345678', 'password1', 'Qwertyuiop', 'iloveyou', '1q2w3e4r']) {
      expect(passwordProblem(password)).toBe('password-common')
    }
  })

  it('turns down a common word with only numbers or signs added', () => {
    for (const password of [
      'elies2024',
      'Kodikos!!',
      'mazono2026',
      'ελιές2024',
      '2024olive!',
    ]) {
      expect(passwordProblem(password)).toBe('password-common')
    }
  })

  it('turns down the user name, repeats and runs', () => {
    expect(passwordProblem('andreas1970', 'Andreas')).toBe('password-common')
    expect(passwordProblem('aaaaaaaaa')).toBe('password-common')
    expect(passwordProblem('abcabcabc')).toBe('password-common')
    expect(passwordProblem('98765432')).toBe('password-common')
    expect(passwordProblem('abcdefghij')).toBe('password-common')
  })

  it('accepts ordinary good passwords', () => {
    for (const password of [
      'petra-vrochi-7',
      'Ta xorafia mou',
      'kalo-ladi-fetos',
      'ΜεγάληΕλιά!9',
      'x7Qp2mVt',
      'elies sto vouno',
    ]) {
      expect(passwordProblem(password, 'andreas')).toBeUndefined()
    }
  })

  it('accepts the suggested temporary passwords', () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordProblem(suggestTemporaryPassword())).toBeUndefined()
    }
  })
})
