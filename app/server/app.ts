import type { FastifyReply, FastifyRequest } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import type { Access, Role } from '../src/core/access.ts'
import type {
  AccountInfo,
  Member,
  ServerAccount,
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
  cleanPermissions,
  PRESETS,
  readableTables,
  writableTables,
} from '../src/core/access.ts'
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

export const SESSION_COOKIE = 'mazono_session'
/** The sign-in cookie from before the rename: still accepted, so nobody is signed out. */
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
  may_create_grove: number
}

interface MembershipRow {
  role: Role
  permissions: string
}

/** Records whose creator is shown ("logged by Giannis"); stamped by the server. */
const CREATED_BY_TABLES = new Set(['entries', 'extractions', 'transactions', 'stockMovements'])

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
    const rows = database
      .prepare('SELECT farm_id AS id, role, permissions FROM memberships WHERE user_id = ?')
      .all(user.id) as unknown as (MembershipRow & { id: string })[]

    return {
      user: {
        id: user.id,
        username: user.username,
        isOwner: !!user.is_owner,
        mustChangePassword: !!user.must_change_password,
        mayCreateGrove: !!user.is_owner || !!user.may_create_grove,
      },
      farms: rows.map((row) => ({
        id: row.id,
        role: row.role,
        permissions: cleanPermissions(JSON.parse(row.permissions)),
      })),
    }
  }

  function membership(userId: string, farmId: string): Access | undefined {
    const row = database
      .prepare('SELECT role, permissions FROM memberships WHERE user_id = ? AND farm_id = ?')
      .get(userId, farmId) as MembershipRow | undefined

    return row
      ? { role: row.role, permissions: cleanPermissions(JSON.parse(row.permissions)) }
      : undefined
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
      // Still the app's first name for now: phones running a version from before the rename
      // only recognise this server by it. Newer versions accept both (see src/sync/api.ts).
      app: 'mazono',
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
  /**
   * This user's access to the farm. The installation owner, or someone the owner allowed to
   * start their own grove, creates a new farm by syncing it (and becomes its administrator).
   */
  function accessForSync(user: UserRow, farmId: string): Access | undefined {
    const existing = membership(user.id, farmId)
    if (existing) {
      return existing
    }
    const farmExists = database.prepare('SELECT 1 FROM farms WHERE id = ?').get(farmId)
    if (farmExists || (!user.is_owner && !user.may_create_grove)) {
      return undefined
    }
    database
      .prepare('INSERT INTO farms (id, created_by, created_at) VALUES (?, ?, ?)')
      .run(farmId, user.id, now())
    database
      .prepare(
        "INSERT INTO memberships (user_id, farm_id, role, permissions) VALUES (?, ?, 'admin', '{}')",
      )
      .run(user.id, farmId)
    // One grove of their own; the owner may create as many as they like.
    database.prepare('UPDATE users SET may_create_grove = 0 WHERE id = ?').run(user.id)

    return { role: 'admin', permissions: cleanPermissions({}) }
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

    if (user.must_change_password) {
      return await reply.code(403).send({ error: 'change-password' })
    }

    const result = inTransaction(database, () => {
      const access = accessForSync(user, farmId)
      if (!access) {
        return undefined
      }
      const readable = readableTables(access)
      const writable = writableTables(access)
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
        if (!writable.has(change.table)) {
          // Not allowed to change this: send the server's version back (if they may see it).
          if (existing && readable.has(change.table)) {
            refused.push({
              table: change.table,
              id: change.id,
              data: JSON.parse(existing.data) as Record<string, unknown>,
              updatedAt: existing.updated_at,
            })
          }
          continue
        }
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
        const data: Record<string, unknown> = { ...change.data, updatedAt }
        if (CREATED_BY_TABLES.has(change.table)) {
          // Who logged it: set by the server when the record first arrives, kept after that.
          data.createdBy = existing
            ? (JSON.parse(existing.data) as { createdBy?: string }).createdBy
            : user.username
        }
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
      const tables = [...readable]
      const rows = database
        .prepare(
          `SELECT tbl, id, data, updated_at, seq FROM records
           WHERE farm_id = ? AND seq > ? AND tbl IN (${tables.map(() => '?').join(', ')})
           ORDER BY seq LIMIT ?`,
        )
        .all(farmId, since, ...tables, PAGE_SIZE + 1) as {
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

  /* ---------- members of a grove (for its administrators) ---------- */

  interface MemberParams {
    farmId: string
    userId: string
  }

  /** The signed-in user if they administer this grove, else a 401/403 reply. */
  function groveAdmin(
    request: FastifyRequest<{ Params: { farmId: string } }>,
    reply: FastifyReply,
  ) {
    const user = signedInUser(request, reply)
    if (!user) {
      return undefined
    }
    if (membership(user.id, request.params.farmId)?.role !== 'admin') {
      void reply.code(403).send({ error: 'not-an-admin' })
      return undefined
    }

    return user
  }

  function members(farmId: string): Member[] {
    const rows = database
      .prepare(
        `SELECT u.id, u.username, u.is_owner, u.must_change_password, m.role, m.permissions
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.farm_id = ? ORDER BY m.role, u.username COLLATE NOCASE`,
      )
      .all(farmId) as unknown as (MembershipRow & {
      id: string
      username: string
      is_owner: number
      must_change_password: number
    })[]

    return rows.map((row) => ({
      userId: row.id,
      username: row.username,
      role: row.role,
      permissions: cleanPermissions(JSON.parse(row.permissions)),
      isOwner: !!row.is_owner,
      mustChangePassword: !!row.must_change_password,
    }))
  }

  function adminCount(farmId: string): number {
    return (
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM memberships WHERE farm_id = ? AND role = 'admin'",
        )
        .get(farmId) as { count: number }
    ).count
  }

  function memberRole(body: unknown): { role: Role; permissions: string } {
    const given = (body ?? {}) as { role?: unknown; permissions?: unknown }
    const role: Role = given.role === 'admin' ? 'admin' : 'user'
    const permissions = cleanPermissions(given.permissions ?? PRESETS.worker)

    return { role, permissions: JSON.stringify(permissions) }
  }

  app.get<{ Params: { farmId: string } }>('/api/farms/:farmId/members', (request, reply) => {
    return groveAdmin(request, reply) ? reply.send(members(request.params.farmId)) : reply
  })

  /**
   * Add someone with a temporary password they must change at first sign-in. With `ownGrove`
   * (installation owner only) they are not added here but may start a grove of their own.
   */
  app.post<{ Params: { farmId: string } }>(
    '/api/farms/:farmId/members',
    async (request, reply) => {
      const admin = groveAdmin(request, reply)
      if (!admin) {
        return await reply
      }
      const { farmId } = request.params
      const body = (request.body ?? {}) as Record<string, unknown>
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const ownGrove = body.ownGrove === true
      if (!isValidUsername(username)) {
        return await reply.code(400).send({ error: 'username' })
      }
      if (ownGrove && !admin.is_owner) {
        return await reply.code(403).send({ error: 'owner-only' })
      }
      const { role, permissions } = memberRole(body)
      const existing = findUser(username)
      if (existing) {
        // Only the installation owner may add someone who already has an account elsewhere.
        if (!admin.is_owner || ownGrove) {
          return await reply.code(409).send({ error: 'username-taken' })
        }
        if (membership(existing.id, farmId)) {
          return await reply.code(409).send({ error: 'already-member' })
        }
        database
          .prepare(
            `INSERT INTO memberships (user_id, farm_id, role, permissions) VALUES (?, ?, ?, ?)
             ON CONFLICT (user_id, farm_id) DO UPDATE SET role = excluded.role,
               permissions = excluded.permissions`,
          )
          .run(existing.id, farmId, role, permissions)

        // Their password stays as it is: the admin must not hand out a temporary one.
        return await reply.send({ members: members(farmId), existingAccount: true })
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return await reply.code(400).send({ error: 'password-short' })
      }
      const id = randomUUID()
      const passwordHash = await hashPassword(password)
      inTransaction(database, () => {
        database
          .prepare(
            `INSERT INTO users (id, username, password_hash, must_change_password, may_create_grove, created_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
          )
          .run(id, username, passwordHash, ownGrove ? 1 : 0, now())
        if (!ownGrove) {
          database
            .prepare(
              'INSERT INTO memberships (user_id, farm_id, role, permissions) VALUES (?, ?, ?, ?)',
            )
            .run(id, farmId, role, permissions)
        }
      })

      return await reply.send({ members: members(farmId), existingAccount: false })
    },
  )

  /** Change someone's role or permissions. The last administrator stays an administrator. */
  app.post<{ Params: MemberParams }>(
    '/api/farms/:farmId/members/:userId',
    (request, reply) => {
      if (!groveAdmin(request, reply)) {
        return reply
      }
      const { farmId, userId } = request.params
      const target = members(farmId).find((member) => member.userId === userId)
      if (!target) {
        return reply.code(404).send({ error: 'not-a-member' })
      }
      const { role, permissions } = memberRole(request.body)
      if (target.isOwner && role !== 'admin') {
        return reply.code(409).send({ error: 'owner-stays-admin' })
      }
      if (target.role === 'admin' && role !== 'admin' && adminCount(farmId) <= 1) {
        return reply.code(409).send({ error: 'last-admin' })
      }
      database
        .prepare(
          'UPDATE memberships SET role = ?, permissions = ? WHERE user_id = ? AND farm_id = ?',
        )
        .run(role, permissions, userId, farmId)

      return reply.send(members(farmId))
    },
  )

  /** A new temporary password (to change at the next sign-in); signs them out everywhere. */
  app.post<{ Params: MemberParams }>(
    '/api/farms/:farmId/members/:userId/password',
    async (request, reply) => {
      const admin = groveAdmin(request, reply)
      if (!admin) {
        return await reply
      }
      const { farmId, userId } = request.params
      const target = members(farmId).find((member) => member.userId === userId)
      if (!target || target.isOwner || userId === admin.id) {
        return await reply.code(403).send({ error: 'not-allowed' })
      }
      // Someone in groves this admin does not run: only the installation owner may.
      const elsewhere = database
        .prepare(
          `SELECT 1 FROM memberships m WHERE m.user_id = ? AND NOT EXISTS (
             SELECT 1 FROM memberships a WHERE a.user_id = ? AND a.farm_id = m.farm_id AND a.role = 'admin')`,
        )
        .get(userId, admin.id)
      if (elsewhere && !admin.is_owner) {
        return await reply.code(403).send({ error: 'not-allowed' })
      }
      const { password } = (request.body ?? {}) as { password?: unknown }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return await reply.code(400).send({ error: 'password-short' })
      }
      const passwordHash = await hashPassword(password)
      database
        .prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
        .run(passwordHash, userId)
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)

      return await reply.send(members(farmId))
    },
  )

  /**
   * Remove someone from the grove. If it was their last grove their account is deleted too;
   * what they logged stays, with their name.
   */
  app.post<{ Params: MemberParams }>(
    '/api/farms/:farmId/members/:userId/remove',
    (request, reply) => {
      if (!groveAdmin(request, reply)) {
        return reply
      }
      const { farmId, userId } = request.params
      const target = members(farmId).find((member) => member.userId === userId)
      if (!target) {
        return reply.code(404).send({ error: 'not-a-member' })
      }
      if (target.isOwner) {
        return reply.code(409).send({ error: 'owner-stays-admin' })
      }
      if (target.role === 'admin' && adminCount(farmId) <= 1) {
        return reply.code(409).send({ error: 'last-admin' })
      }
      inTransaction(database, () => {
        database
          .prepare('DELETE FROM memberships WHERE user_id = ? AND farm_id = ?')
          .run(userId, farmId)
        // Out of their last grove: the account goes too, so the username is free again.
        if (groveCount(userId) === 0) {
          deleteUser(userId)
        }
      })

      return reply.send(members(farmId))
    },
  )

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
    inTransaction(database, () => deleteGrove(farmId))

    return reply.send({ ok: true })
  })

  /* ---------- the installation owner: every account, to help people ---------- */

  function groveCount(userId: string): number {
    return (
      database
        .prepare('SELECT COUNT(*) AS count FROM memberships WHERE user_id = ?')
        .get(userId) as { count: number }
    ).count
  }

  function deleteUser(userId: string) {
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    database.prepare('DELETE FROM memberships WHERE user_id = ?').run(userId)
    database.prepare('DELETE FROM users WHERE id = ? AND is_owner = 0').run(userId)
  }

  function deleteGrove(farmId: string) {
    database.prepare('DELETE FROM records WHERE farm_id = ?').run(farmId)
    database.prepare('DELETE FROM memberships WHERE farm_id = ?').run(farmId)
    database.prepare('DELETE FROM farms WHERE id = ?').run(farmId)
  }

  /** The signed-in installation owner, else a 401/403 reply. */
  function installationOwner(request: FastifyRequest, reply: FastifyReply) {
    const user = signedInUser(request, reply)
    if (!user) {
      return undefined
    }
    if (!user.is_owner) {
      void reply.code(403).send({ error: 'not-allowed' })
      return undefined
    }

    return user
  }

  function groveName(farmId: string): string | undefined {
    const row = database
      .prepare("SELECT data FROM records WHERE farm_id = ? AND tbl = 'farms' AND id = ?")
      .get(farmId, farmId) as { data: string } | undefined

    return row ? (JSON.parse(row.data) as { name?: string }).name : undefined
  }

  function serverAccounts(owner: UserRow): ServerAccount[] {
    const users = database
      .prepare(
        `SELECT u.id, u.username, u.is_owner, u.must_change_password, u.may_create_grove,
                u.created_at, (SELECT MAX(last_used) FROM sessions s WHERE s.user_id = u.id) AS last_active
         FROM users u ORDER BY u.is_owner DESC, u.username COLLATE NOCASE`,
      )
      .all() as unknown as {
      id: string
      username: string
      is_owner: number
      must_change_password: number
      may_create_grove: number
      created_at: number
      last_active: number | null
    }[]
    const groves = database
      .prepare(
        `SELECT m.user_id, m.farm_id, m.role,
                (SELECT COUNT(*) FROM memberships p WHERE p.farm_id = m.farm_id) AS people,
                (SELECT COUNT(*) FROM memberships a WHERE a.farm_id = m.farm_id AND a.role = 'admin') AS admins,
                EXISTS (SELECT 1 FROM memberships o WHERE o.farm_id = m.farm_id AND o.user_id = ?) AS shared
         FROM memberships m`,
      )
      .all(owner.id) as unknown as {
      user_id: string
      farm_id: string
      role: Role
      people: number
      admins: number
      shared: number
    }[]

    return users.map((user) => ({
      userId: user.id,
      username: user.username,
      isOwner: !!user.is_owner,
      mustChangePassword: !!user.must_change_password,
      waitingForGrove: !!user.may_create_grove,
      createdAt: user.created_at,
      lastActive: user.last_active,
      groves: groves
        .filter((grove) => grove.user_id === user.id)
        .map((grove) => ({
          farmId: grove.farm_id,
          role: grove.role,
          people: grove.people,
          admins: grove.admins,
          ...(grove.shared ? { name: groveName(grove.farm_id) } : {}),
        })),
    }))
  }

  app.get('/api/accounts', (request, reply) => {
    const owner = installationOwner(request, reply)
    return owner ? reply.send(serverAccounts(owner)) : reply
  })

  /** The owner gives anyone a new temporary password; signs them out everywhere. */
  app.post<{ Params: { userId: string } }>(
    '/api/accounts/:userId/password',
    async (request, reply) => {
      const owner = installationOwner(request, reply)
      if (!owner) {
        return await reply
      }
      const { userId } = request.params
      if (userId === owner.id) {
        return await reply.code(403).send({ error: 'not-allowed' })
      }
      const { password } = (request.body ?? {}) as { password?: unknown }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return await reply.code(400).send({ error: 'password-short' })
      }
      const passwordHash = await hashPassword(password)
      const changed = database
        .prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
        .run(passwordHash, userId)
      if (!changed.changes) {
        return await reply.code(404).send({ error: 'not-found' })
      }
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)

      return await reply.send(serverAccounts(owner))
    },
  )

  /**
   * The owner deletes an account. Groves where nobody else is left are deleted with all their
   * data; an account that is the only administrator of a grove others still use is refused.
   */
  app.post<{ Params: { userId: string } }>(
    '/api/accounts/:userId/remove',
    (request, reply) => {
      const owner = installationOwner(request, reply)
      if (!owner) {
        return reply
      }
      const { userId } = request.params
      const account = serverAccounts(owner).find((entry) => entry.userId === userId)
      if (!account) {
        return reply.code(404).send({ error: 'not-found' })
      }
      if (account.isOwner) {
        return reply.code(403).send({ error: 'not-allowed' })
      }
      const leftWithoutAdmin = account.groves.some(
        (grove) => grove.role === 'admin' && grove.people > 1 && grove.admins <= 1,
      )
      if (leftWithoutAdmin) {
        return reply.code(409).send({ error: 'only-admin' })
      }
      inTransaction(database, () => {
        for (const grove of account.groves) {
          if (grove.people <= 1) {
            deleteGrove(grove.farmId)
          }
        }
        deleteUser(userId)
      })

      return reply.send(serverAccounts(owner))
    },
  )

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
