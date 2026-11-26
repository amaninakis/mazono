import { DatabaseSync } from 'node:sqlite'

/*
 * The server's SQLite database: accounts, sessions, and every synced record as JSON. Records
 * get an increasing sequence number on every change, so a device can ask for "everything
 * after number N".
 */

const SCHEMA = [
  // Small server settings, such as the setup code while there are no accounts.
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_owner INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS farms (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    user_id TEXT NOT NULL,
    farm_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (user_id, farm_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    device TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    farm_id TEXT NOT NULL,
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (farm_id, tbl, id)
  )`,
  'CREATE INDEX IF NOT EXISTS records_by_seq ON records (farm_id, seq)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
]

export function openDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')

  for (const statement of SCHEMA) {
    database.exec(statement)
  }
  database.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('seq', '0')").run()
  // v0.5b: per-member permissions, and users allowed to start their own grove.
  addColumn(database, 'memberships', 'permissions', "TEXT NOT NULL DEFAULT '{}'")
  addColumn(database, 'users', 'may_create_grove', 'INTEGER NOT NULL DEFAULT 0')

  return database
}

function addColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.some((x) => x.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

/** Next record sequence number (call inside a transaction). */
export function nextSeq(database: DatabaseSync): number {
  const row = database.prepare("SELECT value FROM meta WHERE key = 'seq'").get() as {
    value: string
  }
  const next = Number(row.value) + 1
  database.prepare("UPDATE meta SET value = ? WHERE key = 'seq'").run(String(next))

  return next
}

/** Run `work` in one transaction: all of it is saved, or none of it. */
export function inTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE')

  try {
    const result = work()
    database.exec('COMMIT')

    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

/** A consistent copy of the database to `path` (for the daily backup). */
export function backupTo(database: DatabaseSync, path: string): void {
  database.prepare('VACUUM INTO ?').run(path)
}

export function readMeta(database: DatabaseSync, key: string): string | undefined {
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined

  return row?.value
}

export function writeMeta(database: DatabaseSync, key: string, value: string | undefined) {
  if (value === undefined) {
    database.prepare('DELETE FROM meta WHERE key = ?').run(key)
  } else {
    database
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value)
  }
}
