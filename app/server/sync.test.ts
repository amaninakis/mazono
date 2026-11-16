import type { SyncRequest, SyncResponse } from '../src/core/syncFormat.ts'
import type { SyncTransport } from '../src/sync/engine.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarvestDB } from '../src/db/db.ts'
import { createFarm } from '../src/db/repo.ts'
import { pendingCount, syncFarm } from '../src/sync/engine.ts'
import { buildServer, SESSION_COOKIE } from './app.ts'
import { openDatabase } from './database.ts'

/* Two "phones" (two local databases) kept in step through a real server in memory. */

let server: Awaited<ReturnType<typeof buildServer>>
let transport: SyncTransport
let deviceNumber = 0
/** How far the server's clock is from the phones' (to test a wrong phone clock). */
let serverClockOffset = 0

function newDevice() {
  deviceNumber += 1
  return new HarvestDB(`device-${deviceNumber}-${Math.random()}`)
}

beforeEach(async () => {
  // The server reads the phones' clock (plus an offset), so tests can move time forward.
  serverClockOffset = 0
  server = await buildServer({
    database: openDatabase(':memory:'),
    now: () => Date.now() + serverClockOffset,
  })
  const setup = await server.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { username: 'andreas', password: 'olive-grove-1' },
  })
  const token = setup.cookies.find((cookie) => cookie.name === SESSION_COOKIE)!.value

  transport = async (request: SyncRequest) => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/sync',
      cookies: { [SESSION_COOKIE]: token },
      payload: request,
    })

    return response.json<SyncResponse>()
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('two devices', () => {
  it('sends a farm made on one phone to another', async () => {
    const phone = newDevice()
    const repo = await createFarm('Grove', 'el', phone)
    await repo.addField({ name: 'Upper', trees: 28, archived: false, order: 0 })
    await repo.updateSettings({ setupDone: true })
    const first = await syncFarm(phone, repo.farmId, transport)

    expect(first.sent).toBeGreaterThan(10)
    expect(await pendingCount(phone)).toBe(0)

    const tablet = newDevice()
    await syncFarm(tablet, repo.farmId, transport)

    expect((await tablet.farms.get(repo.farmId))?.name).toBe('Grove')
    expect((await tablet.settings.get(repo.farmId))?.setupDone).toBe(true)
    expect((await tablet.fields.toArray()).map((field) => field.name)).toEqual(['Upper'])
    expect(await pendingCount(tablet)).toBe(0)
  })

  it('passes edits and deletions both ways', async () => {
    const phone = newDevice()
    const repo = await createFarm('Grove', 'el', phone)
    const upper = await repo.addField({ name: 'Upper', trees: 28, archived: false, order: 0 })
    await syncFarm(phone, repo.farmId, transport)
    const tablet = newDevice()
    await syncFarm(tablet, repo.farmId, transport)

    await tablet.fields.update(upper.id, { name: 'Upper grove', updatedAt: Date.now() })

    expect(await pendingCount(tablet)).toBe(1)
    await syncFarm(tablet, repo.farmId, transport)
    await syncFarm(phone, repo.farmId, transport)

    expect((await phone.fields.get(upper.id))?.name).toBe('Upper grove')

    await repo.softDelete('fields', upper.id)
    await syncFarm(phone, repo.farmId, transport)
    await syncFarm(tablet, repo.farmId, transport)

    expect((await tablet.fields.get(upper.id))?.deletedAt).toBeTypeOf('number')
  })

  it('keeps the later edit when both phones change the same record', async () => {
    const phone = newDevice()
    const repo = await createFarm('Grove', 'el', phone)
    const field = await repo.addField({ name: 'Upper', trees: 28, archived: false, order: 0 })
    await syncFarm(phone, repo.farmId, transport)
    const tablet = newDevice()
    await syncFarm(tablet, repo.farmId, transport)

    // The phone edits first, the tablet ten seconds later; then both sync.
    const start = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start + 10_000)
    await phone.fields.update(field.id, { trees: 30, updatedAt: Date.now() })
    vi.setSystemTime(start + 20_000)
    await tablet.fields.update(field.id, { trees: 31, updatedAt: Date.now() })
    vi.setSystemTime(start + 30_000)
    await syncFarm(tablet, repo.farmId, transport)
    await syncFarm(phone, repo.farmId, transport) // phone's older edit is refused
    await syncFarm(tablet, repo.farmId, transport)

    expect((await phone.fields.get(field.id))?.trees).toBe(31)
    expect((await tablet.fields.get(field.id))?.trees).toBe(31)
    expect(await pendingCount(phone)).toBe(0)
  })

  it('does not resend forever when the phone clock is ahead', async () => {
    const phone = newDevice()
    const repo = await createFarm('Grove', 'el', phone)
    await syncFarm(phone, repo.farmId, transport)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 3_600_000) // phone 2 hours ahead…
    serverClockOffset = -2 * 3_600_000 // …of the server
    const late = await repo.addField({ name: 'Late', trees: 5, archived: false, order: 1 })

    expect(await pendingCount(phone)).toBe(1)
    await syncFarm(phone, repo.farmId, transport)

    expect(await pendingCount(phone)).toBe(0)
    // Stored with the server's time, so it does not beat later edits from other phones.
    expect((await phone.fields.get(late.id))!.updatedAt).toBeLessThanOrEqual(
      Date.now() + serverClockOffset,
    )
  })

  it('uploads data entered before the server existed', async () => {
    const phone = newDevice()
    const repo = await createFarm('Old grove', 'el', phone)
    await repo.addField({ name: 'Upper', trees: 28, archived: false, order: 0 })
    // Rows from before change tracking existed carry no "not yet sent" mark.
    await phone.fields.toCollection().modify((row) => {
      delete (row as { _dirty?: number })._dirty
    })
    await syncFarm(phone, repo.farmId, transport)
    const tablet = newDevice()
    await syncFarm(tablet, repo.farmId, transport)

    expect((await tablet.fields.toArray()).map((field) => field.name)).toEqual(['Upper'])
  })
})
