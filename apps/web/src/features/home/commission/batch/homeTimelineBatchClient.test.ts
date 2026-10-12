// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearHomeTimelineBatchRequestCacheForTests,
  fetchHomeTimelineBatch,
} from './homeTimelineBatchClient'
import { clearHomeTimelineBatchManifestCacheForTests, readHomeTimelineBatchManifest } from './homeTimelineBatchManifest'

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

  it('passes a timeout signal to batch fetches', async () => {
    renderManifest()
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sections: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    await fetchHomeTimelineBatch({ batchIndex: 0, doc: document })

    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('fetches without a signal when AbortSignal.timeout is missing', async () => {
    renderManifest()
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sections: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined })

    try {
      await fetchHomeTimelineBatch({ batchIndex: 0, doc: document })
    }
    finally {
      if (originalTimeout)
        Object.defineProperty(AbortSignal, 'timeout', originalTimeout)
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]).toEqual([expect.any(String), undefined])
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

describe('readHomeTimelineBatchManifest', () => {
  afterEach(() => {
    clearHomeTimelineBatchManifestCacheForTests()
    document.body.innerHTML = ''
  })

  it('re-reads the manifest after the manifest script is swapped', () => {
    const render = (locale: string) => {
      document.body.innerHTML = `
        <script type="application/json" data-home-timeline-batch-manifest="true">
          {"locale":"${locale}","initialSectionIds":[],"totalBatches":1,"targetBatchById":{}}
        </script>
      `
    }

    render('en')
    expect(readHomeTimelineBatchManifest(document)?.locale).toBe('en')
    render('ja')
    expect(readHomeTimelineBatchManifest(document)?.locale).toBe('ja')
    render('en')
    expect(readHomeTimelineBatchManifest(document)?.locale).toBe('en')
  })
})
