import process from 'node:process'

const defaultDownloadConcurrency = 8
const maxDownloadConcurrency = 16

export function resolveDownloadConcurrency() {
  const rawValue = process.env.FACT_SOURCE_DOWNLOAD_CONCURRENCY?.trim()
  const parsedValue = rawValue
    ? Number.parseInt(rawValue, 10)
    : Number.NaN

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return defaultDownloadConcurrency
  }

  return Math.min(parsedValue, maxDownloadConcurrency)
}

export async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
  const results: TResult[] = []
  let nextIndex = 0
  const state: { firstError: { reason: unknown } | null } = { firstError: null }

  async function runWorker() {
    while (!state.firstError) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) {
        return
      }

      nextIndex += 1
      try {
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      }
      catch (reason) {
        state.firstError ??= { reason }
        return
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  const workerSlots = Array.from({ length: workerCount }, (_, index) => index)
  // Let in-flight workers settle before rethrowing, so no download keeps writing after the caller has moved on.
  await Promise.all(workerSlots.map(() => runWorker()))
  if (state.firstError) {
    throw state.firstError.reason
  }
  return results
}
