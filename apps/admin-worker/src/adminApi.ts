import type { D1DatabaseLike } from './adminPersistence'
import { getCommissionFileNameValidationError } from '../../../packages/domain/src/index'
import { handleAdminReadRequest } from './adminData'
import {
  deleteSourceImageMetadataIfMatches,
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
  saveCharacterAliasesBatch,
  saveCreatorAliasesBatch,
  saveHomeFeaturedSearchKeywords,
  saveKeywordAliasesBatch,
} from './adminPersistence'
import {
  buildSourceImageCandidateKeys,
  buildVersionedSourceImageKey,
  resolveImageWriteBucket,
  saveSourceImageToBucket,
} from './adminSourceImages'

const CHARACTER_ITEM_PATH_PATTERN = /^\/api\/admin\/characters\/\d+$/
const CHARACTER_ITEM_ID_PATTERN = /^\/api\/admin\/characters\/(\d+)$/
const CHARACTER_COMMISSIONS_PATH_PATTERN = /^\/api\/admin\/characters\/\d+\/commissions$/
const CHARACTER_COMMISSIONS_ID_PATTERN = /^\/api\/admin\/characters\/(\d+)\/commissions$/
const COMMISSION_ITEM_PATH_PATTERN = /^\/api\/admin\/commissions\/\d+$/
const COMMISSION_ITEM_ID_PATTERN = /^\/api\/admin\/commissions\/(\d+)$/
const COMMISSION_SOURCE_IMAGE_PATH_PATTERN = /^\/api\/admin\/commissions\/\d+\/source-image$/
const COMMISSION_SOURCE_IMAGE_ID_PATTERN = /^\/api\/admin\/commissions\/(\d+)\/source-image$/

export type CharacterStatus = 'active' | 'archived'

export interface Env {
  DB?: unknown
  IMAGES?: unknown
  GITHUB_DISPATCH_TOKEN?: string
}

function buildRebuildDispatchBody() {
  return {
    event_type: 'admin-data-changed',
    client_payload: {
      fact_source_version: new Date().toISOString(),
    },
  }
}

export interface ApiState {
  status: 'success' | 'error'
  message: string
}

interface CommissionFields {
  characterId: number
  fileName: string
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
  commissionFileName: string
  sourceImage: File
}

