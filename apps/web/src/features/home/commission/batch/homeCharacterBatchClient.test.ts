// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearHomeCharacterBatchRequestCacheForTests,
  fetchHomeCharacterBatch,
  prefetchHomeCharacterBatches,
} from './homeCharacterBatchClient'
import {
  clearHomeCharacterBatchManifestCacheForTests,
} from './homeCharacterBatchManifest'

function renderManifest() {
  clearHomeCharacterBatchManifestCacheForTests(document)
  document.body.innerHTML = `
    <script type="application/json" data-home-character-batch-manifest="true">
      {"locale":"en","active":{"initialSectionIds":["alpha"],"totalBatches":3,"targetBatchById":{}},"archived":{"initialSectionIds":[],"totalBatches":2,"targetBatchById":{}}}
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
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
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

  it('limits batch prefetches to four concurrent network requests', async () => {
    renderManifest()
    document.querySelector('script')!.textContent = JSON.stringify({
      locale: 'en',
      active: { initialSectionIds: ['alpha'], totalBatches: 5, targetBatchById: {} },
      archived: { initialSectionIds: [], totalBatches: 2, targetBatchById: {} },
    })

    const resolvers: Array<(response: Response) => void> = []
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    }))
    vi.stubGlobal('fetch', fetchSpy)

    prefetchHomeCharacterBatches({
      doc: document,
      startBatchIndex: 0,
      status: 'active',
      targetBatchIndex: 4,
    })

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4))
    expect(fetchSpy).toHaveBeenCalledTimes(4)

    resolvers[0](new Response(JSON.stringify({ sections: [] }), { status: 200 }))
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5))

    resolvers.slice(1).forEach(resolve => resolve(new Response(JSON.stringify({ sections: [] }), { status: 200 })))
  })

  it('drops failed batch requests from cache so a later retry can refetch', async () => {
    renderManifest()

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sections: [] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      fetchHomeCharacterBatch({
        batchIndex: 1,
        doc: document,
        status: 'active',
      }),
    ).rejects.toThrow('Failed to load active batch 1: 503')

    await expect(
      fetchHomeCharacterBatch({
        batchIndex: 1,
        doc: document,
        status: 'active',
      }),
    ).resolves.toEqual({ sections: [] })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('refreshes the manifest and retries once when a hashed batch 404s', async () => {
    clearHomeCharacterBatchManifestCacheForTests(document)
    document.body.innerHTML = `
      <script type="application/json" data-home-character-batch-manifest="true">
        {"locale":"en","v":"sv","active":{"initialSectionIds":[],"totalBatches":1,"targetBatchById":{},"batchVersions":["old0"]},"archived":{"initialSectionIds":[],"totalBatches":0,"targetBatchById":{},"batchVersions":[]}}
      </script>
    `

    const freshManifest = {
      locale: 'en',
      v: 'sv',
      active: { initialSectionIds: [], totalBatches: 1, targetBatchById: {}, batchVersions: ['new0'] },
      archived: { initialSectionIds: [], totalBatches: 0, targetBatchById: {}, batchVersions: [] },
    }
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/search/home-character-manifest/en.json'))
        return new Response(JSON.stringify(freshManifest))
      if (url.startsWith('/search/home-character-batches/en/active/0.old0.json'))
        return new Response(null, { status: 404 })
      if (url.startsWith('/search/home-character-batches/en/active/0.new0.json'))
        return new Response(JSON.stringify({ sections: [] }))
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      fetchHomeCharacterBatch({
        batchIndex: 0,
        doc: document,
        status: 'active',
      }),
    ).resolves.toEqual({ sections: [] })

    const requestedUrls = (fetchSpy.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(requestedUrls).toContain('/search/home-character-batches/en/active/0.old0.json')
    expect(requestedUrls).toContain('/search/home-character-batches/en/active/0.new0.json')
  })
})
