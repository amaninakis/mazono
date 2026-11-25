import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildServer } from './app.ts'
import { backupName, backupsToRemove } from './backups.ts'
import { backupTo, openDatabase } from './database.ts'

/*
 * Starts the Mazono server. Settings (all optional):
 *   PORT        port to listen on (8080)
 *   DATA_DIR    where the database and its daily backups live (/data, or ./data outside Docker)
 *   STATIC_DIR  the built web app (../dist)
 */

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 8080)
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', 'data'))
const staticDir = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'))
const backupDir = join(dataDir, 'backups')

mkdirSync(backupDir, { recursive: true })
const databaseFile = join(dataDir, 'mazono.db')
const database = openDatabase(databaseFile)
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
  version: string
}

/** One copy of the database a day, keeping the last two weeks (server/backups.ts). */
function dailyBackup() {
  const name = backupName(new Date())
  const files = readdirSync(backupDir)
  if (!files.includes(name)) {
    backupTo(database, join(backupDir, name))
    files.push(name)
  }

  for (const old of backupsToRemove(files)) {
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
  process.stdout.write(`Mazono ${pkg.version} on port ${port}, data in ${databaseFile}\n`)
}

void start()
