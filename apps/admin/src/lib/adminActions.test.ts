import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addCharacterAction,
  addCommissionAction,
  replaceCommissionSourceImageAction,
  saveHomeFeaturedKeywordsAction,
  saveKeywordAliasesBatchAction,
  updateCommissionAction,
} from './adminActions'

afterEach(() => {
  vi.unstubAllGlobals()
})

function successfulResponse() {
  return new Response(JSON.stringify({ status: 'success', message: 'Saved.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createFetchMock() {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => successfulResponse())
}

function getRequestInit(fetchMock: ReturnType<typeof createFetchMock>) {
  const request = fetchMock.mock.calls[0]?.[1]
  if (!request) {
    throw new Error('Expected the admin action to make a request.')
  }
  return request
}

describe('commission admin actions', () => {
  it('posts date and creator metadata without a commission filename', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const formData = new FormData()
    formData.set('characterId', '3')
    formData.set('commissionDate', '2025-03-02')
    formData.set('creatorName', 'Artist')
    formData.set('workGroupId', 'new')
    formData.set('partNumber', '1')
    formData.set('fileName', '20250302_Artist')
    formData.set('sourceImage', new File(['image'], 'image.png', { type: 'image/png' }))

    const result = await addCommissionAction({ status: 'idle' }, formData)

    expect(result.status).toBe('success')
    expect(fetchMock).toHaveBeenCalledOnce()
    const request = getRequestInit(fetchMock)
    const body = request.body as FormData
    expect(body.get('commissionDate')).toBe('2025-03-02')
    expect(body.get('creatorName')).toBe('Artist')
    expect(body.get('workGroupId')).toBe('new')
    expect(body.get('partNumber')).toBe('1')
    expect(body.has('fileName')).toBe(false)
  })

  it('patches a required date and nullable creator without renaming the asset', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const formData = new FormData()
    formData.set('id', '15')
    formData.set('characterId', '3')
    formData.set('commissionDate', '2025-03-02')
    formData.set('creatorName', '  ')
    formData.set('workGroupId', 'new')
    formData.set('partNumber', '2')

    const result = await updateCommissionAction({ status: 'idle' }, formData)

    expect(result.status).toBe('success')
    expect(fetchMock).toHaveBeenCalledOnce()
    const request = getRequestInit(fetchMock)
    expect(JSON.parse(String(request.body))).toMatchObject({
      characterId: 3,
      commissionDate: '2025-03-02',
      creatorName: null,
      workGroupId: 'new',
      partNumber: 2,
    })
    expect(JSON.parse(String(request.body))).not.toHaveProperty('fileName')
  })

  it('replaces the source image using only commission id and file', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const formData = new FormData()
    formData.set('id', '15')
    formData.set('commissionFileName', '20250302_Artist')
    formData.set('sourceImage', new File(['image'], 'image.png', { type: 'image/png' }))

    const result = await replaceCommissionSourceImageAction(formData)

    expect(result.status).toBe('success')
    const request = getRequestInit(fetchMock)
    const body = request.body as FormData
    expect(body.get('id')).toBe('15')
    expect(body.get('sourceImage')).toBeInstanceOf(File)
    expect(body.has('commissionFileName')).toBe(false)
  })
})

describe('suggestion admin action', () => {
  it('returns network failures as form errors without retrying a write', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection interrupted'))
    vi.stubGlobal('fetch', fetchMock)
    const formData = new FormData()
    formData.set('keywordsJson', JSON.stringify(['Summer', 'Winter']))
    await expect(saveHomeFeaturedKeywordsAction({ status: 'idle' }, formData)).resolves.toEqual({
      status: 'error',
      message: 'Connection interrupted',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('character and alias network errors', () => {
  it.each([addCharacterAction, saveKeywordAliasesBatchAction])('keeps rejected writes inside the form error boundary', async (action) => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection interrupted'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(action({ status: 'idle' }, new FormData())).resolves.toEqual({ status: 'error', message: 'Connection interrupted' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
