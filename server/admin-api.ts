import {
  createCharacter,
  createCommission,
  deleteCharacter,
  deleteCommission,
  getAdminData,
  getCreatorAliasesAdminData,
  saveCreatorAliasesBatch,
  updateCharacter,
  updateCharactersOrder,
  updateCommission,
  type CharacterStatus,
} from '#lib/admin/db'
import { runImagePipeline } from '#admin/imagePipeline'
import {
  removeSourceImageFile,
  replaceUploadedSourceImage,
  saveUploadedSourceImage,
} from '#admin/imageUpload'
import { generateHomeSearchEntriesFile } from '#scripts/homeSearchEntries'
import { generateHomeUpdateSummaryModule } from '#scripts/homeUpdateSummary'
import { generateRssFile } from '#scripts/rss'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

type ApiState = {
  status: 'success' | 'error'
  message: string
}

const isDevelopment = process.env.NODE_ENV === 'development'
const START_PORT = Number(process.env.ADMIN_API_PORT ?? 8788)
const PORT_FILE_PATH = process.env.ADMIN_API_PORT_FILE
const MAX_PORT_ATTEMPTS = 200

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

const notFound = () => new Response('Not Found', { status: 404 })

const success = (message: string) => json({ status: 'success', message } satisfies ApiState)
const failure = (message: string, status = 400) =>
  json({ status: 'error', message } satisfies ApiState, status)

const parseCommissionFieldsFromForm = (formData: FormData) => {
  const characterId = Number(formData.get('characterId'))
  const fileName = formData.get('fileName')?.toString().trim() ?? ''
  const linksRaw = formData.get('links')?.toString() ?? ''
  const design = formData.get('design')?.toString().trim() || undefined
  const description = formData.get('description')?.toString().trim() || undefined
  const keyword = formData.get('keyword')?.toString().trim() || undefined
  const hidden = formData.get('hidden') === 'on'

  return {
    characterId,
    fileName,
    links: linksRaw
      .split('\n')
      .map(link => link.trim())
      .filter(Boolean),
    design,
    description,
    keyword,
    hidden,
  }
}

const parseCommissionFieldsFromJson = (payload: Record<string, unknown>) => {
  const linksRaw = String(payload.links ?? '')
  return {
    characterId: Number(payload.characterId),
    fileName: String(payload.fileName ?? '').trim(),
    links: linksRaw
      .split('\n')
      .map(link => link.trim())
      .filter(Boolean),
    design: String(payload.design ?? '').trim() || undefined,
    description: String(payload.description ?? '').trim() || undefined,
    keyword: String(payload.keyword ?? '').trim() || undefined,
    hidden: Boolean(payload.hidden),
  }
}

const validateCommissionFields = (
  fields: Pick<ReturnType<typeof parseCommissionFieldsFromForm>, 'characterId' | 'fileName'>,
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

const regeneratePublicAssets = async () => {
  await runImagePipeline()
  await Promise.all([
    generateHomeUpdateSummaryModule(),
    generateHomeSearchEntriesFile(),
    generateRssFile(),
  ])
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

const handleRequest = async (request: Request) => {
  const url = new URL(request.url)
  const { pathname } = url

  if (!pathname.startsWith('/api/admin/')) {
    return notFound()
  }

  if (!isDevelopment) {
    return notFound()
  }

  if (request.method === 'GET' && pathname === '/api/admin/bootstrap') {
    const { characters, commissions } = getAdminData()
    const creatorAliases = getCreatorAliasesAdminData()
    return json({ characters, commissions, creatorAliases })
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
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
      await regeneratePublicAssets()
      return success('Creator aliases saved.')
    } catch (error) {
      return handleWriteError(error, 'Failed to save creator aliases.')
    }
  }

  return notFound()
}

const isAddressInUseError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? String((error as { code?: string }).code) : ''
  return code === 'EADDRINUSE' || error.message.includes('EADDRINUSE')
}

const announceListeningPort = async (port: number) => {
  if (PORT_FILE_PATH) {
    await writeFile(PORT_FILE_PATH, String(port), 'utf8')
  }
  console.log(`[admin-api] listening on http://localhost:${port}`)
}

const createNodeRequestServer = (port: number) =>
  createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `localhost:${port}`
      const url = `http://${host}${req.url ?? '/'}`
      const method = req.method ?? 'GET'
      const body =
        method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream)
      const requestInit: RequestInit = {
        method,
        headers: req.headers as HeadersInit,
        body,
      }
      if (body) {
        ;(requestInit as RequestInit & { duplex: 'half' }).duplex = 'half'
      }
      const request = new Request(url, requestInit)

      const response = await handleRequest(request)
      res.statusCode = response.status

      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      if (!response.body) {
        res.end()
        return
      }

      Readable.fromWeb(response.body as never).pipe(res)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.'
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ status: 'error', message }))
    }
  })

const startServer = async () => {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    const port = START_PORT + attempt

    if (typeof Bun !== 'undefined') {
      try {
        const server = Bun.serve({
          port,
          fetch: handleRequest,
        })
        await announceListeningPort(server.port)
        return
      } catch (error) {
        if (isAddressInUseError(error)) continue
        throw error
      }
    }

    const server = createNodeRequestServer(port)
    const listenResult = await new Promise<{ ok: true } | { ok: false; error: unknown }>(
      resolve => {
        server.once('error', error => resolve({ ok: false, error }))
        server.listen(port, () => resolve({ ok: true }))
      },
    )

    if (!listenResult.ok) {
      server.close()
      if (isAddressInUseError(listenResult.error)) continue
      throw listenResult.error
    }

    await announceListeningPort(port)
    return
  }

  throw new Error(
    `No available admin API port found in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS - 1}.`,
  )
}

await startServer()
