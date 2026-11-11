import type { CharacterStatus } from '../../../packages/domain/src/index'
import type { D1DatabaseLike } from './adminPersistence'
import { failure, failureFrom, handleAdminReadRequest, json, parseIdFromPath, success } from './adminData'
import { INTEREST_SINCE, loadInterestCounts, loadLinkClicks } from './adminInterest'
import {
  createCharacter as persistCharacterCreate,
  deleteCharacter as persistCharacterDelete,
  updateCharacterOrder as persistCharacterOrderUpdate,
  updateCharacter as persistCharacterUpdate,
  createCommission as persistCommissionCreate,
  deleteCommission as persistCommissionDelete,
  getCommissionFileName as persistCommissionFileName,
  updateCommission as persistCommissionUpdate,
  saveSourceImageMetadata as persistSourceImageMetadata,
  getSourceImageMetadata as persistSourceImageMetadataGet,
  resolveD1Database,
  saveCharacterAliasesBatch,
  saveCreatorAliasesBatch,
  saveHomeFeaturedSearchKeywords,
  saveKeywordAliasesBatch,
} from './adminPersistence'
import {
  MAX_SOURCE_IMAGE_BYTES,
  resolveImageWriteBucket,
  saveSourceImageToBucket,
  UPLOAD_TOO_LARGE_MESSAGE,
} from './adminSourceImages'
import { validateCommissionDate, validateCommissionWorkGroup } from './commissionValidation'

// R2 bulk delete rejects calls with more than 1000 keys.
const R2_DELETE_BATCH_LIMIT = 1000
const CHARACTER_ITEM_PATH_PATTERN = /^\/api\/admin\/characters\/\d+$/
const CHARACTER_ITEM_ID_PATTERN = /^\/api\/admin\/characters\/(\d+)$/
const COMMISSION_ITEM_PATH_PATTERN = /^\/api\/admin\/commissions\/\d+$/
const COMMISSION_ITEM_ID_PATTERN = /^\/api\/admin\/commissions\/(\d+)$/
const COMMISSION_SOURCE_IMAGE_PATH_PATTERN = /^\/api\/admin\/commissions\/\d+\/source-image$/
const COMMISSION_SOURCE_IMAGE_ID_PATTERN = /^\/api\/admin\/commissions\/(\d+)\/source-image$/

export interface Env {
  DB?: unknown
  IMAGES?: unknown
  GITHUB_DISPATCH_TOKEN?: string
  RYBBIT_API_KEY?: string
}

function buildRebuildDispatchBody(dispatchedAt: string) {
  return {
    event_type: 'admin-data-changed',
    client_payload: {
      fact_source_version: dispatchedAt,
    },
  }
}

interface CommissionFields {
  characterId: number
  commissionDate: string
  creatorName: string | null
  workGroupId: string | null
  partNumber: number | null
  links: string[]
  design?: string
  description?: string
  keyword?: string
  hidden: boolean
}

export interface CreateCharacterInput {
  name: string
  status: CharacterStatus
}

export interface UpdateCharacterInput extends CreateCharacterInput {
  id: number
}

export interface CharacterOrderPayload {
  active: number[]
  archived: number[]
}

export interface CreateCommissionInput extends CommissionFields {
  sourceImage: File
}

export interface UpdateCommissionInput extends CommissionFields {
  id: number
}

export interface ReplaceCommissionSourceImageInput {
  id: number
  sourceImage: File
}

export interface AdminCrudBackend {
  createCharacter: (input: CreateCharacterInput) => Promise<Response>
  updateCharacter: (input: UpdateCharacterInput) => Promise<Response>
  updateCharacterOrder: (payload: CharacterOrderPayload) => Promise<Response>
  deleteCharacter: (id: number) => Promise<Response>
  createCommission: (input: CreateCommissionInput) => Promise<Response>
  updateCommission: (input: UpdateCommissionInput) => Promise<Response>
  deleteCommission: (id: number) => Promise<Response>
  replaceCommissionSourceImage: (input: ReplaceCommissionSourceImageInput) => Promise<Response>
}

function notFound() {
  return json({
    status: 'error',
    message: 'Not Found',
  }, 404)
}

function bindingFailure(message: string) {
  return failure(message, 503)
}

