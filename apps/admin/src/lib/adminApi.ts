import type {
  AdminAliasesData,
  AdminBootstrapData,
  HomeSuggestionAdminData,
} from '@commission-index/domain'

const DEFAULT_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_REQUEST_TIMEOUT_MS = 8000
const TRAILING_SLASH_PATTERN = /\/+$/
const adminJsonCache = new Map<string, unknown>()

export interface AdminHealthPayload {
  status: string
  message?: string
}

export interface AdminOverviewPayload {
  aliases: AdminAliasesData
  bootstrap: AdminBootstrapData
  health: AdminHealthPayload
  suggestion: HomeSuggestionAdminData
}

interface FetchAdminJsonOptions {
  attempts?: number
  baseDelayMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
}

function trimTrailingSlash(value: string) {
  return value.replace(TRAILING_SLASH_PATTERN, '')
}

export function readCachedAdminJson<TPayload>(cacheKey: string) {
  return (adminJsonCache.get(cacheKey) as TPayload | undefined) ?? null
}

export function writeCachedAdminJson<TPayload>(cacheKey: string, payload: TPayload) {
  adminJsonCache.set(cacheKey, payload)
}

export function getAdminApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.ADMIN_API_BASE_URL?.trim()

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl)
  }

  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:8787'
  }

  return ''
}

export function getAdminApiUrl(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const baseUrl = getAdminApiBaseUrl()

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null

    const onAbort = () => {
      if (timeout !== null) {
        clearTimeout(timeout)
      }
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function createAbortController(signal?: AbortSignal) {
  const controller = new AbortController()

  if (!signal) {
    return {
      controller,
      cleanup: () => {},
    }
  }

  if (signal.aborted) {
    controller.abort(signal.reason)
    return {
      controller,
      cleanup: () => {},
    }
  }

  const onAbort = () => {
    controller.abort(signal.reason)
  }

  signal.addEventListener('abort', onAbort, { once: true })

  return {
    controller,
    cleanup: () => {
      signal.removeEventListener('abort', onAbort)
    },
  }
}

export async function fetchAdminJsonWithRetry<TPayload>(
  pathname: string,
  options: FetchAdminJsonOptions = {},
): Promise<TPayload> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)
  const requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
  const signal = options.signal
  const url = getAdminApiUrl(pathname)

  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { controller, cleanup } = createAbortController(signal)
    let didTimeout = false
    const timeoutId = setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, requestTimeoutMs)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Failed to load ${pathname}: ${response.status}`)
      }

      const payload = (await response.json()) as TPayload
      writeCachedAdminJson(pathname, payload)

      return payload
    }
    catch (error) {
      if (signal?.aborted) {
        throw error
      }

      lastError = didTimeout
        ? new Error(`Failed to load ${pathname}: request timeout (${requestTimeoutMs}ms)`)
        : error

      if (attempt < attempts) {
        await sleep(baseDelayMs * attempt, signal)
      }
    }
    finally {
      clearTimeout(timeoutId)
      cleanup()
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${pathname}.`)
}

export async function triggerRebuildDeploy(signal?: AbortSignal): Promise<{ status: string, message: string, dispatchedAt: string }> {
  const url = getAdminApiUrl('/api/admin/rebuild')
  const response = await fetch(url, {
    method: 'POST',
    signal,
    cache: 'no-store',
  })
  const data = await response.json() as { status: string, message: string, dispatchedAt: string }
  if (!response.ok) {
    throw new Error(data.message || `Rebuild failed: HTTP ${response.status}`)
  }
  return data
}

export async function fetchAdminOverviewPayload(
  options: FetchAdminJsonOptions = {},
): Promise<AdminOverviewPayload> {
  const [health, bootstrap, aliases, suggestion] = await Promise.all([
    fetchAdminJsonWithRetry<AdminHealthPayload>('/api/admin/health', options),
    fetchAdminJsonWithRetry<AdminBootstrapData>('/api/admin/bootstrap', options),
    fetchAdminJsonWithRetry<AdminAliasesData>('/api/admin/aliases/bootstrap', options),
    fetchAdminJsonWithRetry<HomeSuggestionAdminData>('/api/admin/suggestion', options),
  ])

  const payload = {
    aliases,
    bootstrap,
    health,
    suggestion,
  }

  writeCachedAdminJson('/api/admin/overview', payload)

  return payload
}
