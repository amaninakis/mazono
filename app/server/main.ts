import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildServer } from './app.ts'
import { backupName, backupsToRemove } from './backups.ts'
import { backupTo, openDatabase, readMeta, writeMeta } from './database.ts'
import { newSetupCode, setupBanner } from './setup.ts'

/*
 * Starts the Mazono server. Settings (all optional):
 *   PORT         port to listen on (8080)
 *   DATA_DIR     where the database and its daily backups live (/data, or ./data outside Docker)
 *   STATIC_DIR   the built web app (../dist)
 *   MAZONO_PORT  the port people open it on, when Docker publishes it on another one (PORT)
 *   MAZONO_URL   the address people open it at, e.g. https://elies.example.org, shown in the log
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

/**
 * While there are no accounts, the setup code (kept in the database, so it stays the same
 * across restarts) and where to open the app are printed in the log.
 */
const needsSetup =
  (database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number })
    .count === 0
let setupCode = readMeta(database, 'setupCode')
if (needsSetup && !setupCode) {
  setupCode = newSetupCode()
  writeMeta(database, 'setupCode', setupCode)
}
const addressesSeen = new Set<string>()

function setupOpened(address: string) {
  if (!addressesSeen.has(address)) {
    addressesSeen.add(address)
    process.stdout.write(`The setup page was opened at ${address}\n`)
  }
}

function setUp() {
  writeMeta(database, 'setupCode', undefined)
  setupCode = undefined
  process.stdout.write('Mazono is set up: the setup code is no longer needed.\n')
}

async function start() {
  const app = await buildServer({
    database,
    staticDir,
    version: pkg.version,
    setupCode: needsSetup ? setupCode : undefined,
    onSetupOpened: setupOpened,
    onSetUp: setUp,
  })
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
  if (needsSetup && setupCode) {
    process.stdout.write(
      setupBanner({
        code: setupCode,
        port: Number(process.env.MAZONO_PORT || port),
        url: process.env.MAZONO_URL,
      }),
    )
  }
}

void start()
