const DEFAULT_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_REQUEST_TIMEOUT_MS = 8000

type FetchBootstrapOptions = {
  attempts?: number
  baseDelayMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
  endpoint?: string
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })

export const fetchAdminBootstrapWithRetry = async <TPayload>(
  options: FetchBootstrapOptions = {},
): Promise<TPayload> => {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)
  const requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
  const signal = options.signal
  const endpoint = options.endpoint ?? '/api/admin/bootstrap'

  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = (await Promise.race([
        fetch(endpoint, {
          signal,
          cache: 'no-store',
        }),
        sleep(requestTimeoutMs, signal).then(() => {
          throw new Error(`Failed to load admin data: request timeout (${requestTimeoutMs}ms)`)
        }),
      ])) as Response
      if (!response.ok) {
        throw new Error(`Failed to load admin data: ${response.status}`)
      }
      return (await response.json()) as TPayload
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }
      lastError = error
      if (attempt < attempts) {
        await sleep(baseDelayMs * attempt, signal)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to load admin data.')
}
