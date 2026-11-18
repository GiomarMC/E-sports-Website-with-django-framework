const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export type FieldErrors = Record<string, string>

export class ApiError extends Error {
  status: number
  fields: FieldErrors

  constructor(status: number, message: string, fields: FieldErrors = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

// ------------------------------------------------------------- session
// The refresh token lives in an HttpOnly cookie that only the server can
// read (an injected script cannot steal it). The access token (15 minutes)
// lives only in memory: reloading the page asks for a new one with the
// cookie (``refreshAccess``).

let accessToken: string | null = null
const accessListeners = new Set<(token: string | null) => void>()

// Not secret: only says "there may be a session cookie", so public visitors
// do not ask the server for a session on every page.
const SESSION_HINT_KEY = 'esports.session'
// Older versions kept both tokens here: remove them.
const LEGACY_TOKENS_KEY = 'esports.tokens'

function storage(action: (store: Storage) => void) {
  try {
    action(localStorage)
  } catch {
    // Storage blocked (private mode): the hint just does not persist.
  }
}

storage((store) => store.removeItem(LEGACY_TOKENS_KEY))

export function hasAccessToken() {
  return accessToken !== null
}

export function setAccessToken(token: string | null) {
  accessToken = token
  storage((store) => (token ? store.setItem(SESSION_HINT_KEY, '1') : store.removeItem(SESSION_HINT_KEY)))
  accessListeners.forEach((listener) => listener(token))
}

export function onAccessTokenChange(listener: (token: string | null) => void) {
  accessListeners.add(listener)
  return () => {
    accessListeners.delete(listener)
  }
}

export function mayHaveSession() {
  let hint = false
  storage((store) => (hint = store.getItem(SESSION_HINT_KEY) === '1'))
  return hint
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let refreshing: Promise<boolean> | null = null

/** New access token from the session cookie. The cookie rotates on every
 * refresh: if another tab rotated it at the same moment the first try
 * fails, and the second one uses the cookie the browser already updated. */
export function refreshAccess(): Promise<boolean> {
  refreshing ??= (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response
      try {
        response = await fetch(`${BASE_URL}/api/token/refresh/`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        })
      } catch {
        return false // Offline: keep the session, the next request retries.
      }
      if (response.ok) {
        const data = (await response.json()) as { access: string }
        setAccessToken(data.access)
        return true
      }
      if (response.status !== 401) break
      if (attempt === 0) await wait(400)
    }
    setAccessToken(null)
    return false
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** Ends the session on the server (blacklists the cookie token). */
export async function endSession() {
  setAccessToken(null)
  await fetch(`${BASE_URL}/api/token/logout/`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).join(' ')
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(flatten).join(' ')
  }
  return String(value ?? '')
}

/** Converts a DRF error body into a message + errors per field. */
export function parseErrorBody(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const entries = Object.entries(body as Record<string, unknown>)
    const fields: FieldErrors = {}
    for (const [key, value] of entries) fields[key] = flatten(value)
    const general = fields.detail || fields.non_field_errors || fields.error
    const message = general || entries.map(([, value]) => flatten(value)).join(' ') || 'Error'
    return new ApiError(status, message, fields)
  }
  if (Array.isArray(body)) return new ApiError(status, flatten(body))
  return new ApiError(status, status >= 500 ? 'Error del servidor. Intenta de nuevo.' : 'Error')
}

export interface RequestOptions {
  method?: string
  body?: unknown
  params?: Record<string, string | number | boolean | null | undefined>
  auth?: boolean
}

function buildUrl(path: string, params?: RequestOptions['params']) {
  const url = new URL(`${BASE_URL}/api/${path.replace(/^\//, '')}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function api<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { method = 'GET', body, params, auth = true } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = accessToken
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, params), { method, headers, body: payload, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  if (response.status === 401 && auth && token && retry) {
    if (await refreshAccess()) return api<T>(path, options, false)
  }
  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw parseErrorBody(response.status, data)
  return data as T
}

/** Builds a FormData skipping undefined values; File/Blob values are sent as files. */
export function toFormData(values: Record<string, unknown>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    if (value instanceof Blob) form.append(key, value)
    else if (typeof value === 'object') form.append(key, JSON.stringify(value))
    else form.append(key, String(value))
  }
  return form
}
