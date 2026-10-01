// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBatchRequestQueue } from './batchRequestQueue'

describe('createBatchRequestQueue', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('caps concurrent requests at the specified limit and starts the next when one settles', async () => {
    const queue = createBatchRequestQueue<string>({ concurrency: 2 })
    const fetchSpy = vi.fn()
    const resolvers: Array<(value: string) => void> = []

    const mockFetch = (url: string) => {
      fetchSpy(url)
      return new Promise<string>((resolve) => {
        resolvers.push(resolve)
      })
    }

    const requests = [
      queue.prefetch('url-1', () => mockFetch('url-1')),
      queue.prefetch('url-2', () => mockFetch('url-2')),
      queue.prefetch('url-3', () => mockFetch('url-3')),
      queue.prefetch('url-4', () => mockFetch('url-4')),
    ]

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(fetchSpy).toHaveBeenCalledWith('url-1')
    expect(fetchSpy).toHaveBeenCalledWith('url-2')

    resolvers[0]('response-1')
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3))
    expect(fetchSpy).toHaveBeenCalledWith('url-3')

    resolvers[1]('response-2')
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4))
    expect(fetchSpy).toHaveBeenCalledWith('url-4')

    resolvers[2]('response-3')
    resolvers[3]('response-4')

    const responses = await Promise.all(requests)
    expect(responses).toEqual(['response-1', 'response-2', 'response-3', 'response-4'])
  })

  it('deduplicates requests by URL and returns the same promise', async () => {
    const queue = createBatchRequestQueue<string>({ concurrency: 4 })
    const fetchSpy = vi.fn(async (url: string) => `response-${url}`)

    const request1 = queue.fetch('duplicate', () => fetchSpy('duplicate'))
    const request2 = queue.fetch('duplicate', () => fetchSpy('duplicate'))

    expect(request1).toBe(request2)

    await Promise.all([request1, request2])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('removes failed requests from cache so they can be retried', async () => {
    const queue = createBatchRequestQueue<string>({ concurrency: 4 })
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('first-fail'))
      .mockResolvedValueOnce('second-success')

    await expect(queue.fetch('retry-url', () => fetchSpy())).rejects.toThrow('first-fail')
    await expect(queue.fetch('retry-url', () => fetchSpy())).resolves.toBe('second-success')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('clears all cached requests on reset', async () => {
    const queue = createBatchRequestQueue<string>({ concurrency: 4 })
    const fetchSpy = vi.fn(async (url: string) => `response-${url}`)

    queue.fetch('url-1', () => fetchSpy('url-1'))
    queue.fetch('url-2', () => fetchSpy('url-2'))

    queue.clearForTests()

    queue.fetch('url-1', () => fetchSpy('url-1'))
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3))

    expect(fetchSpy.mock.calls).toEqual([['url-1'], ['url-2'], ['url-1']])
  })
})
