import { readFile } from 'node:fs/promises'
import {
  createCharacter,
  createCommission,
  deleteCharacter,
  deleteCommission,
  getAdminAliasesData,
  getAdminBootstrapData,
  getAdminCommissionsByCharacterId,
  getHomeSuggestionAdminData,
  saveCharacterAliasesBatch,
  saveCreatorAliasesBatch,
  saveHomeFeaturedSearchKeywords,
  saveKeywordAliasesBatch,
  updateCharacter,
  updateCharactersOrder,
  updateCommission,
  type CharacterStatus,
} from '../src/lib/admin/db'
import {
  removeSourceImageFile,
  resolveSourceImagePathByStem,
  replaceUploadedSourceImage,
  saveUploadedSourceImage,
} from '../src/features/admin/imageUpload'
import { createAstroStyleLogger } from '../src/lib/pipeline/astroLogger'
import { runFullAssetPipeline } from '../src/lib/pipeline/assets'

type ApiState = {
  status: 'success' | 'error'
  message: string
}

const isDevelopment = process.env.NODE_ENV === 'development'
const logger = createAstroStyleLogger('assets-sync')

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

const notFound = () => new Response('Not Found', { status: 404 })

const success = (message: string) => json({ status: 'success', message } satisfies ApiState)
const failure = (message: string, status = 400) =>
  json({ status: 'error', message } satisfies ApiState, status)

type CommissionFields = {
  characterId: number
  fileName: string
  links: string[]
  design?: string
  description?: string
  keyword?: string
  hidden: boolean
}

const parseLinks = (rawValue: string) =>
  rawValue
    .split('\n')
    .map(link => link.trim())
    .filter(Boolean)

const parseOptionalField = (rawValue: string) => rawValue.trim() || undefined

const parseCommissionFields = ({
  characterId,
  fileName,
  links,
  design,
  description,
  keyword,
  hidden,
}: {
  characterId: number
  fileName: string
  links: string
  design: string
  description: string
  keyword: string
  hidden: boolean
}): CommissionFields => ({
  characterId,
  fileName: fileName.trim(),
  links: parseLinks(links),
  design: parseOptionalField(design),
  description: parseOptionalField(description),
  keyword: parseOptionalField(keyword),
  hidden,
})

