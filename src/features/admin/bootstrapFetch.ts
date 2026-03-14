const DEFAULT_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_REQUEST_TIMEOUT_MS = 8000

interface FetchBootstrapOptions {
  attempts?: number
  baseDelayMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
  endpoint?: string
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

export async function fetchAdminBootstrapWithRetry<TPayload>(options: FetchBootstrapOptions = {}): Promise<TPayload> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)
  const requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
  const signal = options.signal
  const endpoint = options.endpoint ?? '/api/admin/bootstrap'

  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { controller, cleanup } = createAbortController(signal)
    let didTimeout = false
    const timeoutId = setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, requestTimeoutMs)

    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(`Failed to load admin data: ${response.status}`)
      }
      return (await response.json()) as TPayload
    }
    catch (error) {
      if (signal?.aborted) {
        throw error
      }
      lastError = didTimeout
        ? new Error(`Failed to load admin data: request timeout (${requestTimeoutMs}ms)`)
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

  throw lastError instanceof Error ? lastError : new Error('Failed to load admin data.')
}
