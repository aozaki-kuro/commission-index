// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearHomeTimelineBatchRequestCacheForTests,
  fetchHomeTimelineBatch,
} from './homeTimelineBatchClient'
import { clearHomeTimelineBatchManifestCacheForTests } from './homeTimelineBatchManifest'

function renderManifest() {
  document.body.innerHTML = `
    <script type="application/json" data-home-timeline-batch-manifest="true">
      {"locale":"en","initialSectionIds":["timeline-year-2026"],"totalBatches":2,"targetBatchById":{}}
    </script>
  `
  clearHomeTimelineBatchManifestCacheForTests(document)
}

describe('fetchHomeTimelineBatch', () => {
  afterEach(() => {
    clearHomeTimelineBatchRequestCacheForTests()
    clearHomeTimelineBatchManifestCacheForTests(document)
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('drops failed timeline batch requests from cache so a later retry can refetch', async () => {
    renderManifest()

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
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
      fetchHomeTimelineBatch({
        batchIndex: 1,
        doc: document,
      }),
    ).rejects.toThrow('Failed to load timeline batch 1: 504')

    await expect(
      fetchHomeTimelineBatch({
        batchIndex: 1,
        doc: document,
      }),
    ).resolves.toEqual({ sections: [] })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('refreshes the manifest and retries once when a hashed batch 404s', async () => {
    document.body.innerHTML = `
      <script type="application/json" data-home-timeline-batch-manifest="true">
        {"locale":"en","v":"tv","batchVersions":["old0","old1"],"initialSectionIds":[],"totalBatches":2,"targetBatchById":{}}
      </script>
    `
    clearHomeTimelineBatchManifestCacheForTests(document)

    const freshManifest = {
      locale: 'en',
      v: 'tv',
      batchVersions: ['new0', 'new1'],
      initialSectionIds: [],
      totalBatches: 2,
      targetBatchById: {},
    }
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/search/home-timeline-manifest/en.json'))
        return new Response(JSON.stringify(freshManifest))
      if (url.startsWith('/search/home-timeline-batches/en/1.old1.json'))
        return new Response(null, { status: 404 })
      if (url.startsWith('/search/home-timeline-batches/en/1.new1.json'))
        return new Response(JSON.stringify({ sections: [] }))
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      fetchHomeTimelineBatch({
        batchIndex: 1,
        doc: document,
      }),
    ).resolves.toEqual({ sections: [] })

    const requestedUrls = (fetchSpy.mock.calls as unknown as Array<[string]>).map(([url]) => url)
    expect(requestedUrls).toContain('/search/home-timeline-batches/en/1.old1.json')
    expect(requestedUrls).toContain('/search/home-timeline-batches/en/1.new1.json')
  })
})
