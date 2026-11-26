import { Buffer } from 'node:buffer'
import { randomInt, timingSafeEqual } from 'node:crypto'

/*
 * The one-time setup code. A new server has no accounts, so whoever opens it first could make
 * themselves administrator; the code, printed only in the server's log, proves it is the
 * person who installed it. It is kept until the administrator is created, so it stays the same
 * across restarts.
 */

/**
 * Letters and digits that cannot be mistaken for each other (no 0/O, 1/I/L, 5/S, 2/Z, 8/B).
 */
const CODE_LETTERS = 'ACDEFGHJKMNPQRTUVWXY34679'

/** A new code such as "7KQ-4MX-92P": 9 characters, about 42 bits. */
export function newSetupCode(): string {
  const characters = Array.from(
    { length: 9 },
    () => CODE_LETTERS[randomInt(CODE_LETTERS.length)],
  )

  return [0, 3, 6].map((start) => characters.slice(start, start + 3).join('')).join('-')
}

/** The code as typed, in capitals and without spaces or dashes, for comparing. */
export function plainSetupCode(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function setupCodeMatches(typed: unknown, code: string): boolean {
  if (typeof typed !== 'string') {
    return false
  }
  const given = Buffer.from(plainSetupCode(typed))
  const expected = Buffer.from(plainSetupCode(code))

  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * The box printed in the server's log while it waits to be set up. Inside Docker the server
 * cannot see the computer's own address, so it shows the usual placeholder with the port it
 * is published on (MAZONO_PORT), or the address set in MAZONO_URL.
 */
export function setupBanner(input: { code: string; port: number; url?: string }): string {
  const address = input.url?.trim() || `http://<server-ip>:${input.port}`
  const lines = [
    'Mazono is ready to set up.',
    'Open it in a browser:',
    `  ${address}`,
    `Setup code:  ${input.code}`,
  ]
  const rule = '─'.repeat(Math.max(...lines.map((line) => line.length)) + 2)

  return [rule, ...lines.map((line) => ` ${line}`), rule, ''].join('\n')
}