export interface AdminCrudBackend {
  getCharacterCommissions: (characterId: number) => Promise<Response>
  createCharacter: (input: CreateCharacterInput) => Promise<Response>
  updateCharacter: (input: UpdateCharacterInput) => Promise<Response>
  updateCharacterOrder: (payload: CharacterOrderPayload) => Promise<Response>
  deleteCharacter: (id: number) => Promise<Response>
  createCommission: (input: CreateCommissionInput) => Promise<Response>
  updateCommission: (input: UpdateCommissionInput) => Promise<Response>
  deleteCommission: (id: number) => Promise<Response>
  replaceCommissionSourceImage: (input: ReplaceCommissionSourceImageInput) => Promise<Response>
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function notFound() {
  return json({
    status: 'error',
    message: 'Not Found',
  }, 404)
}

function failure(message: string, status = 400) {
  return json({
    status: 'error',
    message,
  } satisfies ApiState, status)
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

function resolveD1Database(value: unknown): D1DatabaseLike | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { prepare?: unknown }
  if (typeof candidate.prepare !== 'function') {
    return null
  }

  return value as D1DatabaseLike
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

function parseCharacterStatus(value: unknown): CharacterStatus {
  return String(value) === 'archived' ? 'archived' : 'active'
}

function parseCommissionFields(input: {
  characterId: number
  fileName: string
  links: string
  design: string
  description: string
  keyword: string
  hidden: boolean
}): CommissionFields {
  return {
    characterId: input.characterId,
    fileName: input.fileName.trim(),
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
    fileName: formData.get('fileName')?.toString() ?? '',
    links: formData.get('links')?.toString() ?? '',
    design: formData.get('design')?.toString() ?? '',
    description: formData.get('description')?.toString() ?? '',
    keyword: formData.get('keyword')?.toString() ?? '',
    hidden: formData.get('hidden') === 'on',
  })
}

function parseCommissionFieldsFromJson(payload: Record<string, unknown>) {
  return parseCommissionFields({
    characterId: Number(payload.characterId),
    fileName: String(payload.fileName ?? ''),
    links: String(payload.links ?? ''),
    design: String(payload.design ?? ''),
    description: String(payload.description ?? ''),
    keyword: String(payload.keyword ?? ''),
    hidden: Boolean(payload.hidden),
  })
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashImage(buffer: ArrayBuffer) {
  return toHex(await crypto.subtle.digest('SHA-256', buffer))
}

async function findSourceImage(
  bucket: NonNullable<ReturnType<typeof resolveImageWriteBucket>>,
  fileName: string,
  preferredKey?: string,
) {
  const candidateKeys = preferredKey
    ? [preferredKey]
    : buildSourceImageCandidateKeys(fileName)

  for (const objectKey of candidateKeys) {
    const object = await bucket.get(objectKey)
    if (!object) {
      continue
    }
    const buffer = await object.arrayBuffer()
    const mimeType = object.httpMetadata?.contentType
      ?? (objectKey.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
    const extension: '.png' | '.jpg' = mimeType.toLowerCase() === 'image/png' ? '.png' : '.jpg'
    const sha256 = await hashImage(buffer)

    return {
      byteSize: buffer.byteLength,
      buffer,
      extension,
      mimeType,
      objectKey,
      sha256,
    }
  }

  if (preferredKey) {
    throw new Error('The source image referenced by the commission is missing from storage.')
  }
  return null
}

function validateCommissionFields(fields: Pick<CommissionFields, 'characterId' | 'fileName'>) {
  if (!Number.isFinite(fields.characterId) || fields.characterId <= 0) {
    return 'Character selection is required.'
  }

  return getCommissionFileNameValidationError(fields.fileName)
}

function parseIdFromPath(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern)
  if (!match) {
    return null
  }

  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
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
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
}

function parseStructuredArray<T>(value: unknown, fallbackFieldValue?: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  const rawValue = fallbackFieldValue ?? value ?? '[]'
  const parsed = JSON.parse(String(rawValue)) as unknown
  return Array.isArray(parsed) ? parsed as T[] : []
}

async function handleCrudBackendRequest(operation: () => Promise<Response>) {
  try {
    return await operation()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Admin worker request failed.'
    return json({
      status: 'error',
      message,
    }, 500)
  }
}

function createUnavailableCrudBackend(hasDb: boolean, hasImages: boolean): AdminCrudBackend {
  const missing = createMissingBindingResponses(hasDb, hasImages)

  return {
    getCharacterCommissions: async () => missing.dbOnly(),
    createCharacter: async () => missing.dbOnly(),
    updateCharacter: async () => missing.dbOnly(),
    updateCharacterOrder: async () => missing.dbOnly(),
    deleteCharacter: async () => missing.dbOnly(),
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
        return json({
          status: 'success',
          message: `Character "${name}" created.`,
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to create character.')
      }
    },
    async updateCharacter(input) {
      try {
        const name = await persistCharacterUpdate(db, input)
        return json({
          status: 'success',
          message: `Character "${name}" updated.`,
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update character.')
      }
    },
    async updateCharacterOrder(payload) {
      try {
        await persistCharacterOrderUpdate(db, payload)
        return json({
          status: 'success',
          message: 'Character order updated.',
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update character order.')
      }
    },
    async deleteCharacter(id) {
      try {
        await persistCharacterDelete(db, id)
        return json({
          status: 'success',
          message: 'Character deleted.',
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to delete character.')
      }
    },
    async createCommission(input) {
      if (!imagesBucket) {
        return unavailableBackend.createCommission(input)
      }

      let uploadedSourceImage: Awaited<ReturnType<typeof saveSourceImageToBucket>> | null = null

      try {
        uploadedSourceImage = await saveSourceImageToBucket(imagesBucket, {
          commissionFileName: input.fileName,
          file: input.sourceImage,
          overwrite: false,
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to save source image.')
      }

      try {
        const { characterName } = await persistCommissionCreate(db, input, uploadedSourceImage)
        return json({
          status: 'success',
          message: `Commission "${input.fileName}" added to ${characterName}.`,
        })
      }
      catch (error) {
        // 保留新对象以覆盖“D1 已提交但响应丢失”的不确定窗口；孤儿对象可安全清理。
        return failure(error instanceof Error ? error.message : 'Failed to add commission.')
      }
    },
    async updateCommission(input) {
      try {
        const oldFileName = await persistCommissionFileName(db, input.id)
        const newFileName = input.fileName.trim()
        const fileNameChanged = oldFileName !== newFileName

        let oldSourceImageMeta: Awaited<ReturnType<typeof persistSourceImageMetadataGet>> = null
        if (fileNameChanged) {
          oldSourceImageMeta = await persistSourceImageMetadataGet(db, oldFileName)
          if (!imagesBucket) {
            return failure('Admin worker IMAGES binding is required to rename a commission.', 503)
          }
        }

        let movedImage: Awaited<ReturnType<typeof findSourceImage>> = null
        let newObjectKey: string | null = null
        if (fileNameChanged && imagesBucket) {
          movedImage = await findSourceImage(imagesBucket, oldFileName, oldSourceImageMeta?.objectKey)

          if (movedImage) {
            newObjectKey = buildVersionedSourceImageKey(
              newFileName,
              movedImage.sha256,
              movedImage.extension,
            )
            await imagesBucket.put(newObjectKey, movedImage.buffer, {
              httpMetadata: { contentType: movedImage.mimeType },
            })
            try {
              await persistSourceImageMetadata(db, {
                commissionFileName: newFileName,
                objectKey: newObjectKey,
                mimeType: movedImage.mimeType,
                byteSize: movedImage.byteSize,
                sha256: movedImage.sha256,
              })
            }
            catch (error) {
              return failure(error instanceof Error ? error.message : 'Failed to prepare renamed image.')
            }
          }
        }

        try {
          await persistCommissionUpdate(db, input)
        }
        catch (error) {
          const currentFileName = await persistCommissionFileName(db, input.id).catch(() => null)
          if (newObjectKey && currentFileName !== newFileName) {
            await imagesBucket?.delete(newObjectKey).catch(() => undefined)
            await persistSourceImageMetadataGet(db, newFileName).then(async (metadata) => {
              if (metadata?.objectKey === newObjectKey) {
                await deleteSourceImageMetadataIfMatches(db, newFileName, newObjectKey)
              }
            }).catch(() => undefined)
          }
          throw error
        }

        if (fileNameChanged && movedImage && imagesBucket) {
          await imagesBucket.delete(movedImage.objectKey).catch((error) => {
            console.warn('已完成图片改名，但旧图片清理失败。', error)
          })
        }

        return json({
          status: 'success',
          message: `Commission "${input.fileName}" updated.`,
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update commission.')
      }
    },
    async deleteCommission(id) {
      try {
        await persistCommissionDelete(db, id)
        return json({
          status: 'success',
          message: 'Commission deleted.',
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to delete commission.')
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
          overwrite: true,
        })
        try {
          await persistSourceImageMetadata(db, savedSourceImage)
        }
        catch (error) {
          return failure(error instanceof Error ? error.message : 'Failed to update source image metadata.')
        }

        if (previousImage && previousImage.objectKey !== savedSourceImage.objectKey) {
          await imagesBucket.delete(previousImage.objectKey).catch((error) => {
            console.warn('已完成图片替换，但旧图片清理失败。', error)
          })
        }
        return json({
          status: 'success',
          message: `Source image for "${commissionFileName}" replaced.`,
        })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to replace source image.')
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

  if (request.method === 'GET' && CHARACTER_COMMISSIONS_PATH_PATTERN.test(pathname)) {
    const id = parseIdFromPath(pathname, CHARACTER_COMMISSIONS_ID_PATTERN)
    if (!id) {
      return failure('Invalid character identifier.')
    }

    return handleCrudBackendRequest(() => backend.getCharacterCommissions(id))
  }

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
      active: Array.isArray(body.active) ? body.active.map(Number) : [],
      archived: Array.isArray(body.archived) ? body.archived.map(Number) : [],
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

    const formData = await request.formData()
    const commissionFileName = formData.get('commissionFileName')?.toString().trim() ?? ''
    if (!commissionFileName) {
      return failure('File name is required.')
    }

    const sourceImage = getUploadedSourceImage(formData)
    if (!sourceImage) {
      return failure('Source image is required.')
    }

    return handleCrudBackendRequest(() => backend.replaceCommissionSourceImage({
      id,
      commissionFileName,
      sourceImage,
    }))
  }

  return null
}

async function handleBatchWriteRequest(request: Request, env: Env) {
  if (request.method !== 'POST') {
    return null
  }

  const { pathname } = new URL(request.url)
  const db = resolveD1Database(env.DB)

  if (pathname === '/api/admin/aliases/batch') {
    if (!db) {
      return bindingFailure('Admin worker DB binding is required for this route.')
    }

    try {
      const body = await parseJsonBody(request)
      const rows = parseStructuredArray<{
        creatorName?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        creatorName: row.creatorName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveCreatorAliasesBatch(db, rows)
      return json({ status: 'success', message: 'Creator aliases saved.' } satisfies ApiState)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to save creator aliases.')
    }
  }

  if (pathname === '/api/admin/character-aliases/batch') {
    if (!db) {
      return bindingFailure('Admin worker DB binding is required for this route.')
    }

    try {
      const body = await parseJsonBody(request)
      const rows = parseStructuredArray<{
        characterName?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        characterName: row.characterName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveCharacterAliasesBatch(db, rows)
      return json({ status: 'success', message: 'Character aliases saved.' } satisfies ApiState)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to save character aliases.')
    }
  }

  if (pathname === '/api/admin/keyword-aliases/batch') {
    if (!db) {
      return bindingFailure('Admin worker DB binding is required for this route.')
    }

    try {
      const body = await parseJsonBody(request)
      const rows = parseStructuredArray<{
        baseKeyword?: string
        alias?: string
        aliases?: string[] | string
      }>(body.rows, body.rowsJson).map(row => ({
        baseKeyword: row.baseKeyword ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))

      await saveKeywordAliasesBatch(db, rows)
      return json({ status: 'success', message: 'Keyword aliases saved.' } satisfies ApiState)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to save keyword aliases.')
    }
  }

  if (pathname === '/api/admin/suggestion') {
    if (!db) {
      return bindingFailure('Admin worker DB binding is required for this route.')
    }

    try {
      const body = await parseJsonBody(request)
      const keywords = parseStructuredArray<unknown>(body.keywords, body.keywordsJson).map(String)

      await saveHomeFeaturedSearchKeywords(db, keywords)
      return json({ status: 'success', message: 'Home featured keywords saved.' } satisfies ApiState)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to save home featured keywords.')
    }
  }

  return null
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

  if (request.method === 'POST' && pathname === '/api/admin/rebuild') {
    if (!env.GITHUB_DISPATCH_TOKEN) {
      return failure('GITHUB_DISPATCH_TOKEN is not configured on the worker.', 503)
    }

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
          body: JSON.stringify(buildRebuildDispatchBody()),
        },
      )

      if (response.status === 204) {
        return json({ status: 'success', message: 'Web rebuild dispatched to GitHub Actions.' } satisfies ApiState)
      }

      const text = await response.text().catch(() => '')
      return failure(`GitHub API returned ${response.status}${text ? `: ${text}` : ''}`, 502)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to dispatch rebuild.', 502)
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
