import type { Access } from '../core/access'
import type { AccountInfo } from '../core/syncFormat'
import { reactive } from 'vue'
import { PRESETS } from '../core/access'
import { localDb, onLocalChange } from '../db/db'
import {
  ApiError,
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
type GroveAccess = AccountInfo['farms'][number]

interface AccountState {
  /** checking: finding out whether there is a server; local: no server; server: there is. */
  mode: 'checking' | 'local' | 'server'
  /** The server has no accounts yet: the first person creates the administrator. */
  needsSetup: boolean
  user: User | undefined
  sync: 'idle' | 'syncing' | 'offline' | 'error'
  /** When the last sync finished (ms), 0 = never on this device. */
  lastSync: number
  /** Changes on this device not yet on the server. */
  pending: number
  /**
   * Bringing the account's data to this device right after signing in (or to a device that
   * has none yet). Meanwhile the app shows a loading screen, never the first-time setup, so
   * nobody starts a new, empty grove by mistake.
   */
  loading: 'idle' | 'loading' | 'failed'
  /** The groves of this account on the server, with this person's role and permissions. */
  farms: GroveAccess[]
  /**
   * The temporary password just used to sign in (to set a new one without typing it again).
   */
  temporaryPassword: string
}

export const account = reactive<AccountState>({
  mode: 'checking',
  needsSetup: false,
  user: undefined,
  sync: 'idle',
  lastSync: 0,
  pending: 0,
  loading: 'idle',
  farms: [],
  temporaryPassword: '',
})

/** This person's access to a grove; full access without a server (the app on its own). */
export function accessTo(farmId: string | undefined): Access | undefined {
  if (account.mode !== 'server') {
    return { role: 'admin', permissions: PRESETS.family }
  }
  const grove = account.farms.find((farm) => farm.id === farmId)
  if (grove) {
    return grove
  }

  // A grove made on this device, not yet on the server: whoever made it runs it.
  return farmId && account.user?.mayCreateGrove
    ? { role: 'admin', permissions: PRESETS.family }
    : undefined
}

const ACCOUNT_KEY = 'account'
const SYNC_DELAY = 1500
const SYNC_EVERY = 60_000

/** Who is signed in and their groves, kept on the device so it also works offline. */
async function storedAccount(): Promise<{ user: User; farms: GroveAccess[] } | undefined> {
  const stored = await localDb().meta.get(ACCOUNT_KEY)
  if (!stored) {
    return undefined
  }
  const value = JSON.parse(stored.value) as {
    user?: User
    farms?: GroveAccess[]
  } & Partial<User>

  // Before v0.5b only the user was stored.
  return value.user
    ? { user: value.user, farms: value.farms ?? [] }
    : { user: value as User, farms: [] }
}

async function rememberAccount(user: User | undefined, farms: GroveAccess[] = account.farms) {
  account.user = user
  account.farms = farms
  await (user
    ? localDb().meta.put({ key: ACCOUNT_KEY, value: JSON.stringify({ user, farms }) })
    : localDb().meta.delete(ACCOUNT_KEY))
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
  await rememberAccount(info.user, info.farms)
  if (info.user.mustChangePassword) {
    throw new ApiError(403, 'change-password')
  }
  const onServer = new Set(info.farms.map((farm) => farm.id))
  const toSync = new Set(onServer)
  for (const farm of await localDb().farms.toArray()) {
    const syncedBefore = (await syncedSeq(localDb(), farm.id)) !== undefined
    if (onServer.has(farm.id) || !syncedBefore) {
      toSync.add(farm.id) // includes groves new on this device: send them
    } else {
      await removeLocalGrove(localDb(), farm.id) // removed on the server
    }
  }

  for (const farmId of toSync) {
    await syncFarm(localDb(), farmId, syncCall, accessTo(farmId))
  }
  // The open grove was removed: open another one.
  const current = (await localDb().meta.get('currentFarmId'))?.value
  if (!current || !(await localDb().farms.get(current))) {
    await chooseCurrentGrove(localDb())
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
        await rememberAccount(undefined)
      }
      account.sync = navigator.onLine ? 'error' : 'offline'
    } finally {
      account.pending = await pendingCount(localDb())
      running = undefined
    }
  })()
  await running

  return lastResult
}

function syncSoon() {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), SYNC_DELAY)
  void pendingCount(localDb()).then((count) => (account.pending = count))
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
    await chooseCurrentGrove(localDb())
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
  const [status, stored] = await Promise.all([serverStatus(), storedAccount()])
  const user = stored?.user
  account.pending = await pendingCount(localDb())
  if (!status && !user) {
    account.mode = 'local'
    return
  }
  account.mode = 'server'
  account.needsSetup = status?.needsSetup ?? false
  account.user = user
  account.farms = stored?.farms ?? []
  if (!user) {
    return
  }
  startSyncing()
  // A signed-in device without data yet (e.g. its first load failed): load before showing.
  const hasFarm = (await localDb().farms.count()) > 0
  if (!status) {
    account.sync = 'offline' // signed in earlier, server out of reach: keep working
    account.loading = hasFarm ? 'idle' : 'failed'

    return
  }
  await loadData(!hasFarm)
}

async function afterSignIn(info: AccountInfo, password: string) {
  account.needsSetup = false
  await rememberAccount(info.user, info.farms)
  startSyncing()
  if (info.user.mustChangePassword) {
    // First sign-in with a temporary password: the new-password screen comes first.
    account.temporaryPassword = password
    return
  }
  await loadData(true)
}

/** Create the first account (the installation owner) and send this device's data. */
export async function createAdministrator(username: string, password: string): Promise<void> {
  await afterSignIn(await createOwner(username, password), password)
}

export async function signIn(username: string, password: string): Promise<void> {
  await afterSignIn(await signInCall(username, password), password)
}

export async function changePassword(current: string, next: string): Promise<void> {
  const wasTemporary = !!account.user?.mustChangePassword
  const info = await changePasswordCall(current, next)
  account.temporaryPassword = ''
  await rememberAccount(info.user, info.farms)
  if (wasTemporary) {
    await loadData(true) // now their data may come
  }
}

/**
 * Sign out and remove this farm's data from the device (it stays on the server). Call
 * syncNow() first; changes still waiting (pendingCount) are lost.
 */
export async function signOut(): Promise<void> {
  await signOutCall().catch(() => undefined)
  await localDb().delete()
  location.replace('/')
}
