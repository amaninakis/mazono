import type { AccountInfo, SyncRequest, SyncResponse } from '../core/syncFormat'

/* Calls to the HarvestLog server. All requests go to the same address the app came from. */

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
  app: 'harvestlog'
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
 * Is there a HarvestLog server behind this app? Undefined when the app runs on its own
 * (e.g. `npm run dev` without the server) or the server cannot be reached right now.
 */
export async function serverStatus(): Promise<ServerStatus | undefined> {
  if (!navigator.onLine) {
    return undefined
  }

  try {
    const status = await call<ServerStatus>('/api/status', undefined, 5000)
    return status?.app === 'harvestlog' ? status : undefined
  } catch {
    return undefined
  }
}

export async function createOwner(username: string, password: string) {
  return await call<AccountInfo>('/api/setup', { username, password })
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
