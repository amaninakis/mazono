import { Buffer } from 'node:buffer'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/* Password hashing (scrypt) and session tokens. */

const KEY_LENGTH = 64
const COST = 16_384

async function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { cost: COST, blockSize: 8, parallelization: 1 },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

/** "scrypt$<salt>$<hash>", both base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt)

  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltText, hashText] = stored.split('$')
  if (kind !== 'scrypt' || !saltText || !hashText) {
    return false
  }
  const expected = Buffer.from(hashText, 'base64')
  const actual = await scryptAsync(password, Buffer.from(saltText, 'base64'))

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** A new random session token (sent to the device) and its hash (kept on the server). */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Counts failed sign-ins per address and username, so passwords cannot be guessed quickly:
 * after `limit` failures in `windowMs`, further tries are refused until the window ends.
 */
export class SignInLimiter {
  private readonly failures = new Map<string, { count: number; since: number }>()
  private readonly limit: number
  private readonly windowMs: number

  public constructor(limit = 10, windowMs = 15 * 60_000) {
    this.limit = limit
    this.windowMs = windowMs
  }

  public isBlocked(key: string, now: number): boolean {
    const entry = this.failures.get(key)
    if (!entry) {
      return false
    }
    if (now - entry.since > this.windowMs) {
      this.failures.delete(key)
      return false
    }

    return entry.count >= this.limit
  }

  public fail(key: string, now: number): void {
    const entry = this.failures.get(key)
    if (!entry || now - entry.since > this.windowMs) {
      this.failures.set(key, { count: 1, since: now })
    } else {
      entry.count += 1
    }
  }

  public succeed(key: string): void {
    this.failures.delete(key)
  }
}
