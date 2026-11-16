import type { AccountInfo } from '../core/syncFormat'
import { reactive } from 'vue'
import { db, onLocalChange } from '../db/db'
import {
  changePassword as changePasswordCall,
  createOwner,
  serverStatus,
  SignedOutError,
  signIn as signInCall,
  signOut as signOutCall,
  syncCall,
  whoAmI,
} from './api'
import { pendingCount, syncFarm } from './engine'

/*
 * Who is signed in, and keeping this device in step with the server.
 *
 * - No server (the app runs on its own): everything stays on the device, as before v0.5.
 * - Server, not signed in: the sign-in (or "create the administrator") screen is shown.
 * - Signed in: changes are sent a moment after they are made, every minute, when the
 *   phone comes back online and when the app is opened again. A signed-in phone keeps
 *   working without signal; its changes wait until it is back online.
 */

type User = AccountInfo['user']

export const account = reactive({
  /**
   * checking: finding out whether there is a server; local: no server; server: there is one.
   */
  mode: 'checking',
  /** The server has no accounts yet: the first person creates the administrator. */
  needsSetup: false,
  user: undefined as User | undefined,
  sync: 'idle',
  /** When the last sync finished (ms), 0 = never on this device. */
  lastSync: 0,
  /** Changes on this device not yet on the server. */
  pending: 0,
})

const ACCOUNT_KEY = 'account'
const SYNC_DELAY = 1500
const SYNC_EVERY = 60_000

async function storedUser(): Promise<User | undefined> {
  const stored = await db.meta.get(ACCOUNT_KEY)
  return stored ? (JSON.parse(stored.value) as User) : undefined
}

async function rememberUser(user: User | undefined) {
  account.user = user
  await (user
    ? db.meta.put({ key: ACCOUNT_KEY, value: JSON.stringify(user) })
    : db.meta.delete(ACCOUNT_KEY))
}

/* ---------- syncing ---------- */

let running: Promise<void> | undefined
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

async function syncEverything(farmIds: string[] = []) {
  const local = (await db.farms.toArray()).map((farm) => farm.id)
  for (const farmId of new Set([...local, ...farmIds])) {
    await syncFarm(db, farmId, syncCall)
  }
  // A new device: open the first farm that came from the server.
  const current = await db.meta.get('currentFarmId')
  const first = (await db.farms.toArray())[0]
  if (!current && first) {
    await db.meta.put({ key: 'currentFarmId', value: first.id })
  }
}

/** Sync now (or right after the sync that is already running). */
export async function syncNow(farmIds?: string[]): Promise<void> {
  if (account.mode !== 'server' || !account.user) {
    return
  }
  if (running) {
    again = true
    await running

    return
  }
  running = (async () => {
    account.sync = 'syncing'

    try {
      do {
        again = false
        await syncEverything(farmIds)
      } while (again)
      account.sync = 'idle'
      account.lastSync = Date.now()
    } catch (error) {
      if (error instanceof SignedOutError) {
        // The session ended (e.g. signed out from another device): ask to sign in again.
        // Nothing is lost: unsent changes stay here and go out after signing in.
        await rememberUser(undefined)
      }
      account.sync = navigator.onLine ? 'error' : 'offline'
    } finally {
      account.pending = await pendingCount(db)
      running = undefined
    }
  })()

  await running
}

function syncSoon() {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), SYNC_DELAY)
  void pendingCount(db).then((count) => (account.pending = count))
}

let listening = false
function startSyncing() {
  if (listening) {
    return
  }
  listening = true
  onLocalChange(syncSoon)
  setInterval(() => void syncNow(), SYNC_EVERY)
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncNow()
    }
  })
}

/* ---------- start, sign in, sign out ---------- */

/** Find out whether there is a server and who is signed in on this device. */
export async function startAccount(): Promise<void> {
  const [status, user] = await Promise.all([serverStatus(), storedUser()])
  account.pending = await pendingCount(db)
  if (!status && !user) {
    account.mode = 'local'
    return
  }
  account.mode = 'server'
  account.needsSetup = status?.needsSetup ?? false
  account.user = user
  if (!user) {
    return
  }
  startSyncing()
  if (!status) {
    account.sync = 'offline' // signed in earlier, server out of reach: keep working
    return
  }

  try {
    const info = await whoAmI()
    await rememberUser(info.user)
    await syncNow(info.farms.map((farm) => farm.id))
  } catch (error) {
    if (error instanceof SignedOutError) {
      await rememberUser(undefined)
    } else {
      account.sync = 'offline'
    }
  }
}

async function afterSignIn(info: AccountInfo) {
  account.needsSetup = false
  await rememberUser(info.user)
  startSyncing()
  await syncNow(info.farms.map((farm) => farm.id))
}

/** Create the first account (the installation owner) and send this device's data. */
export async function createAdministrator(username: string, password: string): Promise<void> {
  await afterSignIn(await createOwner(username, password))
}

export async function signIn(username: string, password: string): Promise<void> {
  await afterSignIn(await signInCall(username, password))
}

export async function changePassword(current: string, next: string): Promise<void> {
  const info = await changePasswordCall(current, next)
  await rememberUser(info.user)
}

/**
 * Sign out and remove this farm's data from the device (it stays on the server). Call
 * syncNow() first; changes still waiting (pendingCount) are lost.
 */
export async function signOut(): Promise<void> {
  await signOutCall().catch(() => undefined)
  await db.delete()
  location.replace('/')
}
