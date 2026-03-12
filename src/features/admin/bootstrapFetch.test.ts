import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAdminBootstrapWithRetry } from './bootstrapFetch'

describe('fetchAdminBootstrapWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts timed-out requests before starting the next retry', async () => {
    let activeRequests = 0
    let maxConcurrentRequests = 0

    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init?: RequestInit) => {
        activeRequests += 1
        maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests)

        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!(signal instanceof AbortSignal)) {
            reject(new Error('Missing abort signal'))
            return
          }

          signal.addEventListener(
            'abort',
            () => {
              activeRequests -= 1
              reject(new DOMException('Aborted', 'AbortError'))
            },
            { once: true },
          )
        })
      }),
    )

    const promise = fetchAdminBootstrapWithRetry({
      attempts: 2,
      baseDelayMs: 0,
      requestTimeoutMs: 1000,
    })
    const rejection = expect(promise).rejects.toThrow(
      'Failed to load admin data: request timeout (1000ms)',
    )

    await vi.advanceTimersByTimeAsync(2500)

    await rejection
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(maxConcurrentRequests).toBe(1)
  })
})
