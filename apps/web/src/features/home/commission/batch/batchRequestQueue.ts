export const BATCH_PREFETCH_CONCURRENCY = 4

interface CreateBatchRequestQueueOptions {
  concurrency?: number
}

interface PendingRequest {
  run: () => void
}

export function createBatchRequestQueue<T>({
  concurrency = BATCH_PREFETCH_CONCURRENCY,
}: CreateBatchRequestQueueOptions = {}) {
  const requestCache = new Map<string, Promise<T>>()
  const pendingRequests: PendingRequest[] = []
  let activeRequestCount = 0

  const drainQueue = () => {
    while (activeRequestCount < concurrency && pendingRequests.length > 0) {
      const request = pendingRequests.shift()
      if (!request)
        return

      activeRequestCount += 1
      request.run()
    }
  }

  const fetch = (url: string, load: () => Promise<T>) => {
    const cachedRequest = requestCache.get(url)
    if (cachedRequest)
      return cachedRequest

    const request = Promise.resolve()
      .then(load)
      .catch((error) => {
        // Only delete if this exact request is still in cache (generational safety)
        if (requestCache.get(url) === request)
          requestCache.delete(url)
        throw error
      })
    requestCache.set(url, request)
    return request
  }

  const prefetch = (url: string, load: () => Promise<T>) => {
    const cachedRequest = requestCache.get(url)
    if (cachedRequest)
      return cachedRequest

    let resolveRequest!: (value: T) => void
    let rejectRequest!: (reason: unknown) => void
    const request = new Promise<T>((resolve, reject) => {
      resolveRequest = resolve
      rejectRequest = reject
    })

    requestCache.set(url, request)
    pendingRequests.push({
      run: () => {
        void Promise.resolve()
          .then(load)
          .then(resolveRequest)
          .catch((error) => {
            // Only delete if this exact request is still in cache (generational safety)
            if (requestCache.get(url) === request)
              requestCache.delete(url)
            rejectRequest(error)
          })
          .finally(() => {
            activeRequestCount -= 1
            drainQueue()
          })
      },
    })
    drainQueue()
    return request
  }

  return {
    clearForTests() {
      requestCache.clear()
    },
    fetch,
    prefetch,
  }
}
