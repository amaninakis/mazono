import type { FastifyReply, FastifyRequest } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import type {
  AccountInfo,
  SyncRecord,
  SyncRequest,
  SyncResponse,
} from '../src/core/syncFormat.ts'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import {
  isValidUsername,
  MIN_PASSWORD_LENGTH,
  rowId,
  SYNC_TABLES,
} from '../src/core/syncFormat.ts'
import {
  hashPassword,
  hashToken,
  newSessionToken,
  SignInLimiter,
  verifyPassword,
} from './auth.ts'
import { inTransaction, nextSeq } from './database.ts'

export const SESSION_COOKIE = 'harvestlog_session'
/** A device stays signed in for 90 days after it was last used. */
const SESSION_DAYS = 90
const DAY = 86_400_000
/** Records sent back per sync call; the device asks again while `more` is true. */
const PAGE_SIZE = 2000
/** Phone clocks within a minute of the server's are trusted as they are. */
const CLOCK_TOLERANCE = 60_000

export interface ServerOptions {
  database: DatabaseSync
  /** Folder with the built web app (dist); not served when missing (e.g. in tests). */
  staticDir?: string
  version?: string
  /** For tests. */
  now?: () => number
}

interface UserRow {
  id: string
  username: string
  password_hash: string
  is_owner: number
  must_change_password: number
  disabled: number
}

const SYNC_TABLE_SET = new Set<string>(SYNC_TABLES)

