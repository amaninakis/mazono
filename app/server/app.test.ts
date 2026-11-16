import type { AccountInfo, SyncResponse } from '../src/core/syncFormat.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildServer, SESSION_COOKIE } from './app.ts'
import { openDatabase } from './database.ts'

let clock = 1_800_000_000_000
let app: Awaited<ReturnType<typeof buildServer>>

beforeEach(async () => {
  clock = 1_800_000_000_000
  app = await buildServer({ database: openDatabase(':memory:'), now: () => clock })
})

function cookieOf(response: { cookies: { name: string; value: string }[] }) {
  const cookies: Record<string, string> = {}
  const cookie = response.cookies.find((x) => x.name === SESSION_COOKIE)
  if (cookie) {
    cookies[SESSION_COOKIE] = cookie.value
  }

  return cookies
}

async function setUp(username = 'andreas', password = 'olive-grove-1') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { username, password },
  })

  return { response, cookies: cookieOf(response) }
}

function field(id: string, farmId: string, name: string, updatedAt: number) {
  return {
    table: 'fields' as const,
    id,
    updatedAt,
    data: { id, farmId, name, trees: 10, archived: false, order: 0, updatedAt },
  }
}

describe('first account', () => {
  it('needs setup until the owner account exists', async () => {
    expect((await app.inject('/api/status')).json()).toMatchObject({ needsSetup: true })
    const { response } = await setUp()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      user: { username: 'andreas', isOwner: true },
      farms: [],
    })

    expect((await app.inject('/api/status')).json()).toMatchObject({ needsSetup: false })
  })

  it('cannot be created twice', async () => {
    await setUp()

    expect((await setUp('someone', 'another-pass')).response.statusCode).toBe(409)
  })

  it('checks the username and password length', async () => {
    expect((await setUp('a', 'olive-grove-1')).response.statusCode).toBe(400)
    expect((await setUp('andreas', 'short')).response.statusCode).toBe(400)
  })
})

describe('signing in', () => {
  it('works with the right password (any letter case in the username)', async () => {
    await setUp('Andreas')
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'andreas', password: 'olive-grove-1' },
    })

    expect(response.statusCode).toBe(200)
    const me = await app.inject({ url: '/api/me', cookies: cookieOf(response) })

    expect(me.json<AccountInfo>().user.username).toBe('Andreas')
  })

  it('refuses a wrong password, and slows down guessing', async () => {
    await setUp()

    for (let i = 0; i < 10; i++) {
      const wrong = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'andreas', password: `guess-${i}` },
      })

      expect(wrong.statusCode).toBe(401)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'andreas', password: 'olive-grove-1' },
    })

    expect(blocked.statusCode).toBe(429)
    clock += 16 * 60_000
    const later = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'andreas', password: 'olive-grove-1' },
    })

    expect(later.statusCode).toBe(200)
  })

  it('stays signed in for 90 days of not using it, and signs out', async () => {
    const { cookies } = await setUp()
    clock += 60 * 86_400_000

    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(200)
    clock += 89 * 86_400_000

    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(200)
    await app.inject({ method: 'POST', url: '/api/logout', cookies })

    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(401)
  })

  it('changes the password', async () => {
    const { cookies } = await setUp()
    const changed = await app.inject({
      method: 'POST',
      url: '/api/password',
      cookies,
      payload: { current: 'olive-grove-1', next: 'new-password-2' },
    })

    expect(changed.statusCode).toBe(200)
    const old = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'andreas', password: 'olive-grove-1' },
    })

    expect(old.statusCode).toBe(401)
  })
})

