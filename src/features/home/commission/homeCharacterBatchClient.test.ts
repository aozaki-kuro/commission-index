// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearHomeCharacterBatchRequestCacheForTests,
  fetchHomeCharacterBatch,
  prefetchHomeCharacterBatches,
} from './homeCharacterBatchClient'

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function renderManifest() {
  document.body.innerHTML = `
    <script type="application/json" data-home-character-batch-manifest="true">
      {"locale":"en","active":{"initialSectionIds":["alpha"],"totalBatches":3,"targetBatchById":{}},"stale":{"initialSectionIds":[],"totalBatches":2,"targetBatchById":{}}}
    </script>
  `
}

describe('prefetchHomeCharacterBatches', () => {
  afterEach(() => {
    clearHomeCharacterBatchRequestCacheForTests()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('warms the batch request cache without refetching the same payload later', async () => {
    renderManifest()

    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ sections: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    prefetchHomeCharacterBatches({
      doc: document,
      startBatchIndex: 1,
      status: 'active',
      targetBatchIndex: 2,
    })
    await flushAsyncWork()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const requestedUrls = (fetchSpy.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(requestedUrls).toEqual([
      '/search/home-character-batches/en/active/1.json',
      '/search/home-character-batches/en/active/2.json',
    ])

    await fetchHomeCharacterBatch({
      batchIndex: 1,
      doc: document,
      status: 'active',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
