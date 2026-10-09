import type {
  AdminCrudBackend,
  CharacterOrderPayload,
  CreateCharacterInput,
  CreateCommissionInput,
  UpdateCharacterInput,
  UpdateCommissionInput,
} from './adminApi'
import { describe, expect, it, vi } from 'vitest'
import {
  handleAdminApiRequest,
} from './adminApi'
import { createAdminReadD1Database } from './test/adminReadD1Fixture'

const baseUrl = 'http://127.0.0.1:8787'

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function createR2SourceImageObject(
  body: ArrayBuffer,
  options: { contentType?: string, httpEtag?: string, size?: number } = {},
) {
  return {
    httpMetadata: { contentType: options.contentType },
    httpEtag: options.httpEtag,
    size: options.size ?? body.byteLength,
    body: new Response(body).body,
    async arrayBuffer() { return body },
  }
}

function createCrudBackend(overrides: Partial<AdminCrudBackend> = {}): AdminCrudBackend {
  return {
    getCharacterCommissions: vi.fn(async () => createJsonResponse({ commissions: [] })),
    createCharacter: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    updateCharacter: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    updateCharacterOrder: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    deleteCharacter: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    createCommission: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    updateCommission: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    deleteCommission: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    replaceCommissionSourceImage: vi.fn(async () => createJsonResponse({ status: 'success', message: 'ok' })),
    ...overrides,
  }
}

interface CommissionFieldValidationCase {
  method: 'POST' | 'PATCH'
  label: string
  workGroupId: string | null
  partNumber: string | number | null
  message: string
}

function buildCommissionMutationRequest(options: {
  method: 'POST' | 'PATCH'
  workGroupId: string | null
  partNumber: string | number | null
}) {
  if (options.method === 'POST') {
    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')
    formData.set('creatorName', 'test-creator')
    formData.set('workGroupId', options.workGroupId ?? '')
    formData.set('partNumber', options.partNumber == null ? '' : String(options.partNumber))
    formData.set('links', '')
    formData.set('sourceImage', new File(['png'], 'test.png', { type: 'image/png' }))

    return new Request(`${baseUrl}/api/admin/commissions`, { method: 'POST', body: formData })
  }

  return new Request(`${baseUrl}/api/admin/commissions/19`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: 3,
      commissionDate: '2025-03-01',
      creatorName: 'test-creator',
      workGroupId: options.workGroupId,
      partNumber: options.partNumber,
      links: '',
      hidden: false,
    }),
  })
}

// create-commission and PATCH surface the same work-group/part-number failures;
// the table keeps every (method × invalid field combo) case with the shared check.
const invalidCommissionFieldCases: CommissionFieldValidationCase[] = [
  {
    method: 'POST',
    label: 'workGroupId without partNumber on create-commission',
    workGroupId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    partNumber: '',
    message: 'Work group and part number must be set together.',
  },
  {
    method: 'POST',
    label: 'partNumber without workGroupId on create-commission',
    workGroupId: '',
    partNumber: '1',
    message: 'Work group and part number must be set together.',
  },
  {
    method: 'POST',
    label: 'invalid UUID workGroupId on create-commission',
    workGroupId: 'not-a-uuid',
    partNumber: '1',
    message: 'Work group must be a lowercase UUID v4.',
  },
  {
    method: 'PATCH',
    label: 'workGroupId without partNumber on PATCH',
    workGroupId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    partNumber: null,
    message: 'Work group and part number must be set together.',
  },
  {
    method: 'PATCH',
    label: 'partNumber without workGroupId on PATCH',
    workGroupId: null,
    partNumber: 2,
    message: 'Work group and part number must be set together.',
  },
  {
    method: 'PATCH',
    label: 'invalid UUID workGroupId on PATCH',
    workGroupId: 'invalid-uuid',
    partNumber: 1,
    message: 'Work group must be a lowercase UUID v4.',
  },
]

const invalidPartNumberCases = [
  { label: 'zero partNumber on create-commission', partNumber: '0' },
  { label: 'negative partNumber on create-commission', partNumber: '-1' },
  { label: 'non-integer partNumber on create-commission', partNumber: '1.5' },
]

interface StatementExecution {
  query: string
  values: unknown[]
}

function createD1Recorder(options: {
  queryResults?: (query: string, values: unknown[]) => unknown[]
  runBehavior?: (query: string, values: unknown[]) => { success?: boolean } | void
} = {}) {
  const executions: StatementExecution[] = []

  function createStatement(query: string, values: unknown[] = []) {
    return {
      bind(...nextValues: unknown[]) {
        return createStatement(query, nextValues)
      },
      async all() {
        executions.push({ query, values })
        return { results: options.queryResults?.(query, values) ?? [] }
      },
      async run() {
        executions.push({ query, values })
        return options.runBehavior?.(query, values) ?? { success: true }
      },
    }
  }

  return {
    db: {
      async batch(statements: Array<{ run: () => Promise<{ success?: boolean }> }>) {
        const results = []
        for (const statement of statements) {
          const result = await statement.run()
          if (result.success === false) {
            throw new Error('D1 batch failed.')
          }
          results.push(result)
        }
        return results
      },
      prepare(query: string) {
        return createStatement(query)
      },
    },
    executions,
  }
}

