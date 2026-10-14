// Small fetch client for the Django API with JWT (access + refresh) support.

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const TOKENS_KEY = 'esports.tokens'

export interface Tokens {
  access: string
  refresh: string
}

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

export function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

export function saveTokens(tokens: Tokens | null) {
  try {
    if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(TOKENS_KEY)
  } catch {
    // Storage blocked (private mode): the session lives only in memory.
  }
  tokenListeners.forEach((listener) => listener(tokens))
}

const tokenListeners = new Set<(tokens: Tokens | null) => void>()

export function onTokensChange(listener: (tokens: Tokens | null) => void) {
  tokenListeners.add(listener)
  return () => {
    tokenListeners.delete(listener)
  }
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

let refreshing: Promise<boolean> | null = null

async function refreshAccess(): Promise<boolean> {
  const tokens = loadTokens()
  if (!tokens) return false
  refreshing ??= fetch(`${BASE_URL}/api/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: tokens.refresh }),
  })
    .then(async (response) => {
      if (!response.ok) {
        // Another tab may have rotated the refresh token first: use its new
        // tokens instead of logging out.
        const current = loadTokens()
        if (current && current.refresh !== tokens.refresh) return true
        saveTokens(null)
        return false
      }
      // The refresh token rotates: the old one is blacklisted on the server.
      const data = (await response.json()) as { access: string; refresh?: string }
      saveTokens({ access: data.access, refresh: data.refresh ?? tokens.refresh })
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
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
  const tokens = loadTokens()
  if (auth && tokens) headers.Authorization = `Bearer ${tokens.access}`

  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, params), { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  if (response.status === 401 && auth && tokens && retry) {
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
