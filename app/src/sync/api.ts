import type { Access, Permissions, Role } from '../core/access'
import type {
  AccountInfo,
  Member,
  ServerAccount,
  SignedInDevice,
  SyncRequest,
  SyncResponse,
} from '../core/syncFormat'

/* Calls to the Mazono server. All requests go to the same address the app came from. */

/** The server said this device is not signed in (any more). */
export class SignedOutError extends Error {
  public constructor() {
    super('signed-out')
  }
}

/** The server refused a request; `code` is its short reason (e.g. "wrong-credentials"). */
export class ApiError extends Error {
  public readonly code: string
  public readonly status: number

  public constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export interface ServerStatus {
  // The server says which app it serves: "mazono", or the app's first name on servers (and
  // phones) from before the rename. Both are accepted.
  app: 'mazono'
  version: string
  needsSetup: boolean
}

/** Give up on a request after `ms` (AbortSignal.timeout only exists from iOS 16). */
function timeout(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)

  return controller.signal
}

async function call<T>(path: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    signal: timeout(timeoutMs),
  })
  if (response.status === 401 && path !== '/api/login') {
    throw new SignedOutError()
  }
  if (!response.ok) {
    const reason = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(response.status, reason.error ?? `http-${response.status}`)
  }

  return (await response.json()) as T
}

/**
 * Is there a Mazono server behind this app? Undefined when the app runs on its own
 * (e.g. `npm run dev` without the server) or the server cannot be reached right now.
 */
export async function serverStatus(): Promise<ServerStatus | undefined> {
  if (!navigator.onLine) {
    return undefined
  }

  try {
    const status = await call<ServerStatus>('/api/status', undefined, 5000)
    return status?.app === 'mazono' ? status : undefined
  } catch {
    return undefined
  }
}

export async function createOwner(username: string, password: string, setupCode: string) {
  return await call<AccountInfo>('/api/setup', { username, password, setupCode })
}

export async function signIn(username: string, password: string) {
  return await call<AccountInfo>('/api/login', { username, password })
}

export async function signOut() {
  return await call<{ ok: boolean }>('/api/logout', {})
}

export async function whoAmI() {
  return await call<AccountInfo>('/api/me')
}

export async function changePassword(current: string, next: string) {
  return await call<AccountInfo>('/api/password', { current, next })
}

export async function syncCall(request: SyncRequest) {
  return await call<SyncResponse>('/api/sync', request, 60_000)
}

/** Remove a grove that holds no data (refused with "not-empty" otherwise). */
export async function removeFarm(farmId: string) {
  return await call<{ ok: boolean }>(`/api/farms/${encodeURIComponent(farmId)}/remove`, {})
}

/* ---------- people in a grove (administrators) ---------- */

export interface NewMember {
  username: string
  password: string
  role: Role
  permissions: Permissions
  /** Installation owner only: they start a grove of their own instead of joining this one. */
  ownGrove?: boolean
}

export async function listMembers(farmId: string) {
  return await call<Member[]>(`/api/farms/${encodeURIComponent(farmId)}/members`)
}

/** `existingAccount`: they already had an account, so their own password stays. */
export async function addMember(farmId: string, member: NewMember) {
  return await call<{ members: Member[]; existingAccount: boolean }>(
    `/api/farms/${encodeURIComponent(farmId)}/members`,
    member,
  )
}

export async function updateMember(farmId: string, userId: string, access: Access) {
  return await call<Member[]>(
    `/api/farms/${encodeURIComponent(farmId)}/members/${encodeURIComponent(userId)}`,
    access,
  )
}

export async function resetMemberPassword(farmId: string, userId: string, password: string) {
  return await call<Member[]>(
    `/api/farms/${encodeURIComponent(farmId)}/members/${encodeURIComponent(userId)}/password`,
    { password },
  )
}

export async function removeMember(farmId: string, userId: string) {
  return await call<Member[]>(
    `/api/farms/${encodeURIComponent(farmId)}/members/${encodeURIComponent(userId)}/remove`,
    {},
  )
}

/* ---------- every account, for the installation owner ---------- */

export async function listDevices() {
  return await call<SignedInDevice[]>('/api/sessions')
}

export async function signOutDevice(id: string) {
  return await call<{ ok: boolean }>(`/api/sessions/${id}/sign-out`, {})
}

export async function listAccounts() {
  return await call<ServerAccount[]>('/api/accounts')
}

export async function resetAccountPassword(userId: string, password: string) {
  return await call<ServerAccount[]>(`/api/accounts/${encodeURIComponent(userId)}/password`, {
    password,
  })
}

export async function removeAccount(userId: string) {
  return await call<ServerAccount[]>(`/api/accounts/${encodeURIComponent(userId)}/remove`, {})
}