function createImagesBucketRecorder(options: {
  existingKeys?: string[]
  existingObjects?: Record<string, { body?: ArrayBuffer, contentType?: string }>
} = {}) {
  const existingKeys = new Set(options.existingKeys ?? [])
  const existingObjects = options.existingObjects ?? {}
  const put = vi.fn(async (_key: string, _value: ArrayBuffer, _options?: { httpMetadata?: { contentType?: string } }) => ({}))
  const deleteObject = vi.fn(async (_key: string) => ({}))
  const get = vi.fn(async (key: string) => {
    if (key in existingObjects) {
      const object = existingObjects[key]!
      return {
        httpMetadata: object.contentType ? { contentType: object.contentType } : undefined,
        async arrayBuffer() {
          return object.body ?? new Uint8Array([1, 2, 3]).buffer
        },
      }
    }

    if (!existingKeys.has(key)) {
      return null
    }

    return {
      async arrayBuffer() {
        return new Uint8Array([1, 2, 3]).buffer
      },
    }
  })

  return {
    bucket: {
      delete: deleteObject,
      get,
      put,
    },
    deleteObject,
    get,
    put,
  }
}

describe('admin worker CRUD contract routing', () => {
  it('returns the rebuild dispatch timestamp and includes it in the GitHub event', async () => {
    const originalFetch = globalThis.fetch
    const githubFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }))
    globalThis.fetch = githubFetch as typeof fetch
    try {
      const response = await handleAdminApiRequest(
        new Request(`${baseUrl}/api/admin/rebuild`, { method: 'POST' }),
        { GITHUB_DISPATCH_TOKEN: 'test-token' },
        createCrudBackend(),
      )
      const payload = await response.json() as { dispatchedAt: string }
      const dispatchRequest = githubFetch.mock.calls[0]?.[1]
      expect(response.status).toBe(200)
      expect(Number.isFinite(Date.parse(payload.dispatchedAt))).toBe(true)
      expect(JSON.parse(String(dispatchRequest?.body)).client_payload.fact_source_version).toBe(payload.dispatchedAt)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('normalizes create-character payload before delegating to backend', async () => {
    const createCharacter = vi.fn(async (_input: CreateCharacterInput) =>
      createJsonResponse({ status: 'success', message: 'Character "Alice" created.' }))
    const backend = createCrudBackend({ createCharacter })

    const request = new Request(`${baseUrl}/api/admin/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '  Alice  ',
        status: 'archived',
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character "Alice" created.',
    })
    expect(createCharacter).toHaveBeenCalledWith({
      name: 'Alice',
      status: 'archived',
    })
  })

  it('rejects empty character names before hitting backend', async () => {
    const createCharacter = vi.fn(async (_input: CreateCharacterInput) =>
      createJsonResponse({ status: 'success', message: 'unexpected' }))
    const backend = createCrudBackend({ createCharacter })

    const request = new Request(`${baseUrl}/api/admin/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '   ',
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Character name is required.',
    })
    expect(createCharacter).not.toHaveBeenCalled()
  })

  it('passes normalized character ordering arrays to backend', async () => {
    const updateCharacterOrder = vi.fn(async (_payload: CharacterOrderPayload) =>
      createJsonResponse({ status: 'success', message: 'Character order updated.' }))
    const backend = createCrudBackend({ updateCharacterOrder })

    const request = new Request(`${baseUrl}/api/admin/characters/order`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        active: ['1', 2],
        archived: ['3'],
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character order updated.',
    })
    expect(updateCharacterOrder).toHaveBeenCalledWith({
      active: [1, 2],
      archived: [3],
    })
  })

  it('normalizes create-commission form data before delegating to backend', async () => {
    const createCommission = vi.fn(async (_input: CreateCommissionInput) =>
      createJsonResponse({ status: 'success', message: 'Commission saved.' }))
    const backend = createCrudBackend({ createCommission })

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '  2025-03-01  ')
    formData.set('creatorName', '  sample-piece  ')
    formData.set('links', ' https://a.example \n\nhttps://b.example ')
    formData.set('design', '  outfit  ')
    formData.set('description', '  desc  ')
    formData.set('keyword', '  tag  ')
    formData.set('hidden', 'on')
    formData.set('sourceImage', new File(['png'], 'sample.png', { type: 'image/png' }))

    const request = new Request(`${baseUrl}/api/admin/commissions`, {
      method: 'POST',
      body: formData,
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Commission saved.',
    })

    expect(createCommission).toHaveBeenCalledTimes(1)
    const [payload] = createCommission.mock.calls[0] as [CreateCommissionInput]
    expect(payload).toMatchObject({
      characterId: 7,
      commissionDate: '2025-03-01',
      creatorName: 'sample-piece',
      links: ['https://a.example', 'https://b.example'],
      design: 'outfit',
      description: 'desc',
      keyword: 'tag',
      hidden: true,
    })
    expect(payload.sourceImage).toBeInstanceOf(File)
    expect(payload.sourceImage.name).toBe('sample.png')
  })

  it('rejects missing source image for create-commission before delegating to backend', async () => {
    const createCommission = vi.fn(async (_input: CreateCommissionInput) =>
      createJsonResponse({ status: 'success', message: 'unexpected' }))
    const backend = createCrudBackend({ createCommission })

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')

    const request = new Request(`${baseUrl}/api/admin/commissions`, {
      method: 'POST',
      body: formData,
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Source image is required for new commission entries.',
    })
    expect(createCommission).not.toHaveBeenCalled()
  })

  it('rejects impossible commission dates before PATCH persistence', async () => {
    const updateCommission = vi.fn(async () => createJsonResponse({ status: 'success', message: 'unexpected' }))
    const backend = createCrudBackend({ updateCommission })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: 3, commissionDate: '2025-02-30', workGroupId: null, partNumber: null, links: '', hidden: false }),
      }),
      {},
      backend,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Commission date must be a real calendar date.',
    })
    expect(updateCommission).not.toHaveBeenCalled()
  })

  it('normalizes empty string workGroupId and partNumber to null for create-commission', async () => {
    const createCommission = vi.fn(async (input: CreateCommissionInput) => {
      void input
      return createJsonResponse({ status: 'success', message: 'Commission created.' })
    })
    const backend = createCrudBackend({ createCommission })

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')
    formData.set('creatorName', 'test-creator')
    formData.set('workGroupId', '')
    formData.set('partNumber', '')
    formData.set('links', '')
    formData.set('hidden', 'off')
    formData.set('sourceImage', new File(['png'], 'test.png', { type: 'image/png' }))

    const request = new Request(`${baseUrl}/api/admin/commissions`, {
      method: 'POST',
      body: formData,
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(createCommission).toHaveBeenCalledOnce()
    const callArg = createCommission.mock.calls[0]?.[0]
    expect(callArg?.workGroupId).toBe(null)
    expect(callArg?.partNumber).toBe(null)
  })

  it.each(invalidCommissionFieldCases)(
    'rejects $label before persistence',
    async ({ method, workGroupId, partNumber, message }) => {
      const createCommission = vi.fn(async (_input: CreateCommissionInput) =>
        createJsonResponse({ status: 'success', message: 'unexpected' }))
      const updateCommission = vi.fn(async (_input: UpdateCommissionInput) =>
        createJsonResponse({ status: 'success', message: 'unexpected' }))
      const backend = createCrudBackend({ createCommission, updateCommission })

      const response = await handleAdminApiRequest(
        buildCommissionMutationRequest({ method, workGroupId, partNumber }),
        {},
        backend,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        status: 'error',
        message,
      })
      expect(createCommission).not.toHaveBeenCalled()
      expect(updateCommission).not.toHaveBeenCalled()
    },
  )

  it.each(invalidPartNumberCases)('rejects $label before persistence', async ({ partNumber }) => {
    const createCommission = vi.fn(async (_input: CreateCommissionInput) =>
      createJsonResponse({ status: 'success', message: 'unexpected' }))
    const backend = createCrudBackend({ createCommission })

    const response = await handleAdminApiRequest(
      buildCommissionMutationRequest({
        method: 'POST',
        workGroupId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        partNumber,
      }),
      {},
      backend,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Part number must be a positive integer.',
    })
    expect(createCommission).not.toHaveBeenCalled()
  })

  it('normalizes empty string workGroupId and partNumber to null for PATCH', async () => {
    const updateCommission = vi.fn(async (input: UpdateCommissionInput) => {
      void input
      return createJsonResponse({ status: 'success', message: 'Commission updated.' })
    })
    const backend = createCrudBackend({ updateCommission })

    const request = new Request(`${baseUrl}/api/admin/commissions/19`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterId: 3,
        commissionDate: '2025-03-01',
        creatorName: 'test-creator',
        workGroupId: '',
        partNumber: '',
        links: '',
        hidden: false,
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(updateCommission).toHaveBeenCalledOnce()
    const callArg = updateCommission.mock.calls[0]?.[0]
    expect(callArg?.workGroupId).toBe(null)
    expect(callArg?.partNumber).toBe(null)
  })

  it('normalizes update-commission payload before delegating to backend', async () => {
    const updateCommission = vi.fn(async (_input: UpdateCommissionInput) =>
      createJsonResponse({ status: 'success', message: 'Commission updated.' }))
    const backend = createCrudBackend({ updateCommission })

    const request = new Request(`${baseUrl}/api/admin/commissions/19`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        characterId: '3',
        commissionDate: '  2025-03-01  ',
        creatorName: '  updated-piece  ',
        workGroupId: null,
        partNumber: null,
        links: ' one \n two ',
        design: '  new design  ',
        description: '',
        keyword: '  glow  ',
        hidden: true,
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Commission updated.',
    })
    expect(updateCommission).toHaveBeenCalledWith({
      id: 19,
      characterId: 3,
      commissionDate: '2025-03-01',
      creatorName: 'updated-piece',
      workGroupId: null,
      partNumber: null,
      links: ['one', 'two'],
      design: 'new design',
      description: undefined,
      keyword: 'glow',
      hidden: true,
    })
  })

  it('returns a 404 payload for unknown admin routes', async () => {
    const backend = createCrudBackend()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/unknown`, { method: 'GET' }),
      {},
      backend,
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Not Found',
    })
  })

  it('normalizes update-character payload before delegating to backend', async () => {
    const updateCharacter = vi.fn(async (_input: UpdateCharacterInput) =>
      createJsonResponse({ status: 'success', message: 'Character updated.' }))
    const backend = createCrudBackend({ updateCharacter })

    const request = new Request(`${baseUrl}/api/admin/characters/14`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '  Renamed  ',
        status: 'active',
      }),
    })

    const response = await handleAdminApiRequest(request, {}, backend)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character updated.',
    })
    expect(updateCharacter).toHaveBeenCalledWith({
      id: 14,
      name: 'Renamed',
      status: 'active',
    })
  })

  it('handles create-character natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query) {
        if (query.includes('MAX(sort_order)')) {
          return [{ maxOrder: 4 }]
        }

        return []
      },
    })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '  Alice  ',
          status: 'archived',
        }),
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character "Alice" created.',
    })
    const insertOps = executions.filter(item => item.query.includes('INSERT INTO characters'))
    expect(insertOps).toHaveLength(1)
    expect(insertOps[0]?.values).toEqual(['Alice', 'archived', 5])
  })

  it('handles update-character natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query, values) {
        if (query.includes('SELECT id FROM characters WHERE id = ?')) {
          return [{ id: Number(values[0]) }]
        }

        return []
      },
    })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/14`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '  Renamed  ',
          status: 'active',
        }),
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character "Renamed" updated.',
    })
    const updateOps = executions.filter(item => item.query.includes('UPDATE characters SET name = ?, status = ?'))
    expect(updateOps).toHaveLength(1)
    expect(updateOps[0]?.values).toEqual(['Renamed', 'active', 14])
  })

  it('handles character reordering natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query) {
        if (query.includes('SELECT id FROM characters WHERE id IN')) {
          return [{ id: 1 }, { id: 2 }, { id: 3 }]
        }
        return []
      },
    })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          active: [1, 2],
          archived: [3],
        }),
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character order updated.',
    })
    const updateOps = executions.filter(item =>
      item.query.includes('UPDATE characters SET sort_order ='),
    )
    expect(updateOps).toHaveLength(2)
    expect(updateOps[0]!.query).toContain('WHEN ? THEN ? WHEN ? THEN ?')
    expect(updateOps[0]!.values).toEqual([1, 1, 2, 2, 'active', 1, 2])
    expect(updateOps[0]!.query).toContain('status = ?')
    expect(updateOps[0]!.query).toContain('WHERE id IN (?, ?)')
    expect(updateOps[1]!.query).toContain('WHEN ? THEN ?')
    expect(updateOps[1]!.values).toEqual([3, 3, 'archived', 3])
    expect(updateOps[1]!.query).toContain('status = ?')
    expect(updateOps[1]!.query).toContain('WHERE id IN (?)')
  })

  it('handles delete-character natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query) {
        if (query.includes('SELECT name FROM characters WHERE id = ?')) {
          return [{ name: 'Alice' }]
        }

        return []
      },
    })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character deleted.',
    })
    expect(executions.filter(item => item.query.includes('DELETE FROM commissions WHERE character_id = ?')))
      .toHaveLength(1)
    expect(executions.filter(item => item.query.includes('DELETE FROM characters WHERE id = ?')))
      .toHaveLength(1)
  })

  it('handles create-commission natively when DB and IMAGES bindings exist', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query, values) {
        if (query.includes('SELECT id, name FROM characters WHERE id = ?')) {
          return [{ id: Number(values[0]), name: 'Alice' }]
        }

        return []
      },
    })
    const { bucket, get, put, deleteObject } = createImagesBucketRecorder()

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')
    formData.set('creatorName', 'sample-piece')
    formData.set('workGroupId', '')
    formData.set('partNumber', '')
    formData.set('links', ' https://a.example \n\nhttps://b.example ')
    formData.set('design', '  outfit  ')
    formData.set('description', '  desc  ')
    formData.set('keyword', '  tag  ')
    formData.set('hidden', 'on')
    formData.set('sourceImage', new File(['png'], 'sample.png', { type: 'image/png' }))

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions`, {
        method: 'POST',
        body: formData,
      }),
      {
        DB: db,
        IMAGES: bucket,
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Commission dated 2025-03-01 added to Alice.',
    })
    expect(get).not.toHaveBeenCalled()
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]?.[0]).toMatch(/^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/)
    expect(put.mock.calls[0]?.[2]).toEqual({
      httpMetadata: {
        contentType: 'image/png',
      },
    })
    expect(deleteObject).not.toHaveBeenCalled()

    const insertOps = executions.filter(item => item.query.includes('INSERT INTO commissions'))
    expect(insertOps).toHaveLength(1)
    expect(insertOps[0]?.values).toEqual([
      expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/),
      7,
      '2025-03-01',
      'sample-piece',
      null,
      null,
      expect.stringMatching(/^commission-[\w-]+$/),
      '["https://a.example","https://b.example"]',
      'outfit',
      'desc',
      'tag',
      1,
    ])
  })

  it('does not delete an existing commission when a create insert conflicts', async () => {
    const { db } = createD1Recorder({
      queryResults(query, values) {
        if (query.includes('SELECT id, name FROM characters WHERE id = ?')) {
          return [{ id: Number(values[0]), name: 'Alice' }]
        }

        return []
      },
      runBehavior(query) {
        if (query.includes('INSERT INTO commissions')) {
          return { success: false }
        }

        return undefined
      },
    })
    const { bucket, put, deleteObject } = createImagesBucketRecorder()

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')
    formData.set('creatorName', 'sample-piece')
    formData.set('sourceImage', new File(['png'], 'sample.png', { type: 'image/png' }))

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions`, {
        method: 'POST',
        body: formData,
      }),
      {
        DB: db,
        IMAGES: bucket,
      },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'D1 batch failed.',
    })
    expect(put).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
    expect(put.mock.calls[0]?.[0]).toMatch(/^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/)
  })

  it('handles update-commission natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query, values) {
        if (query.includes('FROM commissions') && query.includes('WHERE id = ?')) {
          return [{
            characterId: 1,
            fileName: '20250301_sample-piece',
            commissionDate: '2025-03-01',
            creatorName: 'sample-piece',
            links: '["https://a.example"]',
            design: 'old',
            description: 'old desc',
            keyword: 'old',
            hidden: 0,
          }]
        }

        if (query.includes('SELECT id FROM characters WHERE id = ?')) {
          return [{ id: Number(values[0]) }]
        }

        return []
      },
    })
    const { bucket, get, put, deleteObject } = createImagesBucketRecorder()
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characterId: 3,
          commissionDate: '2025-03-02',
          creatorName: 'updated-piece',
          workGroupId: null,
          partNumber: null,
          links: ' one \n two ',
          design: 'new design',
          description: '',
          keyword: ' glow ',
          hidden: true,
        }),
      }),
      { DB: db, IMAGES: bucket },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Commission dated 2025-03-02 updated.',
    })
    const updateOps = executions.filter(item => item.query.includes('UPDATE commissions'))
    expect(updateOps).toHaveLength(1)
    expect(updateOps[0]?.values).toEqual([
      3,
      '2025-03-02',
      'updated-piece',
      null,
      null,
      '["one","two"]',
      'new design',
      null,
      'glow',
      1,
      19,
    ])
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('handles delete-commission natively when DB binding exists', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query) {
        if (query.includes('SELECT file_name as fileName FROM commissions WHERE id = ?')) {
          return [{ fileName: '20250301_sample-piece' }]
        }

        return []
      },
    })
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19`, {
        method: 'DELETE',
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Commission deleted.',
    })
    expect(executions.filter(item => item.query.includes('DELETE FROM commissions WHERE id = ?')))
      .toHaveLength(1)
  })

  it('handles source-image replacement natively when DB and IMAGES bindings exist', async () => {
    const { db } = createD1Recorder({
      queryResults(query) {
        if (query.includes('SELECT file_name as fileName FROM commissions WHERE id = ?')) {
          return [{ fileName: '20250301_alice-maker' }]
        }

        return []
      },
    })
    const { bucket, put, deleteObject, get } = createImagesBucketRecorder()

    const formData = new FormData()
    formData.set('commissionFileName', 'stale-client-name')
    formData.set('sourceImage', new File(['jpg'], 'sample.jpg', { type: 'image/jpeg' }))

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, {
        method: 'POST',
        body: formData,
      }),
      {
        DB: db,
        IMAGES: bucket,
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Source image for commission 19 replaced.',
    })
    expect(get).not.toHaveBeenCalled()
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]?.[0]).toMatch(/^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.jpg$/)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('keeps filename metadata while identical successive uploads get distinct flat keys', async () => {
    const { db, executions } = createD1Recorder({
      queryResults(query) {
        return query.includes('SELECT file_name as fileName FROM commissions WHERE id = ?')
          ? [{ fileName: '20250301_alice-maker' }]
          : []
      },
    })
    const { bucket, put } = createImagesBucketRecorder()
    for (let index = 0; index < 2; index += 1) {
      const formData = new FormData()
      formData.set('commissionFileName', 'stale-client-name')
      formData.set('sourceImage', new File(['same bytes'], 'sample.png', { type: 'image/png' }))
      const response = await handleAdminApiRequest(
        new Request(`${baseUrl}/api/admin/commissions/19/source-image`, { method: 'POST', body: formData }),
        { DB: db, IMAGES: bucket },
      )
      expect(response.status).toBe(200)
    }
    const keys = put.mock.calls.map(call => call[0])
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    for (const key of keys) {
      expect(key).toMatch(/^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/)
      expect(key).not.toContain('20250301_alice-maker')
    }
    const writes = executions.filter(item => item.query.includes('INSERT INTO source_images'))
    expect(writes).toHaveLength(2)
    expect(writes.map(item => item.values.slice(0, 4))).toEqual(keys.map(key => [
      '20250301_alice-maker',
      '20250301_alice-maker',
      key,
      'image/png',
    ]))
    expect(writes[0]?.values.slice(4)).toEqual(writes[1]?.values.slice(4))
  })

  it('loads bootstrap data natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db } = createAdminReadD1Database()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/bootstrap`, { method: 'GET' }),
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      characters: [
        {
          id: 1,
          name: 'Alice',
          status: 'active',
          sortOrder: 1,
          commissionCount: 1,
        },
        {
          id: 2,
          name: 'Beta',
          status: 'archived',
          sortOrder: 2,
          commissionCount: 1,
        },
      ],
      creatorAliases: [
        {
          creatorName: 'alice-maker',
          aliases: [],
          commissionCount: 1,
        },
        {
          creatorName: 'beta-maker',
          aliases: [],
          commissionCount: 1,
        },
        {
          creatorName: 'maker',
          aliases: ['mk'],
          commissionCount: 0,
        },
      ],
      commissionSearchRows: [
        {
          id: 10,
          publicId: 'a0ed1441-77c3-4f23-9f81-6d7c3ac95431',
          characterId: 1,
          characterName: 'Alice',
          commissionDate: '2025-03-01',
          creatorName: 'alice-maker',
          workGroupId: null,
          partNumber: null,
          fileName: '20250301_alice-maker',
          links: JSON.stringify(['https://alice.example/a', 'https://alice.example/b']),
          design: 'maid outfit',
          description: 'soft lighting',
          keyword: 'maid, cafe',
          hidden: false,
        },
        {
          id: 11,
          publicId: 'b1ed1441-77c3-4f23-9f81-6d7c3ac95432',
          characterId: 2,
          characterName: 'Beta',
          commissionDate: '2024-01-05',
          creatorName: 'beta-maker',
          workGroupId: null,
          partNumber: null,
          fileName: '20240105_beta-maker',
          links: JSON.stringify(['https://beta.example/1']),
          design: 'armor',
          description: 'battle scene',
          keyword: 'armor',
          hidden: true,
        },
      ],
    })
  })

  it('loads aliases bootstrap data natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db } = createAdminReadD1Database()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/aliases/bootstrap`, { method: 'GET' }),
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      characterAliases: [
        {
          characterName: 'Alice',
          aliases: ['Alicia'],
          commissionCount: 1,
        },
        {
          characterName: 'Beta',
          aliases: ['B'],
          commissionCount: 1,
        },
      ],
      creatorAliases: [
        {
          creatorName: 'alice-maker',
          aliases: [],
          commissionCount: 1,
        },
        {
          creatorName: 'beta-maker',
          aliases: [],
          commissionCount: 1,
        },
        {
          creatorName: 'maker',
          aliases: ['mk'],
          commissionCount: 0,
        },
      ],
      keywordAliases: [
        {
          baseKeyword: 'armor',
          aliases: [],
          commissionCount: 1,
        },
        {
          baseKeyword: 'cafe',
          aliases: [],
          commissionCount: 1,
        },
        {
          baseKeyword: 'maid',
          aliases: ['uniform'],
          commissionCount: 1,
        },
      ],
    })
  })

  it('loads suggestion data natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db } = createAdminReadD1Database()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/suggestion`, { method: 'GET' }),
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      featuredKeywords: string[]
      keywordOptions: string[]
    }

    expect(payload.featuredKeywords).toEqual(['maid', 'maker'])
    expect(payload.keywordOptions.slice(0, 6)).toEqual([
      'Alice',
      'alice-maker',
      'Alicia',
      'armor',
      'B',
      'Beta',
    ])
  })

  it('loads character commissions natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db } = createAdminReadD1Database()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/1/commissions`, { method: 'GET' }),
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      commissions: [
        {
          id: 10,
          publicId: 'a0ed1441-77c3-4f23-9f81-6d7c3ac95431',
          characterId: 1,
          characterName: 'Alice',
          commissionDate: '2025-03-01',
          creatorName: 'alice-maker',
          workGroupId: null,
          partNumber: null,
          fileName: '20250301_alice-maker',
          links: ['https://alice.example/a', 'https://alice.example/b'],
          design: 'maid outfit',
          description: 'soft lighting',
          keyword: 'maid, cafe',
          hidden: false,
        },
      ],
    })
  })

  it('loads source images by commission ID without exposing the legacy asset key', async () => {
    const backend = createCrudBackend()
    const { db } = createD1Recorder({
      queryResults(query, values) {
        if (query.includes('COALESCE') && Number(values[0]) === 19) {
          return [{ fileName: 'commission-opaque-key', objectKey: 'source-images/commission-opaque-key/hash.jpg' }]
        }
        return []
      },
    })
    const imageBody = new Uint8Array([1, 2, 3]).buffer
    const get = vi.fn(async (key: string) => key === 'source-images/commission-opaque-key/hash.jpg'
      ? createR2SourceImageObject(imageBody, { contentType: 'image/jpeg', httpEtag: '"hash-etag"' })
      : null)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
      backend,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toBe('"hash-etag"')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(response.headers.get('Content-Length')).toBe(String(imageBody.byteLength))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('source-images/commission-opaque-key/hash.jpg')
    expect(await response.arrayBuffer()).toEqual(imageBody)
  })

  it('revalidates commission source images with If-None-Match', async () => {
    const backend = createCrudBackend()
    const imageBody = new Uint8Array([4, 5, 6]).buffer
    const etag = '"hash-etag"'
    const sourceImageRow = [
      { fileName: 'commission-opaque-key', objectKey: 'source-images/commission-opaque-key/hash.jpg' },
    ]
    // Open stream (never closed) so cancel() reaches the underlying source; the 304 path
    // must release the fetched body instead of leaking it.
    let matchingBodyCancelled = false
    const matchingObject = {
      httpMetadata: { contentType: 'image/jpeg' },
      httpEtag: etag,
      size: imageBody.byteLength,
      body: new ReadableStream({ cancel() { matchingBodyCancelled = true } }),
      async arrayBuffer() { return imageBody },
    }
    const matchingGet = vi.fn(async () => matchingObject)

    const matching = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': etag },
      }),
      { DB: createD1Recorder({ queryResults: () => sourceImageRow }).db, IMAGES: { get: matchingGet } },
      backend,
    )

    expect(matching.status).toBe(304)
    expect(matching.headers.get('ETag')).toBe(etag)
    expect(matching.headers.get('Cache-Control')).toBe('private, no-cache')
    expect((await matching.arrayBuffer()).byteLength).toBe(0)
    expect(matchingBodyCancelled).toBe(true)

    const get = vi.fn(async (key: string) => key === 'source-images/commission-opaque-key/hash.jpg'
      ? createR2SourceImageObject(imageBody, { contentType: 'image/jpeg', httpEtag: etag })
      : null)

    const stale = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': '"other-etag"' },
      }),
      { DB: createD1Recorder({ queryResults: () => sourceImageRow }).db, IMAGES: { get } },
      backend,
    )

    expect(stale.status).toBe(200)
    expect(stale.headers.get('ETag')).toBe(etag)
    expect(await stale.arrayBuffer()).toEqual(imageBody)
  })

  it('returns 404 without probing root keys when the commission has no source-image metadata', async () => {
    const backend = createCrudBackend()
    const { db } = createD1Recorder({
      queryResults() {
        return [{ fileName: 'legacy-fallback', objectKey: null }]
      },
    })
    const get = vi.fn(async (_key: string) =>
      createR2SourceImageObject(new Uint8Array([7, 8, 9]).buffer, { contentType: 'image/png' }))

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
      backend,
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
    expect(get).not.toHaveBeenCalled()
  })

  it('returns 404 when the resolved object key is missing from R2 instead of trying other keys', async () => {
    const backend = createCrudBackend()
    const { db } = createD1Recorder({
      queryResults() {
        return [{ fileName: 'legacy-fallback', objectKey: 'source-images/legacy-fallback/hash.png' }]
      },
    })
    const get = vi.fn(async (key: string) => key === 'legacy-fallback.png'
      ? createR2SourceImageObject(new Uint8Array([7, 8, 9]).buffer, { contentType: 'image/png' })
      : null)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
      backend,
    )

    expect(response.status).toBe(404)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('source-images/legacy-fallback/hash.png')
  })

  it('handles suggestion writes natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db, executions } = createD1Recorder()

    const request = new Request(`${baseUrl}/api/admin/suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywordsJson: JSON.stringify(['  Kanaut Nishe ', 'maid', 'kanaut   nishe']),
      }),
    })

    const response = await handleAdminApiRequest(
      request,
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Home featured keywords saved.',
    })
    const deleteOps = executions.filter(item =>
      item.query.includes('DELETE FROM home_featured_search_keywords'),
    )
    const insertOps = executions.filter(item =>
      item.query.includes('INSERT INTO home_featured_search_keywords'),
    )

    expect(deleteOps).toHaveLength(1)
    expect(insertOps).toHaveLength(1)
    expect(insertOps[0]!.values).toEqual(['Kanaut Nishe', 1, 'maid', 2])
  })

  it('handles creator alias writes natively when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db, executions } = createD1Recorder()

    const request = new Request(`${baseUrl}/api/admin/aliases/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rows: [
          { creatorName: 'Q (part 1)', aliases: ['Cue'] },
          { creatorName: 'Q (part 2)', aliases: ['cue'] },
        ],
      }),
    })

    const response = await handleAdminApiRequest(
      request,
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Creator aliases saved.',
    })
    const insertOps = executions.filter(item => item.query.includes('INSERT INTO creator_aliases'))
    expect(insertOps).toHaveLength(1)
    expect(insertOps[0]?.values[0]).toBe('Q')
    expect(JSON.parse(String(insertOps[0]?.values[1]))).toEqual(expect.arrayContaining(['Cue', 'cue']))
  })

  it('keeps creator alias rowsJson compatibility and delete semantics when DB binding exists', async () => {
    const backend = createCrudBackend()
    const { db, executions } = createD1Recorder()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/aliases/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rowsJson: JSON.stringify([
            { creatorName: 'Q (part 1)', alias: '' },
          ]),
        }),
      }),
      { DB: db },
      backend,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Creator aliases saved.',
    })

    const deleteOps = executions.filter(item => item.query.includes('DELETE FROM creator_aliases'))
    const insertOps = executions.filter(item => item.query.includes('INSERT INTO creator_aliases'))

    expect(deleteOps).toHaveLength(1)
    expect(deleteOps[0]?.values).toEqual(['Q'])
    expect(insertOps).toHaveLength(0)
  })

  it.each([
    {
      label: 'suggestion writes when DB binding is missing',
      request: () => new Request(`${baseUrl}/api/admin/suggestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: ['maid'] }),
      }),
      env: () => ({}),
      backend: () => createCrudBackend(),
      message: 'Admin worker DB binding is required for this route.',
    },
    {
      label: 'source-image replacement when IMAGES binding is missing',
      request: () => {
        const formData = new FormData()
        formData.set('commissionFileName', '20250301_sample-piece')
        formData.set('sourceImage', new File(['png'], 'sample.png', { type: 'image/png' }))
        return new Request(`${baseUrl}/api/admin/commissions/19/source-image`, {
          method: 'POST',
          body: formData,
        })
      },
      env: () => ({ DB: createD1Recorder().db }),
      // No injected backend: the default backend is what turns a missing IMAGES binding into a 503.
      backend: () => undefined,
      message: 'Admin worker IMAGES binding is required for this route.',
    },
    {
      label: 'bootstrap reads when DB binding is missing',
      request: () => new Request(`${baseUrl}/api/admin/bootstrap`, { method: 'GET' }),
      env: () => ({}),
      backend: () => createCrudBackend(),
      message: 'Admin worker DB binding is required for this route.',
    },
  ])('rejects $label', async ({ request, env, backend, message }) => {
    const response = await handleAdminApiRequest(request(), env(), backend())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: 'error',
      message,
    })
  })

  it('returns 404 for removed assets/refresh endpoint', async () => {
    const backend = createCrudBackend()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/assets/refresh`, { method: 'POST' }),
      {},
      backend,
    )

    expect(response.status).toBe(404)
  })
})
