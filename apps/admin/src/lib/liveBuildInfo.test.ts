import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLiveBuildInfo, isBuildConfirmed, parseBuildInfo } from './liveBuildInfo'

const validInfo = {
  dataRevision: 'a'.repeat(64),
  dataExportedAt: '2026-10-09T10:00:05.000Z',
  codeSha: null,
  builtAt: '2026-10-09T10:03:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isBuildConfirmed', () => {
  const dispatchedAt = '2026-10-09T10:00:00.000Z'

  it('rejects a live snapshot exported well before the rebuild was dispatched', () => {
    expect(isBuildConfirmed({ ...validInfo, dataExportedAt: '2026-10-09T09:59:00.000Z' }, dispatchedAt)).toBe(false)
  })

  it('accepts a snapshot exported at or after the dispatch', () => {
    expect(isBuildConfirmed({ ...validInfo, dataExportedAt: dispatchedAt }, dispatchedAt)).toBe(true)
    expect(isBuildConfirmed(validInfo, dispatchedAt)).toBe(true)
  })

  it('accepts a snapshot exported just inside the clock-skew tolerance', () => {
    // Runner clock 30 s behind the worker still confirms a snapshot it exported after dispatch.
    expect(isBuildConfirmed({ ...validInfo, dataExportedAt: '2026-10-09T09:59:30.000Z' }, dispatchedAt)).toBe(true)
  })

  it('rejects a snapshot exported just outside the clock-skew tolerance', () => {
    expect(isBuildConfirmed({ ...validInfo, dataExportedAt: '2026-10-09T09:59:29.999Z' }, dispatchedAt)).toBe(false)
  })

  it('never confirms when either timestamp is unparseable', () => {
    expect(isBuildConfirmed({ ...validInfo, dataExportedAt: 'not-a-date' }, dispatchedAt)).toBe(false)
    expect(isBuildConfirmed(validInfo, 'not-a-date')).toBe(false)
  })
})

describe('parseBuildInfo', () => {
  it('accepts a complete payload and a null code SHA', () => {
    expect(parseBuildInfo(validInfo)).toEqual(validInfo)
  })

  it('rejects payloads missing the fields the confirmation depends on', () => {
    expect(() => parseBuildInfo({ ...validInfo, dataRevision: undefined })).toThrow()
    expect(() => parseBuildInfo({ ...validInfo, dataExportedAt: 42 })).toThrow()
    expect(() => parseBuildInfo('<!doctype html>')).toThrow()
  })
})

describe('fetchLiveBuildInfo', () => {
  it('reads the public build-info file uncached and rejects non-OK responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(validInfo), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLiveBuildInfo()).resolves.toEqual(validInfo)
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://crystallize.cc/build-info.json'),
      expect.objectContaining({ cache: 'no-store' }),
    )

    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })))
    await expect(fetchLiveBuildInfo()).rejects.toThrow('HTTP 404')
  })
})
