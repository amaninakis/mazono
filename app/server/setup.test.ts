import { describe, expect, it } from 'vitest'
import { newSetupCode, plainSetupCode, setupBanner, setupCodeMatches } from './setup.ts'

describe('setup code', () => {
  it('is three groups of three easy-to-read characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(newSetupCode()).toMatch(
        /^[AC-HJKMNPQRT-Y34679]{3}(?:-[AC-HJKMNPQRT-Y34679]{3}){2}$/,
      )
    }

    expect(new Set(Array.from({ length: 50 }, () => newSetupCode())).size).toBe(50)
  })

  it('is accepted however it is typed', () => {
    expect(plainSetupCode(' 7kq-4mx 92p ')).toBe('7KQ4MX92P')
    expect(setupCodeMatches('7kq4mx92p', '7KQ-4MX-92P')).toBe(true)
    expect(setupCodeMatches('7KQ-4MX-92X', '7KQ-4MX-92P')).toBe(false)
    expect(setupCodeMatches('', '7KQ-4MX-92P')).toBe(false)
    expect(setupCodeMatches(undefined, '7KQ-4MX-92P')).toBe(false)
  })
})

describe('setup banner', () => {
  it('shows the usual placeholder with the published port', () => {
    const banner = setupBanner({ code: '7KQ-4MX-92P', port: 8080 })

    expect(banner).toContain('http://<server-ip>:8080')
    expect(banner).toContain('Setup code:  7KQ-4MX-92P')
  })

  it('shows the address set for the server instead', () => {
    const banner = setupBanner({ code: 'X', port: 8080, url: 'https://elies.example.org' })

    expect(banner).toContain('https://elies.example.org')
    expect(banner).not.toContain('<server-ip>')
  })
})
