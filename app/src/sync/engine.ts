import type { Access } from '../core/access'
import type { SyncRecord, SyncRequest, SyncResponse, SyncTable } from '../core/syncFormat'
import type { HarvestDB } from '../db/db'
import Dexie from 'dexie'
import { accessSignature, readableTables, writableTables } from '../core/access'
import { rowId, SYNC_TABLES } from '../core/syncFormat'
import { markRemote } from '../db/db'

/*
 * Keeps one farm on this device in step with the server:
 *   1. send every row changed here since the last sync (all rows the first time),
 *   2. receive every row changed on the server since then (including ours, as stored),
 *   3. keep the newer version of each row.
 * The newest change wins; a phone with a wrong clock is corrected by the server.
 */

export type SyncTransport = (request: SyncRequest) => Promise<SyncResponse>

type Row = Record<string, unknown> & { _dirty?: number; updatedAt?: number }

function stateKey(farmId: string) {
  return `sync:${farmId}`
}

/** Last server sequence number this device has for the farm (undefined: never synced). */
export async function syncedSeq(
  database: HarvestDB,
  farmId: string,
): Promise<number | undefined> {
  const stored = await database.meta.get(stateKey(farmId))
  return stored ? Number(stored.value) : undefined
}

async function rowsOfFarm(database: HarvestDB, table: SyncTable, farmId: string) {
  if (table === 'farms') {
    return await database.farms.where('id').equals(farmId).toArray()
  }
  if (table === 'settings') {
    return await database.settings.where('farmId').equals(farmId).toArray()
  }

  return (await database.table(table).where('farmId').equals(farmId).toArray()) as Row[]
}

/** Rows of this farm waiting to be sent (every row if the farm was never synced). */
export async function pendingChanges(
  database: HarvestDB,
  farmId: string,
): Promise<SyncRecord[]> {
  const everything = (await syncedSeq(database, farmId)) === undefined
  const changes: SyncRecord[] = []
  for (const table of SYNC_TABLES) {
    const rows = (await rowsOfFarm(database, table, farmId)) as Row[]
    for (const row of rows) {
      if (!everything && !row._dirty) {
        continue
      }
      const { _dirty: _, ...data } = row
      changes.push({
        table,
        id: rowId(table, data),
        data,
        updatedAt: Number(row.updatedAt ?? 0),
      })
    }
  }

  return changes
}

/** How many changes on this device have not reached the server yet (all farms). */
export async function pendingCount(database: HarvestDB): Promise<number> {
  let count = 0
  for (const table of SYNC_TABLES) {
    count += await database
      .table(table)
      .filter((row: Row) => !!row._dirty)
      .count()
  }

  return count
}

/** Save rows received from the server, keeping a newer local edit when there is one. */
async function applyFromServer(
  database: HarvestDB,
  records: SyncRecord[],
  sent: Map<string, number>,
) {
  const tables = SYNC_TABLES.map((table) => database.table(table))
  await database.transaction('rw', tables, async () => {
    markRemote(Dexie.currentTransaction)

    for (const record of records) {
      const table = database.table(record.table)
      const local = (await table.get(record.id)) as Row | undefined
      const localTime = Number(local?.updatedAt ?? 0)
      const key = `${record.table}:${record.id}`
      // Take the server's version when it is newer, when we have none, or when it is the
      // very change we just sent (the server may have corrected its time).
      if (!local || localTime <= record.updatedAt || sent.get(key) === localTime) {
        await table.put({ ...record.data })
      }
    }
  })
}

export interface SyncResult {
  sent: number
  received: number
}

/**
 * Keep this device within what the person may see and change in the grove: when their access
 * changed, drop the rows they may no longer see and load the grove again from the start; and
 * never send rows they may not change (their "not yet sent" mark is cleared instead).
 */
async function applyAccess(database: HarvestDB, farmId: string, access: Access) {
  const signatureKey = `syncAccess:${farmId}`
  const signature = accessSignature(access)
  const before = (await database.meta.get(signatureKey))?.value
  const readable = readableTables(access)
  const writable = writableTables(access)
  const tables = SYNC_TABLES.map((table) => database.table(table))
  await database.transaction('rw', tables, async () => {
    markRemote(Dexie.currentTransaction)

    for (const table of SYNC_TABLES) {
      if (table === 'farms' || table === 'settings') {
        continue
      }
      const rows = database.table(table).where('farmId').equals(farmId)
      if (!readable.has(table)) {
        await rows.delete()
      } else if (!writable.has(table)) {
        await rows.modify((row: Row) => {
          delete row._dirty
        })
      }
    }
  })
  if (before !== signature) {
    if (before !== undefined) {
      await forgetSync(database, farmId) // load everything they may now see
    }
    await database.meta.put({ key: signatureKey, value: signature })
  }

  return writable
}

export async function syncFarm(
  database: HarvestDB,
  farmId: string,
  transport: SyncTransport,
  access?: Access,
): Promise<SyncResult> {
  const writable = access ? await applyAccess(database, farmId, access) : undefined
  const changes = (await pendingChanges(database, farmId)).filter(
    (change) => !writable || writable.has(change.table),
  )
  const sent = new Map(
    changes.map((change) => [`${change.table}:${change.id}`, change.updatedAt]),
  )
  let since = (await syncedSeq(database, farmId)) ?? 0
  let received = 0
  let first = true
  let more = true
  while (more) {
    const response = await transport({
      farmId,
      since,
      clientNow: Date.now(),
      changes: first ? changes : [],
    })
    first = false
    await applyFromServer(database, response.records, sent)
    received += response.records.length
    since = response.seq
    more = response.more
  }
  await database.meta.put({ key: stateKey(farmId), value: String(since) })

  return { sent: changes.length, received }
}

/** Forget that a farm was synced (e.g. after signing out), so a new sign-in sends it all. */
export async function forgetSync(database: HarvestDB, farmId: string): Promise<void> {
  await database.meta.delete(stateKey(farmId))
}
