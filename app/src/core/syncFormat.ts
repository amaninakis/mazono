/*
 * What the app and the server exchange when syncing. Shared by both sides, so it holds no
 * browser or Node code.
 */

/** Tables that sync. `farms` and `settings` have one row per farm; the rest many. */
export const SYNC_TABLES = [
  'farms',
  'settings',
  'fields',
  'units',
  'taskTypes',
  'entries',
  'mills',
  'chargeTypes',
  'locations',
  'extractions',
  'stockMovements',
  'categories',
  'transactions',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/** One record as sent over the wire. `data` is the full row as stored on the device. */
export interface SyncRecord {
  table: SyncTable
  id: string
  data: Record<string, unknown>
  /** ms epoch of the last change (server clock once accepted). */
  updatedAt: number
}

export interface SyncRequest {
  farmId: string
  /** Last server sequence number this device has; 0 for everything. */
  since: number
  /** The device's clock when sending, so the server can correct a wrong phone clock. */
  clientNow: number
  changes: SyncRecord[]
}

export interface SyncResponse {
  /** Server sequence number to send as `since` next time. */
  seq: number
  /** Records changed on the server since `since`, plus any change of ours the server refused
   * because it already had a newer version. */
  records: SyncRecord[]
  /** True when there are more records to fetch (ask again with the new `seq`). */
  more: boolean
}

export interface AccountInfo {
  user: { id: string; username: string; isOwner: boolean; mustChangePassword: boolean }
  farms: { id: string; role: 'admin' }[]
}

/** The id a row is stored under: `farmId` for settings, `id` for everything else. */
export function rowId(table: SyncTable, row: Record<string, unknown>): string {
  return String(table === 'settings' ? row.farmId : row.id)
}

/** Usernames: letters (any language), digits, dot, dash, underscore; 2–40 characters. */
export function isValidUsername(username: string): boolean {
  return /^[\p{L}\p{N}._-]{2,40}$/u.test(username)
}

export const MIN_PASSWORD_LENGTH = 8