function createMissingBindingResponses(hasDb: boolean, hasImages: boolean) {
  return {
    dbOnly: () => bindingFailure('Admin worker DB binding is required for this route.'),
    dbAndImages: () => bindingFailure(
      hasDb
        ? 'Admin worker IMAGES binding is required for this route.'
        : hasImages
          ? 'Admin worker DB binding is required for this route.'
          : 'Admin worker DB and IMAGES bindings are required for this route.',
    ),
  }
}

function parseLinks(rawValue: string) {
  return rawValue
    .split('\n')
    .map(link => link.trim())
    .filter(Boolean)
}

function parseOptionalField(rawValue: string) {
  return rawValue.trim() || undefined
}

function normalizeCommissionPartFields(input: { workGroupId: string, partNumber: string }) {
  const workGroupId = input.workGroupId.trim().toLowerCase() || null
  const rawPartNumber = input.partNumber.trim()
  const partNumber = rawPartNumber
    ? Number(rawPartNumber)
    : null
  return { workGroupId, partNumber }
}

function parseCharacterStatus(value: unknown): CharacterStatus {
  return String(value) === 'archived'
    ? 'archived'
    : 'active'
}

function parseCommissionFields(input: {
  characterId: number
  commissionDate: string
  creatorName: string
  workGroupId: string
  partNumber: string
  links: string
  design: string
  description: string
  keyword: string
  hidden: boolean
}): CommissionFields {
  const { workGroupId, partNumber } = normalizeCommissionPartFields(input)
  return {
    characterId: input.characterId,
    commissionDate: input.commissionDate.trim(),
    creatorName: input.creatorName.trim() || null,
    workGroupId,
    partNumber,
    links: parseLinks(input.links),
    design: parseOptionalField(input.design),
    description: parseOptionalField(input.description),
    keyword: parseOptionalField(input.keyword),
    hidden: input.hidden,
  }
}

function parseCommissionFieldsFromForm(formData: FormData) {
  return parseCommissionFields({
    characterId: Number(formData.get('characterId')),
    commissionDate: formData.get('commissionDate')?.toString() ?? '',
    creatorName: formData.get('creatorName')?.toString() ?? '',
    workGroupId: formData.get('workGroupId')?.toString() ?? '',
    partNumber: formData.get('partNumber')?.toString() ?? '',
    links: formData.get('links')?.toString() ?? '',
    design: formData.get('design')?.toString() ?? '',
    description: formData.get('description')?.toString() ?? '',
    keyword: formData.get('keyword')?.toString() ?? '',
    hidden: formData.get('hidden') === 'on',
  })
}

function parseCommissionFieldsFromJson(payload: Record<string, unknown>) {
  const rawCreatorName = payload.creatorName
  return parseCommissionFields({
    characterId: Number(payload.characterId),
    commissionDate: String(payload.commissionDate ?? ''),
    creatorName: rawCreatorName === null || typeof rawCreatorName === 'string'
      ? String(rawCreatorName ?? '')
      : '\u0000',
    workGroupId: payload.workGroupId === null || typeof payload.workGroupId === 'string'
      ? String(payload.workGroupId ?? '')
      : '\u0000',
    partNumber: payload.partNumber === null || payload.partNumber === undefined
      ? ''
      : typeof payload.partNumber === 'number' || typeof payload.partNumber === 'string'
        ? String(payload.partNumber)
        : '\u0000',
    links: String(payload.links ?? ''),
    design: String(payload.design ?? ''),
    description: String(payload.description ?? ''),
    keyword: String(payload.keyword ?? ''),
    hidden: Boolean(payload.hidden),
  })
}

function isHttpUrl(value: string) {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)
}

function validateCommissionFields(fields: Pick<CommissionFields, 'characterId' | 'commissionDate' | 'creatorName' | 'workGroupId' | 'partNumber' | 'links' | 'design'>) {
  if (!Number.isFinite(fields.characterId) || fields.characterId <= 0) {
    return 'Character selection is required.'
  }

  const dateError = validateCommissionDate(fields.commissionDate)
  if (dateError) {
    return dateError
  }

  if (fields.creatorName && [...fields.creatorName].some(character => character.charCodeAt(0) <= 0x1F)) {
    return 'Creator name must be a string or null.'
  }

  // Links and design are rendered into href on the public site, so only absolute http(s) URLs may pass (blocks javascript: etc.).
  for (const link of fields.links) {
    if (!isHttpUrl(link)) {
      return `Link "${link}" must be an http(s) URL.`
    }
  }
  if (fields.design && !isHttpUrl(fields.design)) {
    return `Design "${fields.design}" must be an http(s) URL.`
  }

  return validateCommissionWorkGroup(fields.workGroupId, fields.partNumber)
}

