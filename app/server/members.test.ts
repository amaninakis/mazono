import type { Member, SyncResponse } from '../src/core/syncFormat.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { PRESETS } from '../src/core/access.ts'
import { buildServer, SESSION_COOKIE } from './app.ts'
import { openDatabase } from './database.ts'

/* People in a grove: adding them, what they may see and change, and the safety rules. */

let app: Awaited<ReturnType<typeof buildServer>>
let owner: Record<string, string>
const clock = 1_800_000_000_000

function cookieOf(response: { cookies: { name: string; value: string }[] }) {
  const cookies: Record<string, string> = {}
  const cookie = response.cookies.find((x) => x.name === SESSION_COOKIE)
  if (cookie) {
    cookies[SESSION_COOKIE] = cookie.value
  }

  return cookies
}

function row(table: string, id: string, data: object) {
  return {
    table,
    id,
    updatedAt: clock,
    data: { id, farmId: 'grove', updatedAt: clock, ...data },
  }
}

async function sync(
  cookies: Record<string, string>,
  changes: object[] = [],
  farmId = 'grove',
) {
  return await app.inject({
    method: 'POST',
    url: '/api/sync',
    cookies,
    payload: { farmId, since: 0, clientNow: clock, changes },
  })
}

async function addMember(body: object, cookies = owner) {
  return await app.inject({
    method: 'POST',
    url: '/api/farms/grove/members',
    cookies,
    payload: body,
  })
}

async function signIn(username: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username, password },
  })

  return { status: response.statusCode, cookies: cookieOf(response) }
}

async function changePassword(cookies: Record<string, string>, current: string, next: string) {
  return await app.inject({
    method: 'POST',
    url: '/api/password',
    cookies,
    payload: { current, next },
  })
}

/** Adds a member, who signs in and sets their own password. */
async function memberWith(username: string, permissions: object, role = 'user') {
  await addMember({ username, password: 'temporary-1', role, permissions })
  const { cookies } = await signIn(username, 'temporary-1')
  await changePassword(cookies, 'temporary-1', `${username}-own-password`)

  return cookies
}

beforeEach(async () => {
  app = await buildServer({ database: openDatabase(':memory:'), now: () => clock })
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { username: 'andreas', password: 'olive-grove-1' },
  })
  owner = cookieOf(setup)
  await sync(owner, [
    {
      table: 'settings',
      id: 'grove',
      updatedAt: clock,
      data: { farmId: 'grove', updatedAt: clock },
    },
    row('fields', 'f1', { name: 'Upper', trees: 28 }),
    row('entries', 'e1', { date: '2026-11-10', fieldId: 'f1', trees: 10 }),
    row('extractions', 'x1', { date: '2026-11-20', oilKg: 100 }),
    row('transactions', 't1', { date: '2026-11-21', kind: 'sale', amount: 500 }),
  ])
})

describe('adding people', () => {
  it('needs a new password at the first sign-in before anything syncs', async () => {
    await addMember({
      username: 'giannis',
      password: 'elia-vouno-42',
      permissions: PRESETS.worker,
    })
    const first = await signIn('giannis', 'elia-vouno-42')

    expect(first.status).toBe(200)
    expect((await sync(first.cookies)).statusCode).toBe(403)
    expect(
      (await changePassword(first.cookies, 'elia-vouno-42', 'my-own-pass')).statusCode,
    ).toBe(200)

    expect((await sync(first.cookies)).statusCode).toBe(200)
  })

  it('refuses a name that is taken for grove admins, and short temporary passwords', async () => {
    const admin = await memberWith('maria', {}, 'admin')

    expect(
      (await addMember({ username: 'Andreas', password: 'some-password' }, admin)).statusCode,
    ).toBe(409)

    expect((await addMember({ username: 'kostas', password: 'short' })).statusCode).toBe(400)
  })

  it('refuses someone already in the grove, and says when an existing account was added', async () => {
    await memberWith('giannis', PRESETS.worker)
    const again = await addMember({ username: 'giannis', password: 'temporary-1' })

    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'already-member' })

    const fresh = await addMember({ username: 'eleni', password: 'temporary-1' })

    expect(fresh.json<{ existingAccount: boolean }>().existingAccount).toBe(false)
  })

  it('only lets administrators manage people', async () => {
    const worker = await memberWith('giannis', PRESETS.worker)

    expect(
      (await addMember({ username: 'kostas', password: 'temporary-1' }, worker)).statusCode,
    ).toBe(403)
    const list = await app.inject({ url: '/api/farms/grove/members', cookies: worker })

    expect(list.statusCode).toBe(403)
  })
})