export async function buildServer(options: ServerOptions) {
  const { database } = options
  const now = options.now ?? Date.now
  const limiter = new SignInLimiter()
  const app = Fastify({ trustProxy: true, bodyLimit: 20 * 1024 * 1024 })
  await app.register(fastifyCookie)

  app.addHook('onRequest', (_request, reply, done) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('X-Frame-Options', 'DENY')
    done()
  })

  /* ---------- helpers ---------- */

  function userCount(): number {
    return (database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number })
      .count
  }

  function findUser(username: string): UserRow | undefined {
    return database.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      UserRow | undefined
  }

  function accountInfo(user: UserRow): AccountInfo {
    const farms = database
      .prepare('SELECT farm_id AS id, role FROM memberships WHERE user_id = ?')
      .all(user.id) as { id: string; role: 'admin' }[]

    return {
      user: {
        id: user.id,
        username: user.username,
        isOwner: !!user.is_owner,
        mustChangePassword: !!user.must_change_password,
      },
      farms,
    }
  }

  function startSession(request: FastifyRequest, reply: FastifyReply, user: UserRow) {
    const { token, hash } = newSessionToken()
    const time = now()
    database
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, last_used, expires_at, device) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        hash,
        user.id,
        time,
        time,
        time + SESSION_DAYS * DAY,
        String(request.headers['user-agent'] ?? '').slice(0, 200),
      )
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      maxAge: SESSION_DAYS * 86_400,
    })
  }

  /** The signed-in user, or a 401 reply. Keeps the session alive while it is used. */
  function signedInUser(request: FastifyRequest, reply: FastifyReply): UserRow | undefined {
    const token = request.cookies[SESSION_COOKIE]
    const session =
      token &&
      (database
        .prepare('SELECT user_id, expires_at, last_used FROM sessions WHERE token_hash = ?')
        .get(hashToken(token)) as
        { user_id: string; expires_at: number; last_used: number } | undefined)
    const time = now()
    if (!session || session.expires_at < time) {
      void reply.code(401).send({ error: 'signed-out' })
      return undefined
    }
    const user = database
      .prepare('SELECT * FROM users WHERE id = ? AND disabled = 0')
      .get(session.user_id) as UserRow | undefined
    if (!user) {
      void reply.code(401).send({ error: 'signed-out' })
      return undefined
    }
    if (time - session.last_used > DAY) {
      database
        .prepare('UPDATE sessions SET last_used = ?, expires_at = ? WHERE token_hash = ?')
        .run(time, time + SESSION_DAYS * DAY, hashToken(token))
    }

    return user
  }

  function credentials(body: unknown): { username: string; password: string } | undefined {
    const { username, password } = (body ?? {}) as Record<string, unknown>
    if (typeof username !== 'string' || typeof password !== 'string') {
      return undefined
    }

    return { username: username.trim(), password }
  }

  /* ---------- accounts ---------- */

  app.get('/api/status', (_request, reply) =>
    reply.send({
      app: 'harvestlog',
      version: options.version ?? '',
      needsSetup: userCount() === 0,
    }),
  )

  /** Create the first account (the installation owner). Only while there are no accounts. */
  app.post('/api/setup', async (request, reply) => {
    const given = credentials(request.body)
    if (!given || !isValidUsername(given.username)) {
      return await reply.code(400).send({ error: 'username' })
    }
    if (given.password.length < MIN_PASSWORD_LENGTH) {
      return await reply.code(400).send({ error: 'password-short' })
    }
    const passwordHash = await hashPassword(given.password)
    const user = inTransaction(database, () => {
      if (userCount() > 0) {
        return undefined
      }
      const id = randomUUID()
      database
        .prepare(
          'INSERT INTO users (id, username, password_hash, is_owner, created_at) VALUES (?, ?, ?, 1, ?)',
        )
        .run(id, given.username, passwordHash, now())

      return findUser(given.username)
    })
    if (!user) {
      return await reply.code(409).send({ error: 'already-set-up' })
    }
    startSession(request, reply, user)

    return accountInfo(user)
  })

  app.post('/api/login', async (request, reply) => {
    const given = credentials(request.body)
    if (!given) {
      return await reply.code(400).send({ error: 'credentials' })
    }
    const key = `${request.ip}|${given.username.toLowerCase()}`
    if (limiter.isBlocked(key, now())) {
      return await reply.code(429).send({ error: 'too-many-tries' })
    }
    const user = findUser(given.username)
    const ok =
      !!user && !user.disabled && (await verifyPassword(given.password, user.password_hash))
    if (!ok || !user) {
      limiter.fail(key, now())
      return await reply.code(401).send({ error: 'wrong-credentials' })
    }
    limiter.succeed(key)
    startSession(request, reply, user)

    return accountInfo(user)
  })

  app.post('/api/logout', (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) {
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    }

    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true })
  })

  app.get('/api/me', async (request, reply) => {
    const user = signedInUser(request, reply)
    return user ? accountInfo(user) : await reply
  })

  app.post('/api/password', async (request, reply) => {
    const user = signedInUser(request, reply)
    if (!user) {
      return await reply
    }
    const { current, next } = (request.body ?? {}) as Record<string, unknown>
    if (typeof current !== 'string' || typeof next !== 'string') {
      return await reply.code(400).send({ error: 'password' })
    }
    if (!(await verifyPassword(current, user.password_hash))) {
      return await reply.code(403).send({ error: 'wrong-password' })
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      return await reply.code(400).send({ error: 'password-short' })
    }
    database
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(await hashPassword(next), user.id)

    return accountInfo({ ...user, must_change_password: 0 })
  })

  /* ---------- sync ---------- */

  /** May this user sync this farm? The owner may also create a new farm by syncing it. */
  function canSync(user: UserRow, farmId: string): boolean {
    const membership = database
      .prepare('SELECT role FROM memberships WHERE user_id = ? AND farm_id = ?')
      .get(user.id, farmId)
    if (membership) {
      return true
    }
    const farmExists = database.prepare('SELECT 1 FROM farms WHERE id = ?').get(farmId)
    if (farmExists || !user.is_owner) {
      return false
    }
    database
      .prepare('INSERT INTO farms (id, created_by, created_at) VALUES (?, ?, ?)')
      .run(farmId, user.id, now())
    database
      .prepare("INSERT INTO memberships (user_id, farm_id, role) VALUES (?, ?, 'admin')")
      .run(user.id, farmId)

    return true
  }

  function isValidChange(change: SyncRecord, farmId: string): boolean {
    if (!SYNC_TABLE_SET.has(change.table) || typeof change.id !== 'string' || !change.id) {
      return false
    }
    const data = change.data
    if (!data || typeof data !== 'object' || typeof change.updatedAt !== 'number') {
      return false
    }
    const owner = change.table === 'farms' ? data.id : data.farmId

    return owner === farmId && rowId(change.table, data) === change.id
  }

  app.post('/api/sync', async (request, reply) => {
    const user = signedInUser(request, reply)
    if (!user) {
      return await reply
    }
    const body = request.body as SyncRequest
    if (!body || typeof body.farmId !== 'string' || !Array.isArray(body.changes)) {
      return await reply.code(400).send({ error: 'sync-request' })
    }
    const { farmId } = body
    const time = now()
    // Correct a phone clock that is off, so its changes order correctly against others.
    const offset =
      typeof body.clientNow === 'number' && Math.abs(time - body.clientNow) > CLOCK_TOLERANCE
        ? time - body.clientNow
        : 0

    const result = inTransaction(database, () => {
      if (!canSync(user, farmId)) {
        return undefined
      }
      const refused: SyncRecord[] = []
      const find = database.prepare(
        'SELECT data, updated_at FROM records WHERE farm_id = ? AND tbl = ? AND id = ?',
      )
      const save = database.prepare(
        `INSERT INTO records (farm_id, tbl, id, data, updated_at, seq) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (farm_id, tbl, id) DO UPDATE SET data = excluded.data,
           updated_at = excluded.updated_at, seq = excluded.seq`,
      )

      for (const change of body.changes) {
        if (!isValidChange(change, farmId)) {
          continue
        }
        const updatedAt = Math.min(change.updatedAt + offset, time)
        const existing = find.get(farmId, change.table, change.id) as
          { data: string; updated_at: number } | undefined
        if (existing && existing.updated_at > updatedAt) {
          // The server has a newer version: keep it and send it back.
          refused.push({
            table: change.table,
            id: change.id,
            data: JSON.parse(existing.data) as Record<string, unknown>,
            updatedAt: existing.updated_at,
          })
          continue
        }
        const data = { ...change.data, updatedAt }
        save.run(
          farmId,
          change.table,
          change.id,
          JSON.stringify(data),
          updatedAt,
          nextSeq(database),
        )
      }

      const since = Number(body.since) || 0
      const rows = database
        .prepare(
          'SELECT tbl, id, data, updated_at, seq FROM records WHERE farm_id = ? AND seq > ? ORDER BY seq LIMIT ?',
        )
        .all(farmId, since, PAGE_SIZE + 1) as {
        tbl: SyncRecord['table']
        id: string
        data: string
        updated_at: number
        seq: number
      }[]
      const more = rows.length > PAGE_SIZE
      const page = rows.slice(0, PAGE_SIZE)
      const response: SyncResponse = {
        seq: page.at(-1)?.seq ?? since,
        more,
        records: [
          ...page.map((row) => ({
            table: row.tbl,
            id: row.id,
            data: JSON.parse(row.data) as Record<string, unknown>,
            updatedAt: row.updated_at,
          })),
          ...refused,
        ],
      }

      return response
    })

    return await (result ?? reply.code(403).send({ error: 'not-a-member' }))
  })

  /** Tables whose rows count as "data you entered"; the rest are defaults from setup. */
  const DATA_TABLES = [
    'fields',
    'entries',
    'extractions',
    'transactions',
    'stockMovements',
    'mills',
  ]

  /**
   * Remove a grove that holds no data (e.g. one created by mistake). Only its administrator
   * can, and never a grove with fields, work, productions, money or oil movements in it.
   */
  app.post<{ Params: { farmId: string } }>('/api/farms/:farmId/remove', (request, reply) => {
    const user = signedInUser(request, reply)
    if (!user) {
      return reply
    }
    const { farmId } = request.params
    const membership = database
      .prepare('SELECT role FROM memberships WHERE user_id = ? AND farm_id = ?')
      .get(user.id, farmId) as { role: string } | undefined
    if (membership?.role !== 'admin') {
      return reply.code(403).send({ error: 'not-a-member' })
    }
    const rows = database
      .prepare(
        `SELECT data FROM records WHERE farm_id = ? AND tbl IN (${DATA_TABLES.map(() => '?').join(', ')})`,
      )
      .all(farmId, ...DATA_TABLES) as { data: string }[]
    const hasData = rows.some(
      (row) => !(JSON.parse(row.data) as { deletedAt?: number }).deletedAt,
    )
    if (hasData) {
      return reply.code(409).send({ error: 'not-empty' })
    }
    inTransaction(database, () => {
      database.prepare('DELETE FROM records WHERE farm_id = ?').run(farmId)
      database.prepare('DELETE FROM memberships WHERE farm_id = ?').run(farmId)
      database.prepare('DELETE FROM farms WHERE id = ?').run(farmId)
    })

    return reply.send({ ok: true })
  })

  app.all(
    '/api/*',
    async (_request, reply) => await reply.code(404).send({ error: 'not-found' }),
  )

  /* ---------- the web app ---------- */

  const staticDir = options.staticDir
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
      setHeaders(response, path) {
        if (/(?:sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$/.test(path)) {
          response.header('Cache-Control', 'no-cache')
        } else if (path.includes('/assets/')) {
          response.header('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    })
    // Single-page app: any other path loads the app.
    app.setNotFoundHandler(
      async (_request, reply) =>
        await reply.header('Cache-Control', 'no-cache').sendFile('index.html'),
    )
  }

  return await app
}