// Allowance for the other form fields and multipart framing around the image part.
const UPLOAD_MULTIPART_OVERHEAD_BYTES = 1024 * 1024

// request.formData() buffers the whole body, so reject a declared oversized body before reading it. A body without
// Content-Length (chunked) still reaches the per-file check in saveSourceImageToBucket.
function exceedsUploadBodyLimit(request: Request) {
  const declaredLength = Number(request.headers.get('content-length'))
  return Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_IMAGE_BYTES + UPLOAD_MULTIPART_OVERHEAD_BYTES
}

function getUploadedSourceImage(formData: FormData) {
  const entry = formData.get('sourceImage')
  if (!(entry instanceof File)) {
    return null
  }

  if (!entry.name.trim() || entry.size <= 0) {
    return null
  }

  return entry
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const payload = await request.json() as unknown
  return payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}
}

function parseStructuredArray<T>(value: unknown, fallbackFieldValue?: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  const rawValue = fallbackFieldValue ?? value ?? '[]'
  const parsed = JSON.parse(String(rawValue)) as unknown
  return Array.isArray(parsed)
    ? parsed as T[]
    : []
}

// Full replace: a payload that carries no recognisable list must not be read as "clear everything".
function parseFeaturedKeywords(body: Record<string, unknown>) {
  if (Array.isArray(body.keywords)) {
    return body.keywords.map(String)
  }
  const raw = typeof body.keywordsJson === 'string'
    ? body.keywordsJson
    : body.keywords
  if (typeof raw !== 'string') {
    return null
  }
  const parsed = JSON.parse(raw) as unknown
  return Array.isArray(parsed)
    ? parsed.map(String)
    : null
}

async function handleCrudBackendRequest(operation: () => Promise<Response>) {
  try {
    return await operation()
  }
  catch (error) {
    return failureFrom(error, 'Admin worker request failed.', 500)
  }
}

function createUnavailableCrudBackend(hasDb: boolean, hasImages: boolean): AdminCrudBackend {
  const missing = createMissingBindingResponses(hasDb, hasImages)

  return {
    createCharacter: async () => missing.dbOnly(),
    updateCharacter: async () => missing.dbOnly(),
    updateCharacterOrder: async () => missing.dbOnly(),
    // Cascade delete now also cleans R2 objects, so missing IMAGES cannot delete only D1 rows and leave unrecoverable orphans.
    deleteCharacter: async () => missing.dbAndImages(),
    createCommission: async () => missing.dbAndImages(),
    updateCommission: async () => missing.dbOnly(),
    deleteCommission: async () => missing.dbOnly(),
    replaceCommissionSourceImage: async () => missing.dbAndImages(),
  }
}

