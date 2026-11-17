import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildServer } from './app.ts'
import { backupTo, openDatabase } from './database.ts'

/*
 * Starts the HarvestLog server. Settings (all optional):
 *   PORT        port to listen on (8080)
 *   DATA_DIR    where the database and its daily backups live (/data, or ./data outside Docker)
 *   STATIC_DIR  the built web app (../dist)
 */

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 8080)
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', 'data'))
const staticDir = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'))
const backupDir = join(dataDir, 'backups')
/** Daily copies kept before the oldest is removed. */
const BACKUPS_KEPT = 14

mkdirSync(backupDir, { recursive: true })
const database = openDatabase(join(dataDir, 'harvestlog.db'))
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
  version: string
}

/** One backup per day (harvestlog-2026-11-16.db), keeping the last two weeks. */
function dailyBackup() {
  const today = new Date().toISOString().slice(0, 10)
  const name = `harvestlog-${today}.db`
  const existing = readdirSync(backupDir).filter((file) => /^harvestlog-.*\.db$/.test(file))
  if (!existing.includes(name)) {
    backupTo(database, join(backupDir, name))
    existing.push(name)
  }

  for (const old of existing.sort().slice(0, -BACKUPS_KEPT)) {
    rmSync(join(backupDir, old))
  }
}

async function start() {
  const app = await buildServer({ database, staticDir, version: pkg.version })
  dailyBackup()
  setInterval(dailyBackup, 60 * 60_000).unref()

  function stop() {
    void app.close().then(() => {
      database.close()
      process.exit(0)
    })
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)

  await app.listen({ port, host: '0.0.0.0' })
  process.stdout.write(`HarvestLog ${pkg.version} on port ${port}, data in ${dataDir}\n`)
}

void start()