describe('what people see and change', () => {
  it('sends a worker field work but no oil or money', async () => {
    const worker = await memberWith('giannis', PRESETS.worker)
    const tables = (await sync(worker)).json<SyncResponse>().records.map((x) => x.table)

    expect(new Set(tables)).toEqual(new Set(['settings', 'fields', 'entries']))
  })

  it('refuses changes outside what someone may change, and sends the real version back', async () => {
    const accountant = await memberWith('eleni', PRESETS.accountant)
    const response = (
      await sync(accountant, [
        row('transactions', 't1', { date: '2026-11-21', kind: 'sale', amount: 1 }),
      ])
    ).json<SyncResponse>()

    expect(response.records.find((x) => x.id === 't1')?.data.amount).toBe(500)
  })

  it('records who logged an entry', async () => {
    const worker = await memberWith('giannis', PRESETS.worker)
    await sync(worker, [row('entries', 'e2', { date: '2026-11-12', fieldId: 'f1', trees: 5 })])
    const records = (await sync(owner)).json<SyncResponse>().records

    expect(records.find((x) => x.id === 'e2')?.data.createdBy).toBe('giannis')
    expect(records.find((x) => x.id === 'e1')?.data.createdBy).toBe('andreas')
  })
})

describe('safety rules', () => {
  async function members() {
    return (await app.inject({ url: '/api/farms/grove/members', cookies: owner })).json<
      Member[]
    >()
  }

  it('keeps the owner an administrator and the last administrator in place', async () => {
    const ownerId = (await members()).find((x) => x.isOwner)!.userId
    const demote = await app.inject({
      method: 'POST',
      url: `/api/farms/grove/members/${ownerId}`,
      cookies: owner,
      payload: { role: 'user', permissions: PRESETS.worker },
    })

    expect(demote.statusCode).toBe(409)
    const remove = await app.inject({
      method: 'POST',
      url: `/api/farms/grove/members/${ownerId}/remove`,
      cookies: owner,
    })

    expect(remove.statusCode).toBe(409)
  })

  it('gives a new temporary password and signs the person out', async () => {
    const worker = await memberWith('giannis', PRESETS.worker)
    const id = (await members()).find((x) => x.username === 'giannis')!.userId
    const reset = await app.inject({
      method: 'POST',
      url: `/api/farms/grove/members/${id}/password`,
      cookies: owner,
      payload: { password: 'new-temporary-2' },
    })

    expect(reset.statusCode).toBe(200)
    expect((await app.inject({ url: '/api/me', cookies: worker })).statusCode).toBe(401)
    const again = await signIn('giannis', 'new-temporary-2')

    expect(again.status).toBe(200)
  })

  it('removes someone from the grove', async () => {
    const worker = await memberWith('giannis', PRESETS.worker)
    const id = (await members()).find((x) => x.username === 'giannis')!.userId
    await app.inject({
      method: 'POST',
      url: `/api/farms/grove/members/${id}/remove`,
      cookies: owner,
    })

    expect((await sync(worker)).statusCode).toBe(403)
  })
})

describe('a grove of their own', () => {
  it('lets the owner add someone who starts their own grove, once', async () => {
    await addMember({ username: 'nikos', password: 'temporary-1', ownGrove: true })
    const { cookies } = await signIn('nikos', 'temporary-1')
    await changePassword(cookies, 'temporary-1', 'nikos-own-pass')

    expect((await sync(cookies, [], 'grove')).statusCode).toBe(403) // not in Andreas's grove
    expect((await sync(cookies, [], 'nikos-grove')).statusCode).toBe(200)
    expect((await sync(cookies, [], 'second-grove')).statusCode).toBe(403)
  })

  it('is only for the installation owner', async () => {
    const admin = await memberWith('maria', {}, 'admin')
    const response = await addMember(
      { username: 'nikos', password: 'temporary-1', ownGrove: true },
      admin,
    )

    expect(response.statusCode).toBe(403)
  })
})