function createNativeCrudBackend(
  db: D1DatabaseLike,
  imagesBucket: ReturnType<typeof resolveImageWriteBucket>,
  unavailableBackend: AdminCrudBackend,
): AdminCrudBackend {
  return {
    ...unavailableBackend,
    async createCharacter(input) {
      try {
        const name = await persistCharacterCreate(db, input)
        return success(`Character "${name}" created.`)
      }
      catch (error) {
        return failureFrom(error, 'Failed to create character.')
      }
    },
    async updateCharacter(input) {
      try {
        const name = await persistCharacterUpdate(db, input)
        return success(`Character "${name}" updated.`)
      }
      catch (error) {
        return failureFrom(error, 'Failed to update character.')
      }
    },
    async updateCharacterOrder(payload) {
      try {
        await persistCharacterOrderUpdate(db, payload)
        return success('Character order updated.')
      }
      catch (error) {
        return failureFrom(error, 'Failed to update character order.')
      }
    },
    async deleteCharacter(id) {
      if (!imagesBucket) {
        return unavailableBackend.deleteCharacter(id)
      }

      let objectKeys: string[]
      try {
        // Commit D1 first: a failure keeps the old 400 semantics and no R2 object has been touched yet.
        objectKeys = await persistCharacterDelete(db, id)
      }
      catch (error) {
        return failureFrom(error, 'Failed to delete character.')
      }

      try {
        // R2 bulk delete accepts at most 1000 keys per call.
        for (let offset = 0; offset < objectKeys.length; offset += R2_DELETE_BATCH_LIMIT) {
          await imagesBucket.delete(objectKeys.slice(offset, offset + R2_DELETE_BATCH_LIMIT))
        }
      }
      catch (error) {
        // D1 already committed, so the response must not roll back or 5xx; the surviving objects stay in R2 and the inventory script reclaims them by D1 diff.
        console.warn(`Character ${id} deleted, but R2 cleanup for ${objectKeys.length} object(s) failed.`, error)
      }

      return success('Character deleted.')
    },
    async createCommission(input) {
      if (!imagesBucket) {
        return unavailableBackend.createCommission(input)
      }

      const assetKey = `commission-${crypto.randomUUID()}`
      let uploadedSourceImage: Awaited<ReturnType<typeof saveSourceImageToBucket>> | null = null

      try {
        uploadedSourceImage = await saveSourceImageToBucket(imagesBucket, {
          commissionFileName: assetKey,
          file: input.sourceImage,
        })
      }
      catch (error) {
        return failureFrom(error, 'Failed to save source image.')
      }

      try {
        const { characterName } = await persistCommissionCreate(db, {
          ...input,
          fileName: assetKey,
        }, uploadedSourceImage)
        return success(`Commission dated ${input.commissionDate} added to ${characterName}.`)
      }
      catch (error) {
        // 保留新对象以覆盖“D1 已提交但响应丢失”的不确定窗口；孤儿对象可安全清理。
        return failureFrom(error, 'Failed to add commission.')
      }
    },
    async updateCommission(input) {
      try {
        await persistCommissionUpdate(db, input)

        return success(`Commission dated ${input.commissionDate} updated.`)
      }
      catch (error) {
        return failureFrom(error, 'Failed to update commission.')
      }
    },
    async deleteCommission(id) {
      try {
        await persistCommissionDelete(db, id)
        return success('Commission deleted.')
      }
      catch (error) {
        return failureFrom(error, 'Failed to delete commission.')
      }
    },
    async replaceCommissionSourceImage(input) {
      if (!imagesBucket) {
        return unavailableBackend.replaceCommissionSourceImage(input)
      }

      try {
        const commissionFileName = await persistCommissionFileName(db, input.id)
        const previousImage = await persistSourceImageMetadataGet(db, commissionFileName)
        const savedSourceImage = await saveSourceImageToBucket(imagesBucket, {
          commissionFileName,
          file: input.sourceImage,
        })
        try {
          await persistSourceImageMetadata(db, savedSourceImage)
        }
        catch (error) {
          // No row points at the object just uploaded; release it instead of leaving an orphan.
          await imagesBucket.delete(savedSourceImage.objectKey).catch((cleanupError) => {
            console.warn('Source image metadata was not saved and the uploaded object could not be removed.', cleanupError)
          })
          return failureFrom(error, 'Failed to update source image metadata.')
        }

        if (previousImage && previousImage.objectKey !== savedSourceImage.objectKey) {
          await imagesBucket.delete(previousImage.objectKey).catch((error) => {
            console.warn('已完成图片替换，但旧图片清理失败。', error)
          })
        }
        return success(`Source image for commission ${input.id} replaced.`)
      }
      catch (error) {
        return failureFrom(error, 'Failed to replace source image.')
      }
    },
  }
}

function createDefaultCrudBackend(env: Env): AdminCrudBackend {
  const db = resolveD1Database(env.DB)
  const imagesBucket = resolveImageWriteBucket(env.IMAGES)
  const unavailableBackend = createUnavailableCrudBackend(Boolean(db), Boolean(imagesBucket))

  if (!db) {
    return unavailableBackend
  }

  return createNativeCrudBackend(db, imagesBucket, unavailableBackend)
}