describe('sync', () => {
  async function sync(cookies: Record<string, string>, body: object) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sync',
      cookies,
      payload: body,
    })

    return { status: response.statusCode, body: response.json<SyncResponse>() }
  }

  it('needs a signed-in user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sync',
      payload: { farmId: 'f1', since: 0, clientNow: clock, changes: [] },
    })

    expect(response.statusCode).toBe(401)
  })

  it('stores changes and sends them to another device', async () => {
    const { cookies } = await setUp()
    const first = await sync(cookies, {
      farmId: 'f1',
      since: 0,
      clientNow: clock,
      changes: [field('a', 'f1', 'Upper', clock - 5), field('b', 'f1', 'Lower', clock - 4)],
    })

    expect(first.status).toBe(200)
    expect(first.body.records.map((x) => x.id)).toEqual(['a', 'b'])
    const me = await app.inject({ url: '/api/me', cookies })

    expect(me.json<AccountInfo>().farms).toEqual([{ id: 'f1', role: 'admin' }])

    const other = await sync(cookies, {
      farmId: 'f1',
      since: 0,
      clientNow: clock,
      changes: [],
    })

    expect(other.body.records.map((x) => x.data.name)).toEqual(['Upper', 'Lower'])
    const nothingNew = await sync(cookies, {
      farmId: 'f1',
      since: other.body.seq,
      clientNow: clock,
      changes: [],
    })

    expect(nothingNew.body.records).toEqual([])
  })

  it('keeps the newest change when two devices edit the same record', async () => {
    const { cookies } = await setUp()
    await sync(cookies, {
      farmId: 'f1',
      since: 0,
      clientNow: clock,
      changes: [field('a', 'f1', 'New', clock - 10)],
    })
    const stale = await sync(cookies, {
      farmId: 'f1',
      since: 99,
      clientNow: clock,
      changes: [field('a', 'f1', 'Old', clock - 1000)],
    })
    // The older edit is refused and the server's version comes back.
    expect(stale.body.records.map((record) => [record.id, record.data.name])).toEqual([
      ['a', 'New'],
    ])
  })

  it('corrects a phone clock that is far off', async () => {
    const { cookies } = await setUp()
    const phoneNow = clock - 3 * 3_600_000 // phone is 3 hours behind
    const result = await sync(cookies, {
      farmId: 'f1',
      since: 0,
      clientNow: phoneNow,
      changes: [field('a', 'f1', 'Upper', phoneNow - 1000)],
    })

    expect(result.body.records[0].updatedAt).toBe(clock - 1000)
  })

  it('ignores records that belong to another farm or table', async () => {
    const { cookies } = await setUp()
    const result = await sync(cookies, {
      farmId: 'f1',
      since: 0,
      clientNow: clock,
      changes: [
        field('a', 'other-farm', 'Sneaky', clock),
        { ...field('b', 'f1', 'X', clock), table: 'users' },
      ],
    })

    expect(result.body.records).toEqual([])
  })
})

describe('removing a grove', () => {
  async function prepare() {
    const { cookies } = await setUp()
    async function sync(farmId: string, changes: object[]) {
      return await app.inject({
        method: 'POST',
        url: '/api/sync',
        cookies,
        payload: { farmId, since: 0, clientNow: clock, changes },
      })
    }

    function settings(farmId: string) {
      return {
        table: 'settings',
        id: farmId,
        updatedAt: clock,
        data: { farmId, language: 'el', updatedAt: clock },
      }
    }
    await sync('empty', [settings('empty')])
    await sync('real', [settings('real'), field('a', 'real', 'Upper', clock)])

    async function remove(farmId: string) {
      return await app.inject({ method: 'POST', url: `/api/farms/${farmId}/remove`, cookies })
    }

    async function farms() {
      return (await app.inject({ url: '/api/me', cookies }))
        .json<AccountInfo>()
        .farms.map((x) => x.id)
    }

    return { remove, farms }
  }

  it('removes a grove with no data', async () => {
    const { remove, farms } = await prepare()

    expect((await remove('empty')).statusCode).toBe(200)
    expect(await farms()).toEqual(['real'])
  })

  it('never removes a grove that holds data', async () => {
    const { remove, farms } = await prepare()

    expect((await remove('real')).statusCode).toBe(409)
    expect(await farms()).toContain('real')
  })

  it('only lets members remove a grove', async () => {
    const { remove } = await prepare()

    expect((await remove('someone-elses')).statusCode).toBe(403)
  })
})
