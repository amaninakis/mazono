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
import { pendingCount, syncedSeq, syncFarm } from './engine'
import { chooseCurrentGrove, removeLocalGrove } from './groves'

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
  /**
   * Bringing the account's data to this device right after signing in (or to a device that
   * has none yet). Meanwhile the app shows a loading screen, never the first-time setup, so
   * nobody starts a new, empty grove by mistake.
   */
  loading: 'idle',
  /** Groves of this account on the server. */
  farms: [] as string[],
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
let lastResult = true
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Sync every grove of the account and every grove made on this device, and forget groves
 * that were removed on the server.
 */
async function syncEverything() {
  const info = await whoAmI()
  account.user = info.user
  account.farms = info.farms.map((farm) => farm.id)
  const onServer = new Set(account.farms)
  const toSync = new Set(account.farms)
  for (const farm of await db.farms.toArray()) {
    const syncedBefore = (await syncedSeq(db, farm.id)) !== undefined
    if (onServer.has(farm.id) || !syncedBefore) {
      toSync.add(farm.id) // includes groves new on this device: send them
    } else {
      await removeLocalGrove(db, farm.id) // removed on the server
    }
  }

  for (const farmId of toSync) {
    await syncFarm(db, farmId, syncCall)
  }
  // The open grove was removed: open another one.
  const current = (await db.meta.get('currentFarmId'))?.value
  if (!current || !(await db.farms.get(current))) {
    await chooseCurrentGrove(db)
  }
}

/** Sync now (or right after the sync that is already running). True when it worked. */
export async function syncNow(): Promise<boolean> {
  if (account.mode !== 'server' || !account.user) {
    return false
  }
  if (running) {
    again = true
    await running

    return lastResult
  }
  running = (async () => {
    account.sync = 'syncing'

    try {
      do {
        again = false
        await syncEverything()
      } while (again)
      account.sync = 'idle'
      account.lastSync = Date.now()
      lastResult = true
    } catch (error) {
      lastResult = false
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

  return lastResult
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

/**
 * Sync, showing the loading screen meanwhile when `blocking` (the device has no data yet).
 * If that first load fails, the screen offers to try again.
 */
async function loadData(blocking: boolean) {
  if (blocking) {
    account.loading = 'loading'
  }
  const ok = await syncNow()
  if (ok) {
    // On opening the app or signing in: if the open grove is empty but another one has
    // data (e.g. a grove started by mistake while signing in), open that one.
    await chooseCurrentGrove(db)
  }
  if (blocking) {
    account.loading = ok || !account.user ? 'idle' : 'failed'
  }
}

/** Try the first load again (from the loading screen). */
export async function retryLoad(): Promise<void> {
  await loadData(true)
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
  // A signed-in device without data yet (e.g. its first load failed): load before showing.
  const hasFarm = (await db.farms.count()) > 0
  if (!status) {
    account.sync = 'offline' // signed in earlier, server out of reach: keep working
    account.loading = hasFarm ? 'idle' : 'failed'

    return
  }
  await loadData(!hasFarm)
}

async function afterSignIn(info: AccountInfo) {
  account.needsSetup = false
  account.loading = 'loading'
  await rememberUser(info.user)
  startSyncing()
  await loadData(true)
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