async function handleCrudRequest(request: Request, backend: AdminCrudBackend) {
  const { pathname } = new URL(request.url)

  if (request.method === 'POST' && pathname === '/api/admin/characters') {
    const body = await parseJsonBody(request)
    const name = String(body.name ?? '').trim()
    if (!name) {
      return failure('Character name is required.')
    }

    return handleCrudBackendRequest(() => backend.createCharacter({
      name,
      status: parseCharacterStatus(body.status),
    }))
  }

  if (request.method === 'PATCH' && CHARACTER_ITEM_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, CHARACTER_ITEM_ID_PATTERN)
    if (!id) {
      return failure('Invalid character identifier.')
    }

    const body = await parseJsonBody(request)
    const name = String(body.name ?? '').trim()
    if (!name) {
      return failure('Character name is required.')
    }

    return handleCrudBackendRequest(() => backend.updateCharacter({
      id,
      name,
      status: parseCharacterStatus(body.status),
    }))
  }

  if (request.method === 'PUT' && pathname === '/api/admin/characters/order') {
    const body = await parseJsonBody(request)
    return handleCrudBackendRequest(() => backend.updateCharacterOrder({
      active: Array.isArray(body.active)
        ? body.active.map(Number)
        : [],
      archived: Array.isArray(body.archived)
        ? body.archived.map(Number)
        : [],
    }))
  }

  if (request.method === 'DELETE' && CHARACTER_ITEM_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, CHARACTER_ITEM_ID_PATTERN)
    if (!id) {
      return failure('Invalid character identifier.')
    }

    return handleCrudBackendRequest(() => backend.deleteCharacter(id))
  }

  if (request.method === 'POST' && pathname === '/api/admin/commissions') {
    if (exceedsUploadBodyLimit(request)) {
      return failure(UPLOAD_TOO_LARGE_MESSAGE)
    }
    const formData = await request.formData()
    const fields = parseCommissionFieldsFromForm(formData)
    const validation = validateCommissionFields(fields)
    if (validation) {
      return failure(validation)
    }

    const sourceImage = getUploadedSourceImage(formData)
    if (!sourceImage) {
      return failure('Source image is required for new commission entries.')
    }

    return handleCrudBackendRequest(() => backend.createCommission({
      ...fields,
      sourceImage,
    }))
  }

  if (request.method === 'PATCH' && COMMISSION_ITEM_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, COMMISSION_ITEM_ID_PATTERN)
    if (!id) {
      return failure('Invalid commission identifier.')
    }

    const body = await parseJsonBody(request)
    if (!Object.hasOwn(body, 'workGroupId') || !Object.hasOwn(body, 'partNumber')) {
      return failure('workGroupId and partNumber must be present; use null for standalone commissions.')
    }
    const fields = parseCommissionFieldsFromJson(body)
    const validation = validateCommissionFields(fields)
    if (validation) {
      return failure(validation)
    }

    return handleCrudBackendRequest(() => backend.updateCommission({
      id,
      ...fields,
    }))
  }

  if (request.method === 'DELETE' && COMMISSION_ITEM_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, COMMISSION_ITEM_ID_PATTERN)
    if (!id) {
      return failure('Invalid commission identifier.')
    }

    return handleCrudBackendRequest(() => backend.deleteCommission(id))
  }

  if (request.method === 'POST' && COMMISSION_SOURCE_IMAGE_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, COMMISSION_SOURCE_IMAGE_ID_PATTERN)
    if (!id) {
      return failure('Invalid commission identifier.')
    }

    if (exceedsUploadBodyLimit(request)) {
      return failure(UPLOAD_TOO_LARGE_MESSAGE)
    }
    const formData = await request.formData()
    const sourceImage = getUploadedSourceImage(formData)
    if (!sourceImage) {
      return failure('Source image is required.')
    }

    return handleCrudBackendRequest(() => backend.replaceCommissionSourceImage({
      id,
      sourceImage,
    }))
  }

  return null
}