const parseCommissionFieldsFromForm = (formData: FormData) => {
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

const parseCommissionFieldsFromJson = (payload: Record<string, unknown>) => {
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

const validateCommissionFields = (
  fields: Pick<CommissionFields, 'characterId' | 'fileName'>,
): string | null => {
  if (!Number.isFinite(fields.characterId) || fields.characterId <= 0) {
    return 'Character selection is required.'
  }

  if (!fields.fileName) {
    return 'File name is required.'
  }

  return null
}

const getUploadedSourceImage = (formData: FormData): File | null => {
  const entry = formData.get('sourceImage')
  if (!(entry instanceof File)) return null
  if (!entry.name.trim() || entry.size <= 0) return null
  return entry
}

const createAssetsSyncQueue = () => {
  let requestedVersion = 0
  let completedVersion = 0
  let latestReason = 'unknown'
  let runningPromise: Promise<void> | null = null

  const runLoop = async () => {
    while (completedVersion < requestedVersion) {
      const targetVersion = requestedVersion
      const reason = latestReason
      const startedAt = Date.now()
      logger.info(`start version=${targetVersion} reason=${reason}`)

      try {
        await runFullAssetPipeline(`admin-write:${reason}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`failed version=${targetVersion} reason=${reason}: ${message}`)
        throw error
      }

      completedVersion = targetVersion
      logger.success(
        `done version=${targetVersion} reason=${reason} in ${Date.now() - startedAt}ms`,
      )
    }
  }

  const ensureRunning = () => {
    if (runningPromise) return
    runningPromise = runLoop().finally(() => {
      runningPromise = null
    })
  }

  return async (reason: string) => {
    requestedVersion += 1
    latestReason = reason
    const waitForVersion = requestedVersion
    ensureRunning()

    while (completedVersion < waitForVersion) {
      if (!runningPromise) ensureRunning()
      await runningPromise
    }
  }
}

const syncPublicAssetsAfterWrite = createAssetsSyncQueue()

const regeneratePublicAssets = async (reason: string) => {
  await syncPublicAssetsAfterWrite(reason)
}

const parseJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  const payload = (await request.json()) as unknown
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

const parseCharacterStatus = (value: unknown): CharacterStatus =>
  String(value) === 'stale' ? 'stale' : 'active'

const handleWriteError = (error: unknown, fallback: string) =>
  failure(error instanceof Error ? error.message : fallback)

const parseIdFromPath = (pathname: string, pattern: RegExp): number | null => {
  const match = pathname.match(pattern)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

export const handleAdminApiRequest = async (request: Request) => {
  const url = new URL(request.url)
  const { pathname } = url

  if (!pathname.startsWith('/api/admin/')) {
    return notFound()
  }

  if (!isDevelopment) {
    return notFound()
  }

  if (request.method === 'GET' && pathname.startsWith('/api/admin/source-image/')) {
    const encodedFileName = pathname.slice('/api/admin/source-image/'.length)
    if (!encodedFileName) return failure('File name is required.')

    let fileName: string
    try {
      fileName = decodeURIComponent(encodedFileName)
    } catch {
      return failure('Invalid file name.')
    }

    try {
      const resolvedSourceImage = await resolveSourceImagePathByStem(fileName)
      if (!resolvedSourceImage) return notFound()

      const imageBuffer = await readFile(resolvedSourceImage.filePath)
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          'Content-Type': resolvedSourceImage.mimeType,
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      return handleWriteError(error, 'Failed to load source image.')
    }
  }

  if (request.method === 'GET' && pathname === '/api/admin/bootstrap') {
    return json(getAdminBootstrapData())
  }

  if (request.method === 'GET' && pathname === '/api/admin/aliases/bootstrap') {
    return json(getAdminAliasesData())
  }

  if (request.method === 'GET' && pathname === '/api/admin/suggestion') {
    return json(getHomeSuggestionAdminData())
  }

  if (request.method === 'GET' && /^\/api\/admin\/characters\/\d+\/commissions$/.test(pathname)) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/characters\/(\d+)\/commissions$/)
    if (!id) return failure('Invalid character identifier.')

    return json({
      commissions: getAdminCommissionsByCharacterId(id),
    })
  }

  if (request.method === 'POST' && pathname === '/api/admin/characters') {
    try {
      const body = await parseJsonBody(request)
      const name = String(body.name ?? '').trim()
      if (!name) return failure('Character name is required.')

      createCharacter({
        name,
        status: parseCharacterStatus(body.status),
      })
      await regeneratePublicAssets('create-character')
      return success(`Character "${name}" created.`)
    } catch (error) {
      return handleWriteError(error, 'Failed to create character.')
    }
  }

  if (request.method === 'PATCH' && /^\/api\/admin\/characters\/\d+$/.test(pathname)) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/characters\/(\d+)$/)
    if (!id) return failure('Invalid character identifier.')

    try {
      const body = await parseJsonBody(request)
      const name = String(body.name ?? '').trim()
      if (!name) return failure('Character name is required.')

      updateCharacter({
        id,
        name,
        status: parseCharacterStatus(body.status),
      })
      await regeneratePublicAssets('update-character')
      return success(`Character "${name}" updated.`)
    } catch (error) {
      return handleWriteError(error, 'Failed to update character.')
    }
  }

  if (request.method === 'PUT' && pathname === '/api/admin/characters/order') {
    try {
      const body = await parseJsonBody(request)
      updateCharactersOrder({
        active: Array.isArray(body.active) ? body.active.map(Number) : [],
        stale: Array.isArray(body.stale) ? body.stale.map(Number) : [],
      })
      await regeneratePublicAssets('reorder-characters')
      return success('Character order updated.')
    } catch (error) {
      return handleWriteError(error, 'Failed to update character order.')
    }
  }

  if (request.method === 'DELETE' && /^\/api\/admin\/characters\/\d+$/.test(pathname)) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/characters\/(\d+)$/)
    if (!id) return failure('Invalid character identifier.')

    try {
      deleteCharacter(id)
      await regeneratePublicAssets('delete-character')
      return success('Character deleted.')
    } catch (error) {
      return handleWriteError(error, 'Failed to delete character.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/commissions') {
    const formData = await request.formData()
    const fields = parseCommissionFieldsFromForm(formData)
    const validation = validateCommissionFields(fields)
    if (validation) return failure(validation)

    const sourceImage = getUploadedSourceImage(formData)
    if (!sourceImage) {
      return failure('Source image is required for new commission entries.')
    }

    let uploadedSourceImagePath: string | undefined

    try {
      const uploaded = await saveUploadedSourceImage({
        commissionFileName: fields.fileName,
        file: sourceImage,
      })
      uploadedSourceImagePath = uploaded.targetPath
    } catch (error) {
      return handleWriteError(error, 'Failed to save source image.')
    }

    try {
      const { characterName } = createCommission(fields)
      await regeneratePublicAssets('create-commission')
      return success(`Commission "${fields.fileName}" added to ${characterName}.`)
    } catch (error) {
      if (uploadedSourceImagePath) {
        await removeSourceImageFile(uploadedSourceImagePath)
      }
      return handleWriteError(error, 'Failed to add commission.')
    }
  }

  if (request.method === 'PATCH' && /^\/api\/admin\/commissions\/\d+$/.test(pathname)) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/commissions\/(\d+)$/)
    if (!id) return failure('Invalid commission identifier.')

    try {
      const body = await parseJsonBody(request)
      const fields = parseCommissionFieldsFromJson(body)
      const validation = validateCommissionFields(fields)
      if (validation) return failure(validation)

      updateCommission({
        id,
        ...fields,
      })
      await regeneratePublicAssets('update-commission')
      return success(`Commission "${fields.fileName}" updated.`)
    } catch (error) {
      return handleWriteError(error, 'Failed to update commission.')
    }
  }

  if (request.method === 'DELETE' && /^\/api\/admin\/commissions\/\d+$/.test(pathname)) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/commissions\/(\d+)$/)
    if (!id) return failure('Invalid commission identifier.')

    try {
      deleteCommission(id)
      await regeneratePublicAssets('delete-commission')
      return success('Commission deleted.')
    } catch (error) {
      return handleWriteError(error, 'Failed to delete commission.')
    }
  }

  if (
    request.method === 'POST' &&
    /^\/api\/admin\/commissions\/\d+\/source-image$/.test(pathname)
  ) {
    const id = parseIdFromPath(pathname, /^\/api\/admin\/commissions\/(\d+)\/source-image$/)
    if (!id) return failure('Invalid commission identifier.')

    const formData = await request.formData()
    const commissionFileName = formData.get('commissionFileName')?.toString().trim() ?? ''
    if (!commissionFileName) return failure('File name is required.')

    const sourceImage = getUploadedSourceImage(formData)
    if (!sourceImage) return failure('Source image is required.')

    try {
      await replaceUploadedSourceImage({
        commissionFileName,
        file: sourceImage,
      })
      await regeneratePublicAssets('replace-source-image')
      return success(`Source image for "${commissionFileName}" replaced.`)
    } catch (error) {
      return handleWriteError(error, 'Failed to replace source image.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/aliases/batch') {
    try {
      const body = await parseJsonBody(request)
      const rowsJson = String(body.rowsJson ?? '[]')
      const parsedRows = JSON.parse(rowsJson) as Array<{
        creatorName?: string
        alias?: string
        aliases?: string[] | string
      }>
      const rows = parsedRows.map(row => ({
        creatorName: row.creatorName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))
      saveCreatorAliasesBatch(rows)
      await regeneratePublicAssets('save-creator-aliases')
      return success('Creator aliases saved.')
    } catch (error) {
      return handleWriteError(error, 'Failed to save creator aliases.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/character-aliases/batch') {
    try {
      const body = await parseJsonBody(request)
      const rowsJson = String(body.rowsJson ?? '[]')
      const parsedRows = JSON.parse(rowsJson) as Array<{
        characterName?: string
        alias?: string
        aliases?: string[] | string
      }>
      const rows = parsedRows.map(row => ({
        characterName: row.characterName ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))
      saveCharacterAliasesBatch(rows)
      await regeneratePublicAssets('save-character-aliases')
      return success('Character aliases saved.')
    } catch (error) {
      return handleWriteError(error, 'Failed to save character aliases.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/keyword-aliases/batch') {
    try {
      const body = await parseJsonBody(request)
      const rowsJson = String(body.rowsJson ?? '[]')
      const parsedRows = JSON.parse(rowsJson) as Array<{
        baseKeyword?: string
        alias?: string
        aliases?: string[] | string
      }>
      const rows = parsedRows.map(row => ({
        baseKeyword: row.baseKeyword ?? '',
        aliases: row.aliases ?? row.alias ?? '',
      }))
      saveKeywordAliasesBatch(rows)
      await regeneratePublicAssets('save-keyword-aliases')
      return success('Keyword aliases saved.')
    } catch (error) {
      return handleWriteError(error, 'Failed to save keyword aliases.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/suggestion') {
    try {
      const body = await parseJsonBody(request)
      const keywordsJson = String(body.keywordsJson ?? '[]')
      const parsedKeywords = JSON.parse(keywordsJson) as unknown
      const keywords = Array.isArray(parsedKeywords) ? parsedKeywords.map(String) : []

      saveHomeFeaturedSearchKeywords(keywords)
      return success('Home featured keywords saved.')
    } catch (error) {
      return handleWriteError(error, 'Failed to save home featured keywords.')
    }
  }

  if (request.method === 'POST' && pathname === '/api/admin/assets/refresh') {
    try {
      await regeneratePublicAssets('manual-refresh')
      return success('Assets refreshed.')
    } catch (error) {
      return handleWriteError(error, 'Failed to refresh assets.')
    }
  }

  return notFound()
}
