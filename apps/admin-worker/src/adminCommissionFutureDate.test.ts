import type { AdminCrudBackend } from './adminApi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSQLiteD1 } from '../test/sqliteD1'
import { handleAdminApiRequest } from './adminApi'
import { createCommission } from './adminPersistence'

const baseUrl = 'http://127.0.0.1:8787'
const FUTURE_DATE_MESSAGE = 'Commission date cannot be in the future.'

function createBackend() {
  const success = () => new Response(JSON.stringify({ status: 'success', message: 'ok' }), {
    headers: { 'Content-Type': 'application/json' },
  })
  const backend = {
    getCharacterCommissions: vi.fn(async () => success()),
    createCharacter: vi.fn(async () => success()),
    updateCharacter: vi.fn(async () => success()),
    updateCharacterOrder: vi.fn(async () => success()),
    deleteCharacter: vi.fn(async () => success()),
    createCommission: vi.fn(async () => success()),
    updateCommission: vi.fn(async () => success()),
    deleteCommission: vi.fn(async () => success()),
    replaceCommissionSourceImage: vi.fn(async () => success()),
  } satisfies AdminCrudBackend
  return backend
}

function createCommissionRequest(commissionDate: string) {
  const formData = new FormData()
  formData.set('characterId', '7')
  formData.set('commissionDate', commissionDate)
  formData.set('creatorName', 'test-creator')
  formData.set('links', '')
  formData.set('sourceImage', new File(['png'], 'test.png', { type: 'image/png' }))
  return new Request(`${baseUrl}/api/admin/commissions`, { method: 'POST', body: formData })
}

function updateCommissionRequest(commissionDate: string) {
  return new Request(`${baseUrl}/api/admin/commissions/19`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: 3,
      commissionDate,
      creatorName: 'test-creator',
      workGroupId: null,
      partNumber: null,
      links: '',
      hidden: false,
    }),
  })
}

// Fixed clock: 12:00Z on 2026-10-09 is 2026-10-10 in UTC+14, the latest acceptable "today".
function setClock(iso: string) {
  vi.setSystemTime(new Date(iso))
}

describe('commission future-date rule at the API boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    setClock('2026-10-09T12:00:00Z')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['today in UTC', '2026-10-09'],
    ['today in UTC+14', '2026-10-10'],
  ])('accepts a create with %s', async (_label, commissionDate) => {
    const backend = createBackend()

    const response = await handleAdminApiRequest(createCommissionRequest(commissionDate), {}, backend)

    expect(response.status).toBe(200)
    expect(backend.createCommission).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['tomorrow in UTC+14', '2026-10-11'],
    ['far future', '2999-12-31'],
  ])('rejects a create with %s before delegating to backend', async (_label, commissionDate) => {
    const backend = createBackend()

    const response = await handleAdminApiRequest(createCommissionRequest(commissionDate), {}, backend)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ status: 'error', message: FUTURE_DATE_MESSAGE })
    expect(backend.createCommission).not.toHaveBeenCalled()
  })

  it('accepts a PATCH on today in UTC+14 and rejects tomorrow in UTC+14', async () => {
    const backend = createBackend()

    const accepted = await handleAdminApiRequest(updateCommissionRequest('2026-10-10'), {}, backend)
    expect(accepted.status).toBe(200)

    const rejected = await handleAdminApiRequest(updateCommissionRequest('2026-10-11'), {}, backend)
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ status: 'error', message: FUTURE_DATE_MESSAGE })
    expect(backend.updateCommission).toHaveBeenCalledTimes(1)
  })

  it('rejects a PATCH to 2999-12-31 before persistence', async () => {
    const backend = createBackend()

    const response = await handleAdminApiRequest(updateCommissionRequest('2999-12-31'), {}, backend)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ status: 'error', message: FUTURE_DATE_MESSAGE })
    expect(backend.updateCommission).not.toHaveBeenCalled()
  })

  it('moves the boundary at 10:00Z, when UTC+14 midnight rolls the calendar date over', async () => {
    const backend = createBackend()

    setClock('2026-10-09T09:59:59.999Z')
    const beforeRollover = await handleAdminApiRequest(updateCommissionRequest('2026-10-10'), {}, backend)
    expect(beforeRollover.status).toBe(400)

    setClock('2026-10-09T10:00:00Z')
    const afterRollover = await handleAdminApiRequest(updateCommissionRequest('2026-10-10'), {}, backend)
    expect(afterRollover.status).toBe(200)
  })
})

describe('commission future-date rule in persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    setClock('2026-10-09T12:00:00Z')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a far-future create without writing any row', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'Fixture\', \'active\', 1)')

    await expect(createCommission(db, {
      characterId: 1,
      commissionDate: '2999-12-31',
      creatorName: 'Fixture Creator',
      fileName: 'future-key',
      links: [],
    }, {
      commissionFileName: 'future-key',
      objectKey: 'source-images/future-key/hash.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash',
    })).rejects.toThrow(FUTURE_DATE_MESSAGE)

    expect(database.prepare('SELECT COUNT(*) AS count FROM commissions').get()).toEqual({ count: 0 })
  })
})

describe('malformed JSON on non-batch mutation routes', () => {
  // Pins current behaviour: body parsing sits outside the try/catch, so the handler
  // rejects instead of returning the JSON error envelope.
  it('rejects a character create with a SyntaxError', async () => {
    const backend = createBackend()
    const request = new Request(`${baseUrl}/api/admin/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    })

    await expect(handleAdminApiRequest(request, {}, backend)).rejects.toThrow(SyntaxError)
    expect(backend.createCharacter).not.toHaveBeenCalled()
  })

  it('rejects a commission PATCH with a SyntaxError', async () => {
    const backend = createBackend()
    const request = new Request(`${baseUrl}/api/admin/commissions/19`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"characterId":',
    })

    await expect(handleAdminApiRequest(request, {}, backend)).rejects.toThrow(SyntaxError)
    expect(backend.updateCommission).not.toHaveBeenCalled()
  })
})