const BATCH_WRITE_ROUTES: Record<string, {
  save: (db: D1DatabaseLike, body: Record<string, unknown>) => Promise<void>
  ok: string
  fail: string
}> = {
  '/api/admin/aliases/batch': {
    save: async (db, body) => {
      const rows = parseStructuredArray<{
        creatorName?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        creatorName: row.creatorName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveCreatorAliasesBatch(db, rows)
    },
    ok: 'Creator aliases saved.',
    fail: 'Failed to save creator aliases.',
  },
  '/api/admin/character-aliases/batch': {
    save: async (db, body) => {
      const rows = parseStructuredArray<{
        characterName?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        characterName: row.characterName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveCharacterAliasesBatch(db, rows)
    },
    ok: 'Character aliases saved.',
    fail: 'Failed to save character aliases.',
  },
  '/api/admin/keyword-aliases/batch': {
    save: async (db, body) => {
      const rows = parseStructuredArray<{
        baseKeyword?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        baseKeyword: row.baseKeyword ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveKeywordAliasesBatch(db, rows)
    },
    ok: 'Keyword aliases saved.',
    fail: 'Failed to save keyword aliases.',
  },
  '/api/admin/suggestion': {
    save: async (db, body) => {
      const keywords = parseFeaturedKeywords(body)
      if (!keywords) {
        throw new Error('Featured keywords must be sent as a `keywords` array (or a `keywordsJson` JSON array string).')
      }

      await saveHomeFeaturedSearchKeywords(db, keywords)
    },
    ok: 'Home featured keywords saved.',
    fail: 'Failed to save home featured keywords.',
  },
}

async function handleBatchWriteRequest(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return null
  }

  const { pathname } = new URL(request.url)
  const route = Object.hasOwn(BATCH_WRITE_ROUTES, pathname)
    ? BATCH_WRITE_ROUTES[pathname]
    : undefined
  if (!route) {
    return null
  }

  const db = resolveD1Database(env.DB)
  if (!db) {
    return bindingFailure('Admin worker DB binding is required for this route.')
  }

  try {
    await route.save(db, await parseJsonBody(request))
    return success(route.ok)
  }
  catch (error) {
    return failureFrom(error, route.fail)
  }
}

export async function handleAdminApiRequest(
  request: Request,
  env: Env,
  backend: AdminCrudBackend | undefined = undefined,
) {
  const { pathname } = new URL(request.url)
  const resolvedBackend = backend ?? createDefaultCrudBackend(env)

  if (request.method === 'GET' && pathname === '/api/admin/health') {
    return json({
      status: 'ok',
      message: 'Admin worker D1/R2 runtime is responding.',
    })
  }

  if (request.method === 'GET' && pathname === '/api/admin/interest') {
    if (!env.RYBBIT_API_KEY) {
      return failure('RYBBIT_API_KEY is not configured on the worker.', 503)
    }
    const result = await loadInterestCounts(env.RYBBIT_API_KEY)
    return result.ok
      ? json({ since: INTEREST_SINCE, counts: result.counts })
      : failure(result.message, 502)
  }

  if (request.method === 'GET' && pathname === '/api/admin/link-clicks') {
    if (!env.RYBBIT_API_KEY) {
      return failure('RYBBIT_API_KEY is not configured on the worker.', 503)
    }
    const result = await loadLinkClicks(env.RYBBIT_API_KEY)
    return result.ok
      ? json({ since: result.since, until: result.until, clicks: result.clicks })
      : failure(result.message, 502)
  }

  if (request.method === 'POST' && pathname === '/api/admin/rebuild') {
    if (!env.GITHUB_DISPATCH_TOKEN) {
      return failure('GITHUB_DISPATCH_TOKEN is not configured on the worker.', 503)
    }

    const dispatchedAt = new Date().toISOString()
    try {
      const response = await fetch(
        'https://api.github.com/repos/aozaki-kuro/commission-index/dispatches',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'commission-index-admin-worker',
          },
          body: JSON.stringify(buildRebuildDispatchBody(dispatchedAt)),
        },
      )

      if (response.status === 204) {
        return json({ status: 'success', message: 'Web rebuild dispatched to GitHub Actions.', dispatchedAt })
      }

      const text = await response.text().catch(() => '')
      return failure(`GitHub API returned ${response.status}${text
        ? `: ${text}`
        : ''}`, 502)
    }
    catch (error) {
      return failureFrom(error, 'Failed to dispatch rebuild.', 502)
    }
  }

  const nativeReadResponse = await handleAdminReadRequest(request, env)
  if (nativeReadResponse) {
    return nativeReadResponse
  }

  const nativeCrudResponse = await handleCrudRequest(request, resolvedBackend)
  if (nativeCrudResponse) {
    return nativeCrudResponse
  }

  const batchWriteResponse = await handleBatchWriteRequest(request, env)
  if (batchWriteResponse) {
    return batchWriteResponse
  }

  return notFound()
}
