import type { DatabaseSync } from 'node:sqlite'
import type {
  AdminCrudBackend,
  CreateCharacterInput,
  CreateCommissionInput,
  UpdateCommissionInput,
} from './adminApi'
import { describe, expect, it, vi } from 'vitest'
import { seedAdminReadFixture } from '../test/adminReadSeed'
import { createSQLiteD1 } from '../test/sqliteD1'
import {
  handleAdminApiRequest,
} from './adminApi'

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

function createImagesBucketRecorder(options: {
  existingKeys?: string[]
  existingObjects?: Record<string, { body?: ArrayBuffer, contentType?: string }>
} = {}) {
  const existingKeys = new Set(options.existingKeys ?? [])
  const existingObjects = options.existingObjects ?? {}
  const put = vi.fn(async (_key: string, _value: ArrayBuffer, _options?: { httpMetadata?: { contentType?: string } }) => ({}))
  const deleteObject = vi.fn(async (_keys: string | string[]) => ({}))
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

const uuidV4Pattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
const flatPngKeyPattern = /^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/
const flatJpgKeyPattern = /^source-images\/[a-f0-9]{64}-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.jpg$/

function insertCharacter(database: DatabaseSync, id: number, name: string, status = 'active', sortOrder = id) {
  database.prepare('INSERT INTO characters (id, name, status, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, name, status, sortOrder)
}

function insertCommission(database: DatabaseSync, row: {
  id: number
  characterId: number
  fileName: string
  commissionDate?: string
  creatorName?: string
  workGroupId?: string | null
  partNumber?: number | null
  links?: string
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: number
}) {
  database.prepare(`
    INSERT INTO commissions (
      id, character_id, file_name, commission_date, creator_name, work_group_id, part_number,
      links, design, description, keyword, hidden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.characterId,
    row.fileName,
    row.commissionDate ?? '2025-03-01',
    row.creatorName ?? 'sample-piece',
    row.workGroupId ?? null,
    row.partNumber ?? null,
    row.links ?? '[]',
    row.design ?? null,
    row.description ?? null,
    row.keyword ?? null,
    row.hidden ?? 0,
  )
}

function insertSourceImage(database: DatabaseSync, commissionFileName: string, commissionId: number | null, objectKey: string) {
  database.prepare(`
    INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256)
    VALUES (?, ?, ?, 'image/jpeg', 3, 'hash')
  `).run(commissionFileName, commissionId, objectKey)
}

// Character 7 owns one commission + source image per key; character 8 is a bystander that must survive.
function seedDeletableCharacter(database: DatabaseSync, objectKeys: string[]) {
  database.exec('BEGIN')
  insertCharacter(database, 7, 'Alice')
  objectKeys.forEach((objectKey, index) => {
    const id = 1000 + index
    insertCommission(database, { id, characterId: 7, fileName: `alice-${index}` })
    insertSourceImage(database, `alice-${index}`, id, objectKey)
  })
  insertCharacter(database, 8, 'Bystander')
  insertCommission(database, { id: 800, characterId: 8, fileName: 'bystander' })
  insertSourceImage(database, 'bystander', 800, 'source-images/bystander.jpg')
  database.exec('COMMIT')
}

function countRows(database: DatabaseSync, table: string) {
  return (database.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count
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

  it('handles create-character natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'Existing', 'active', 4)

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
    expect(database.prepare('SELECT name, status, sort_order FROM characters ORDER BY sort_order').all()).toEqual([
      { name: 'Existing', status: 'active', sort_order: 4 },
      { name: 'Alice', status: 'archived', sort_order: 5 },
    ])
  })

  it('handles update-character natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 14, 'Before', 'archived', 1)

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
    expect(database.prepare('SELECT id, name, status, sort_order FROM characters').all()).toEqual([
      { id: 14, name: 'Renamed', status: 'active', sort_order: 1 },
    ])
  })

  it('handles character reordering natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'One', 'archived', 3)
    insertCharacter(database, 2, 'Two', 'active', 1)
    insertCharacter(database, 3, 'Three', 'active', 2)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        // String identifiers must be coerced to numbers before persistence.
        body: JSON.stringify({
          active: ['1', 2],
          archived: ['3'],
        }),
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character order updated.',
    })
    expect(database.prepare('SELECT id, status, sort_order FROM characters ORDER BY id').all()).toEqual([
      { id: 1, status: 'active', sort_order: 1 },
      { id: 2, status: 'active', sort_order: 2 },
      { id: 3, status: 'archived', sort_order: 3 },
    ])
  })

  it('handles delete-character natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    seedDeletableCharacter(database, ['source-images/aaa-hash.jpg'])
    const { bucket } = createImagesBucketRecorder()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db, IMAGES: bucket },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character deleted.',
    })
    expect(database.prepare('SELECT id FROM characters').all()).toEqual([{ id: 8 }])
    expect(database.prepare('SELECT id FROM commissions').all()).toEqual([{ id: 800 }])
    expect(database.prepare('SELECT object_key FROM source_images').all())
      .toEqual([{ object_key: 'source-images/bystander.jpg' }])
  })

  it('deletes exactly the character source-image R2 objects after the D1 commit', async () => {
    const { database, db } = createSQLiteD1()
    seedDeletableCharacter(database, ['source-images/aaa-hash.jpg'])
    // A legacy row linked only by commission_file_name must be found by the same delete predicate.
    insertCommission(database, { id: 2000, characterId: 7, fileName: 'alice-legacy' })
    insertSourceImage(database, 'alice-legacy', null, 'source-images/bbb-hash.png')
    const { bucket, deleteObject } = createImagesBucketRecorder()
    const characterRowsAtR2Delete: number[] = []
    deleteObject.mockImplementation(async () => {
      characterRowsAtR2Delete.push(
        (database.prepare('SELECT COUNT(*) as count FROM characters WHERE id = 7').get() as { count: number }).count,
      )
      return {}
    })

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db, IMAGES: bucket },
    )

    expect(response.status).toBe(200)
    // One batched delete call keeps the keys exactly the set read back from D1 before the commit.
    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect((deleteObject.mock.calls[0]![0] as string[]).toSorted())
      .toEqual(['source-images/aaa-hash.jpg', 'source-images/bbb-hash.png'])
    // D1 must commit before any object is removed; a lost delete keeps the row and loses the object otherwise.
    expect(characterRowsAtR2Delete).toEqual([0])
  })

  it('keeps the D1 delete committed and returns 200 when R2 cleanup fails', async () => {
    const { database, db } = createSQLiteD1()
    seedDeletableCharacter(database, ['source-images/aaa-hash.jpg'])
    const { bucket, deleteObject } = createImagesBucketRecorder()
    deleteObject.mockRejectedValue(new Error('R2 unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db, IMAGES: bucket },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Character deleted.',
    })
    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(database.prepare('SELECT id FROM characters').all()).toEqual([{ id: 8 }])
    expect(database.prepare('SELECT id FROM commissions').all()).toEqual([{ id: 800 }])
    expect(warn).toHaveBeenCalled()
  })

  it('returns 503 without deleting D1 rows when the IMAGES binding is missing', async () => {
    const { database, db } = createSQLiteD1()
    seedDeletableCharacter(database, ['source-images/aaa-hash.jpg'])

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db },
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: 'error',
      message: 'Admin worker IMAGES binding is required for this route.',
    })
    expect(countRows(database, 'characters')).toBe(2)
    expect(countRows(database, 'commissions')).toBe(2)
    expect(countRows(database, 'source_images')).toBe(2)
  })

  it('deletes R2 objects in batches of at most 1000 keys', async () => {
    const { database, db } = createSQLiteD1()
    const objectKeys = Array.from({ length: 2500 }, (_, index) => `source-images/key-${index}.jpg`)
    seedDeletableCharacter(database, objectKeys)
    const { bucket, deleteObject } = createImagesBucketRecorder()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/7`, {
        method: 'DELETE',
      }),
      { DB: db, IMAGES: bucket },
    )

    expect(response.status).toBe(200)
    // The R2 binding rejects more than 1000 keys per delete call.
    expect(deleteObject.mock.calls.map(([keys]) => (keys as string[]).length)).toEqual([1000, 1000, 500])
    expect(deleteObject.mock.calls.flatMap(([keys]) => keys as string[]).toSorted()).toEqual(objectKeys.toSorted())
  })

  it('handles create-commission natively when DB and IMAGES bindings exist', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 7, 'Alice')
    const { bucket, get, put, deleteObject } = createImagesBucketRecorder()

    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '  2025-03-01  ')
    formData.set('creatorName', '  sample-piece  ')
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
    const objectKey = put.mock.calls[0]?.[0]
    expect(objectKey).toMatch(flatPngKeyPattern)
    expect(put.mock.calls[0]?.[2]).toEqual({
      httpMetadata: {
        contentType: 'image/png',
      },
    })
    expect(deleteObject).not.toHaveBeenCalled()

    const commissions = database.prepare(`
      SELECT id, public_id, character_id, commission_date, creator_name, work_group_id, part_number,
        file_name, links, design, description, keyword, hidden
      FROM commissions
    `).all() as Array<{ id: number, file_name: string }>
    expect(commissions).toEqual([{
      id: expect.any(Number),
      public_id: expect.stringMatching(uuidV4Pattern),
      character_id: 7,
      commission_date: '2025-03-01',
      creator_name: 'sample-piece',
      work_group_id: null,
      part_number: null,
      file_name: expect.stringMatching(/^commission-[\w-]+$/),
      links: '["https://a.example","https://b.example"]',
      design: 'outfit',
      description: 'desc',
      keyword: 'tag',
      hidden: 1,
    }])
    expect(database.prepare('SELECT commission_file_name, commission_id, object_key, mime_type, byte_size FROM source_images').all())
      .toEqual([{
        commission_file_name: commissions[0]!.file_name,
        commission_id: commissions[0]!.id,
        object_key: objectKey,
        mime_type: 'image/png',
        byte_size: 3,
      }])
  })

  it('does not delete an existing commission when a create insert conflicts', async () => {
    const { database, db, batchCallCount } = createSQLiteD1()
    const workGroupId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    insertCharacter(database, 7, 'Alice')
    database.prepare('INSERT INTO commission_groups (id) VALUES (?)').run(workGroupId)
    insertCommission(database, { id: 70, characterId: 7, fileName: 'existing-part-1', workGroupId, partNumber: 1 })
    insertSourceImage(database, 'existing-part-1', 70, 'source-images/existing.jpg')
    const commissionsBefore = database.prepare('SELECT * FROM commissions').all()
    const sourceImagesBefore = database.prepare('SELECT * FROM source_images').all()
    const { bucket, put, deleteObject } = createImagesBucketRecorder()

    // Reusing (work group, part 1) violates the real unique index inside the create batch.
    const formData = new FormData()
    formData.set('characterId', '7')
    formData.set('commissionDate', '2025-03-01')
    formData.set('creatorName', 'sample-piece')
    formData.set('workGroupId', workGroupId)
    formData.set('partNumber', '1')
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
      message: expect.stringContaining('UNIQUE constraint failed'),
    })
    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT * FROM commissions').all()).toEqual(commissionsBefore)
    expect(database.prepare('SELECT * FROM source_images').all()).toEqual(sourceImagesBefore)
    expect(put).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
    expect(put.mock.calls[0]?.[0]).toMatch(flatPngKeyPattern)
  })

  it('handles update-commission natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'Alice')
    insertCharacter(database, 3, 'Gamma')
    insertCommission(database, {
      id: 19,
      characterId: 1,
      fileName: '20250301_sample-piece',
      commissionDate: '2025-03-01',
      creatorName: 'sample-piece',
      links: '["https://a.example"]',
      design: 'old',
      description: 'old desc',
      keyword: 'old',
      hidden: 0,
    })
    const { bucket, get, put, deleteObject } = createImagesBucketRecorder()

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characterId: '3',
          commissionDate: '  2025-03-02  ',
          creatorName: '  updated-piece  ',
          workGroupId: '',
          partNumber: '',
          links: ' one \n two ',
          design: '  new design  ',
          description: '',
          keyword: '  glow  ',
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
    expect(database.prepare(`
      SELECT character_id, commission_date, creator_name, work_group_id, part_number,
        file_name, links, design, description, keyword, hidden
      FROM commissions WHERE id = 19
    `).get()).toEqual({
      character_id: 3,
      commission_date: '2025-03-02',
      creator_name: 'updated-piece',
      work_group_id: null,
      part_number: null,
      file_name: '20250301_sample-piece',
      links: '["one","two"]',
      design: 'new design',
      description: null,
      keyword: 'glow',
      hidden: 1,
    })
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('clears a grouped part when PATCH sends null work group and part number', async () => {
    const { database, db } = createSQLiteD1()
    const workGroupId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    insertCharacter(database, 1, 'Alice')
    database.prepare('INSERT INTO commission_groups (id) VALUES (?)').run(workGroupId)
    insertCommission(database, { id: 19, characterId: 1, fileName: '20250301_sample-piece', workGroupId, partNumber: 1 })

    // The admin edit form sends null (not '') for an ungrouped commission.
    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/19`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 1,
          commissionDate: '2025-03-01',
          creatorName: 'sample-piece',
          workGroupId: null,
          partNumber: null,
          links: '',
          hidden: false,
        }),
      }),
      { DB: db },
    )

    expect(response.status).toBe(200)
    expect(database.prepare('SELECT work_group_id, part_number FROM commissions WHERE id = 19').get())
      .toEqual({ work_group_id: null, part_number: null })
  })

  it('handles delete-commission natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'Alice')
    insertCommission(database, { id: 19, characterId: 1, fileName: '20250301_sample-piece' })
    insertSourceImage(database, '20250301_sample-piece', 19, 'source-images/deleted.jpg')
    insertCommission(database, { id: 20, characterId: 1, fileName: '20250302_kept-piece' })
    insertSourceImage(database, '20250302_kept-piece', 20, 'source-images/kept.jpg')

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
    expect(database.prepare('SELECT id FROM commissions').all()).toEqual([{ id: 20 }])
    expect(database.prepare('SELECT commission_id, object_key FROM source_images').all())
      .toEqual([{ commission_id: 20, object_key: 'source-images/kept.jpg' }])
  })

  it('handles source-image replacement natively when DB and IMAGES bindings exist', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'Alice')
    insertCommission(database, { id: 19, characterId: 1, fileName: '20250301_alice-maker' })
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
    expect(put.mock.calls[0]?.[0]).toMatch(flatJpgKeyPattern)
    expect(deleteObject).not.toHaveBeenCalled()
    // The stored identity comes from D1's file_name, never from the client-sent commissionFileName.
    expect(database.prepare('SELECT commission_file_name, commission_id, object_key, mime_type, byte_size FROM source_images').all())
      .toEqual([{
        commission_file_name: '20250301_alice-maker',
        commission_id: 19,
        object_key: put.mock.calls[0]?.[0],
        mime_type: 'image/jpeg',
        byte_size: 3,
      }])
  })

  it('keeps filename metadata while identical successive uploads get distinct flat keys', async () => {
    const { database, db } = createSQLiteD1()
    insertCharacter(database, 1, 'Alice')
    insertCommission(database, { id: 19, characterId: 1, fileName: '20250301_alice-maker' })
    const { bucket, put, deleteObject } = createImagesBucketRecorder()
    const selectSourceImages = database.prepare(
      'SELECT commission_file_name, commission_id, object_key, mime_type, byte_size, sha256 FROM source_images',
    )
    const storedKeysAtR2Delete: unknown[] = []
    deleteObject.mockImplementation(async () => {
      storedKeysAtR2Delete.push(selectSourceImages.all().map(row => row.object_key))
      return {}
    })
    const storedRows = []
    for (let index = 0; index < 2; index += 1) {
      const formData = new FormData()
      formData.set('commissionFileName', 'stale-client-name')
      formData.set('sourceImage', new File(['same bytes'], 'sample.png', { type: 'image/png' }))
      const response = await handleAdminApiRequest(
        new Request(`${baseUrl}/api/admin/commissions/19/source-image`, { method: 'POST', body: formData }),
        { DB: db, IMAGES: bucket },
      )
      expect(response.status).toBe(200)
      storedRows.push(selectSourceImages.all())
    }
    const keys = put.mock.calls.map(call => call[0])
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    for (const key of keys) {
      expect(key).toMatch(flatPngKeyPattern)
      expect(key).not.toContain('20250301_alice-maker')
    }
    // One metadata row per commission: each upload replaces it, keeping filename, size and hash.
    expect(storedRows.map(rows => rows.map(row => row.object_key))).toEqual([[keys[0]], [keys[1]]])
    for (const rows of storedRows) {
      expect(rows[0]).toMatchObject({
        commission_file_name: '20250301_alice-maker',
        commission_id: 19,
        mime_type: 'image/png',
        byte_size: 10,
        sha256: storedRows[0]![0]!.sha256,
      })
    }
    // The replaced object is released once the new metadata row is committed.
    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith(keys[0])
    // Deleting first would lose the live image if the D1 write then failed.
    expect(storedKeysAtR2Delete).toEqual([[keys[1]]])
  })

  it('loads bootstrap data natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/bootstrap`, { method: 'GET' }),
      { DB: db },
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
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/aliases/bootstrap`, { method: 'GET' }),
      { DB: db },
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
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/suggestion`, { method: 'GET' }),
      { DB: db },
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
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/characters/1/commissions`, { method: 'GET' }),
      { DB: db },
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
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)
    const imageBody = new Uint8Array([1, 2, 3]).buffer
    const get = vi.fn(async (key: string) => key === 'source-images/commission-opaque-key/hash.jpg'
      ? createR2SourceImageObject(imageBody, { contentType: 'image/jpeg', httpEtag: '"hash-etag"' })
      : null)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
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
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)
    const imageBody = new Uint8Array([4, 5, 6]).buffer
    const etag = '"hash-etag"'
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
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': etag },
      }),
      { DB: db, IMAGES: { get: matchingGet } },
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
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': '"other-etag"' },
      }),
      { DB: db, IMAGES: { get } },
    )

    expect(stale.status).toBe(200)
    expect(stale.headers.get('ETag')).toBe(etag)
    expect(await stale.arrayBuffer()).toEqual(imageBody)
  })

  it('returns 404 without probing root keys when the commission has no source-image metadata', async () => {
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)
    const get = vi.fn(async (_key: string) =>
      createR2SourceImageObject(new Uint8Array([7, 8, 9]).buffer, { contentType: 'image/png' }))

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/11/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
    expect(get).not.toHaveBeenCalled()
  })

  it('returns 404 when the resolved object key is missing from R2 instead of trying other keys', async () => {
    const { database, db } = createSQLiteD1()
    seedAdminReadFixture(database)
    const get = vi.fn(async (key: string) => key === '20250301_alice-maker.jpg'
      ? createR2SourceImageObject(new Uint8Array([7, 8, 9]).buffer, { contentType: 'image/jpeg' })
      : null)

    const response = await handleAdminApiRequest(
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, { method: 'GET' }),
      { DB: db, IMAGES: { get } },
    )

    expect(response.status).toBe(404)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('source-images/commission-opaque-key/hash.jpg')
  })

  it('handles suggestion writes natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES (\'stale\', 1)')

    const request = new Request(`${baseUrl}/api/admin/suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywordsJson: JSON.stringify(['  Kanaut Nishe ', 'maid', 'kanaut   nishe']),
      }),
    })

    const response = await handleAdminApiRequest(request, { DB: db })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Home featured keywords saved.',
    })
    expect(database.prepare('SELECT keyword, sort_order FROM home_featured_search_keywords ORDER BY sort_order').all())
      .toEqual([
        { keyword: 'Kanaut Nishe', sort_order: 1 },
        { keyword: 'maid', sort_order: 2 },
      ])
  })

  it('handles creator alias writes natively when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()

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

    const response = await handleAdminApiRequest(request, { DB: db })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Creator aliases saved.',
    })
    const rows = database.prepare('SELECT creator_name, aliases FROM creator_aliases').all() as Array<{ creator_name: string, aliases: string }>
    expect(rows.map(row => row.creator_name)).toEqual(['Q'])
    expect(JSON.parse(rows[0]!.aliases)).toEqual(expect.arrayContaining(['Cue', 'cue']))
  })

  it('keeps creator alias rowsJson compatibility and delete semantics when DB binding exists', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`INSERT INTO creator_aliases (creator_name, aliases) VALUES ('Q', '["old"]'), ('Other', '["o"]')`)

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
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'success',
      message: 'Creator aliases saved.',
    })
    expect(database.prepare('SELECT creator_name, aliases FROM creator_aliases').all())
      .toEqual([{ creator_name: 'Other', aliases: '["o"]' }])
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
      env: () => ({ DB: createSQLiteD1().db }),
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
