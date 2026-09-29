import type {
  CharacterAliasEntry,
  CharacterRecord,
  CreatorAliasEntry,
  GeneratedFactSourceContent,
  GeneratedFactSourceMeta,
  GeneratedSourceImageManifest,
  GeneratedSourceImageManifestFile,
  GeneratedSourceImageManifestMissing,
  KeywordAliasEntry,
} from '@commission-index/domain'
import type { SpawnSyncReturns } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  GENERATED_FACT_SOURCE_SCHEMA_VERSION,
  GENERATED_FACT_SOURCE_SOURCE,
  normalizeAliases,
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCreatorName,
  normalizeKeywordAliases,
  normalizeKeywordAliasKey,
  normalizeKeywordBaseTerm,
  parseAliasesJson,
  parseCharacterAliasesJson,
  parseKeywordAliasesJson,
} from '@commission-index/domain'
import {
  buildSourceImageCandidateKeys,
  getSourceImageMimeType,
} from '../src/adminSourceImages'

interface ParsedArgs {
  outputRoot: string
  usePreview: boolean
}

interface CharacterRow {
  id: number
  name: string
  status: CharacterRecord['status']
  sortOrder: number
}

interface CommissionRow {
  id: number
  publicId: string
  characterId: number
  commissionDate?: string | null
  creatorName?: string | null
  workGroupId?: string | null
  partNumber?: number | null
  fileName: string
  seriesOrder?: string | null
  links?: string | null
  design?: string | null
  description?: string | null
  hidden?: number | null
  keyword?: string | null
}

interface CreatorAliasRow {
  creatorName: string
  aliasesJson?: string | null
  aliases?: string | null
}

interface CharacterAliasRow {
  characterName: string
  aliasesJson?: string | null
  aliases?: string | null
}

interface KeywordAliasRow {
  baseKeyword: string
  aliasesJson?: string | null
  aliases?: string | null
}

interface FeaturedKeywordRow {
  keyword: string
}

interface SourceImageRow {
  byteSize: number
  commissionId: number
  commissionFileName: string
  mimeType: string
  objectKey: string
  sha256: string
}

interface ExportSourceImagesOptions {
  bucketName: string
  outputImagesDir: string
  sourceImageRows: SourceImageRow[]
}

interface ExportSourceImagesResult {
  files: GeneratedSourceImageManifestFile[]
  missing: GeneratedSourceImageManifestMissing[]
  hasHardFailure: boolean
  downloadedCount: number
  reusedCount: number
}

interface ExportSourceImageTaskResult {
  downloadedCount: number
  file: GeneratedSourceImageManifestFile | null
  hardFailure: boolean
  missing: GeneratedSourceImageManifestMissing | null
  reusedCount: number
}

const invocationCwd = process.cwd()
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminWorkerRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(adminWorkerRoot, '../..')
const configuredWranglerConfigPath = process.env.FACT_SOURCE_WRANGLER_CONFIG?.trim()
const wranglerConfigPath = path.resolve(
  adminWorkerRoot,
  configuredWranglerConfigPath && configuredWranglerConfigPath.length > 0
    ? configuredWranglerConfigPath
    : './wrangler.jsonc',
)
const localWranglerBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler')
const localWranglerCmdBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler.cmd')
const defaultOutputRoot = path.resolve(adminWorkerRoot, '../web/generated')
const defaultDatabaseBinding
  = process.env.FACT_SOURCE_DB_BINDING?.trim()
    || process.env.ADMIN_WORKER_DB_BINDING?.trim()
    || 'DB'
const defaultBucketName
  = process.env.FACT_SOURCE_IMAGES_BUCKET?.trim()
    || process.env.ADMIN_WORKER_IMAGES_BUCKET?.trim()
    || 'commission-index-images'
const imageOutputDirectoryName = 'source-images'
const factSourceDirectoryName = 'fact-source'
const normalizeSpacesPattern = /\s+/g
const missingObjectPattern = /NoSuchKey|The specified key does not exist|not found|404/i
const maxDownloadAttempts = 3
const downloadFileWaitAttempts = 5
const downloadFileWaitMilliseconds = 50
const defaultDownloadConcurrency = 8
const maxDownloadConcurrency = 16

function printHelp() {
  console.log(`
Usage: pnpm run ./scripts/exportWebFactSource.ts [options]

Options:
  --output-root <path>  Override generated output root (default: ../web/generated)
  --preview             Read preview D1 instead of production D1
  --help                Show this message
`.trim())
}

function parseArgs(argv: string[]): ParsedArgs {
  let outputRoot = defaultOutputRoot
  let usePreview = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help') {
      printHelp()
      process.exit(0)
    }

    if (arg === '--preview') {
      usePreview = true
      continue
    }

    if (arg === '--output-root') {
      const nextValue = argv[index + 1]
      if (!nextValue) {
        throw new Error('--output-root requires a path value.')
      }

      outputRoot = path.resolve(invocationCwd, nextValue)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { outputRoot, usePreview }
}

function getWranglerCommand() {
  return existsSync(localWranglerBinPath)
    ? localWranglerBinPath
    : (existsSync(localWranglerCmdBinPath) ? localWranglerCmdBinPath : 'wrangler')
}

function runWrangler(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(getWranglerCommand(), args, {
    cwd: adminWorkerRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  })
}

function runWranglerAsync(args: string[]) {
  return new Promise<{ status: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn(getWranglerCommand(), args, {
      cwd: adminWorkerRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (status) => {
      resolve({ status, stdout, stderr })
    })
  })
}

function runWranglerOrThrow(args: string[], label: string): string {
  const result = runWrangler(args)
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to ${label}.`)
  }

  return result.stdout
}

function executeRemoteStatements(statements: string[], {
  databaseBinding,
  usePreview,
}: {
  databaseBinding: string
  usePreview: boolean
}): unknown[][] {
  const args = [
    'd1',
    'execute',
    databaseBinding,
    '--config',
    wranglerConfigPath,
    '--json',
    '--remote',
    '--command',
    statements.join('; '),
  ]

  if (usePreview) {
    args.splice(6, 0, '--preview')
  }

  const stdout = runWranglerOrThrow(args, `query remote D1 (${databaseBinding})`)
  const payload = JSON.parse(stdout) as Array<{ results?: unknown[] }>

  if (!Array.isArray(payload) || payload.length < statements.length) {
    throw new Error('Unexpected D1 JSON payload shape.')
  }

  return payload.map(entry => entry?.results ?? [])
}

function parseLinks(rawValue: unknown): string[] {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(String(rawValue)) as unknown
    return Array.isArray(parsed) ? parsed.map(link => String(link)) : []
  }
  catch {
    return []
  }
}

function getLegacySeriesKey(fileName: string) {
  if (!/^\d{8}(?:_|$)/.test(fileName)) {
    return undefined
  }

  return fileName.replace(/\s*\(preview.*?\)$/i, '')
}

function getLegacySeriesOrder(fileName: string) {
  return getLegacySeriesKey(fileName) ? fileName : undefined
}

function getLegacySeriesKind(fileName: string) {
  return /\s*\(preview\)$/i.test(fileName) ? 'preview' as const : null
}

function buildCharacterRecords(
  characterRows: CharacterRow[],
  commissionRows: CommissionRow[],
): CharacterRecord[] {
  const characters = new Map<number, CharacterRecord>(
    characterRows.map(row => [
      row.id,
      {
        id: Number(row.id),
        name: String(row.name),
        status: row.status,
        sortOrder: Number(row.sortOrder),
        commissions: [],
      },
    ]),
  )

  for (const row of commissionRows) {
    const character = characters.get(Number(row.characterId))
    if (!character) {
      continue
    }

    character.commissions.push({
      id: Number(row.id),
      publicId: String(row.publicId),
      commissionDate: row.commissionDate ? String(row.commissionDate) : null,
      creatorName: row.creatorName ? String(row.creatorName) : null,
      legacySeriesKind: getLegacySeriesKind(String(row.fileName)),
      workGroupId: row.workGroupId ? String(row.workGroupId) : null,
      partNumber: row.partNumber == null ? null : Number(row.partNumber),
      fileName: String(row.fileName),
      seriesKey: getLegacySeriesKey(String(row.fileName)),
      seriesOrder: getLegacySeriesOrder(String(row.fileName)),
      Links: parseLinks(row.links),
      Design: row.design ? String(row.design) : undefined,
      Description: row.description ? String(row.description) : undefined,
      Keyword: row.keyword ? String(row.keyword) : undefined,
      Hidden: Boolean(row.hidden ?? 0),
    })
  }

  return [...characters.values()].toSorted((left, right) => left.sortOrder - right.sortOrder)
}

function buildCreatorAliases(rows: CreatorAliasRow[]): CreatorAliasEntry[] {
  const aliasMap = new Map<string, string[]>()

  for (const row of rows) {
    const creatorName = normalizeCreatorName(String(row.creatorName))
    if (!creatorName) {
      continue
    }

    const aliases = parseAliasesJson(String(row.aliasesJson ?? row.aliases ?? '[]'))
    aliasMap.set(
      creatorName,
      normalizeAliases([...(aliasMap.get(creatorName) ?? []), ...aliases]),
    )
  }

  return Array.from(aliasMap.entries(), ([creatorName, aliases]) => ({
    creatorName,
    aliases,
  })).toSorted((left, right) => left.creatorName.localeCompare(right.creatorName, 'ja'))
}

function buildCharacterAliases(rows: CharacterAliasRow[]): CharacterAliasEntry[] {
  const aliasMap = new Map<string, CharacterAliasEntry>()

  for (const row of rows) {
    const normalizedCharacterName = normalizeCharacterAliasName(String(row.characterName))
    if (!normalizedCharacterName) {
      continue
    }

    const key = normalizeCharacterAliasKey(normalizedCharacterName)
    if (!key) {
      continue
    }

    const aliases = parseCharacterAliasesJson(String(row.aliasesJson ?? row.aliases ?? '[]'))
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      characterName: previous?.characterName ?? normalizedCharacterName,
      aliases: normalizeCharacterAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  }

  return [...aliasMap.values()].toSorted((left, right) =>
    left.characterName.localeCompare(right.characterName, 'ja'))
}

function buildKeywordAliases(rows: KeywordAliasRow[]): KeywordAliasEntry[] {
  const aliasMap = new Map<string, KeywordAliasEntry>()

  for (const row of rows) {
    const baseKeyword = normalizeKeywordBaseTerm(String(row.baseKeyword))
    if (!baseKeyword) {
      continue
    }

    const key = normalizeKeywordAliasKey(baseKeyword)
    if (!key) {
      continue
    }

    const aliases = parseKeywordAliasesJson(String(row.aliasesJson ?? row.aliases ?? '[]'))
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      baseKeyword: previous?.baseKeyword ?? baseKeyword,
      aliases: normalizeKeywordAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  }

  return [...aliasMap.values()].toSorted((left, right) =>
    left.baseKeyword.localeCompare(right.baseKeyword, 'ja'))
}

function dedupeKeywords(keywords: Iterable<unknown>): string[] {
  const uniqueKeywords: string[] = []
  const seen = new Set<string>()

  for (const keyword of keywords) {
    const normalized = String(keyword).trim().replace(normalizeSpacesPattern, ' ')
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueKeywords.push(normalized)
  }

  return uniqueKeywords
}

function buildFeaturedSearchKeywords(rows: FeaturedKeywordRow[]): string[] {
  return dedupeKeywords(rows.map(row => row.keyword))
}

function looksLikeMissingObject(message: string): boolean {
  return missingObjectPattern.test(message)
}

function ensureOutputImagePath(outputImagesDir: string, fileName: string): string {
  const safeName = path.basename(fileName)
  if (safeName !== fileName) {
    throw new Error(`Unsafe source image filename: ${fileName}`)
  }

  return path.join(outputImagesDir, safeName)
}

function hashFile(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function getLocalImageName(commissionFileName: string, objectKey: string) {
  const extension = path.posix.extname(objectKey).toLowerCase()
  if (!['.jpg', '.jpeg', '.png'].includes(extension)) {
    throw new Error(`不支持的源图扩展名：${objectKey}`)
  }
  const fileName = `${commissionFileName}${extension}`
  ensureOutputImagePath('.', fileName)
  return fileName
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).toSorted(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

type SnapshotContentInput = Omit<GeneratedFactSourceContent, 'meta'> & { meta: Omit<GeneratedFactSourceMeta, 'revision'> }
type SnapshotManifestInput = Omit<GeneratedSourceImageManifest, 'meta'> & { meta: Omit<GeneratedFactSourceMeta, 'revision'> }

export function createSnapshot(content: SnapshotContentInput, manifest: SnapshotManifestInput) {
  // 时间和既有 revision 不参与内容身份；数组顺序属于业务数据，必须保留。
  const stableMeta = {
    schemaVersion: content.meta.schemaVersion,
    source: content.meta.source,
    databaseBinding: content.meta.databaseBinding,
    imagesBucket: content.meta.imagesBucket,
  }
  const revision = createHash('sha256').update(canonicalJson({
    content: { ...content, meta: stableMeta },
    manifest: { ...manifest, meta: stableMeta },
  })).digest('hex')
  return {
    content: { ...content, meta: { ...content.meta, revision } },
    manifest: { ...manifest, meta: { ...manifest.meta, revision } },
  }
}

export function verifyExistingSnapshot(outputRoot: string, expectedRevision?: string) {
  const snapshotDir = path.join(outputRoot, factSourceDirectoryName)
  const content = JSON.parse(readFileSync(path.join(snapshotDir, 'content.json'), 'utf8')) as GeneratedFactSourceContent
  const manifest = JSON.parse(readFileSync(path.join(snapshotDir, 'source-images-manifest.json'), 'utf8')) as GeneratedSourceImageManifest
  const revision = createSnapshot(content, manifest).content.meta.revision
  if (content.meta.revision !== revision || manifest.meta.revision !== revision || (expectedRevision && expectedRevision !== revision)) {
    throw new Error('事实源 revision 不匹配，请重新导出完整快照。')
  }
  for (const file of manifest.files) {
    const localName = getLocalImageName(file.commissionFileName, file.objectKey)
    const expectedPath = path.posix.join(imageOutputDirectoryName, localName)
    if (file.relativePath !== expectedPath || hashFile(path.join(outputRoot, expectedPath)) !== file.sha256) {
      throw new Error(`事实源图片校验失败：${file.commissionFileName}`)
    }
  }
  return revision
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < downloadFileWaitAttempts; attempt += 1) {
    if (existsSync(filePath)) {
      return true
    }

    await sleep(downloadFileWaitMilliseconds)
  }

  return false
}

function resolveDownloadConcurrency() {
  const rawValue = process.env.FACT_SOURCE_DOWNLOAD_CONCURRENCY?.trim()
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return defaultDownloadConcurrency
  }

  return Math.min(parsedValue, maxDownloadConcurrency)
}

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
  const results: TResult[] = []
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) {
        return
      }

      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  const workerSlots = Array.from({ length: workerCount }, (_, index) => index)
  const outcomes = await Promise.allSettled(workerSlots.map(() => runWorker()))
  const rejected = outcomes.find(outcome => outcome.status === 'rejected')
  if (rejected?.status === 'rejected') {
    throw rejected.reason
  }
  return results
}

function writeJsonFile(filePath: string, payload: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export function buildSourceImageFileRecord(
  commissionFileName: string,
  objectKey: string,
  filePath: string,
  commissionId: number,
): GeneratedSourceImageManifestFile {
  const fileStats = statSync(filePath)

  return {
    commissionId,
    commissionFileName,
    objectKey,
    relativePath: path.posix.join(imageOutputDirectoryName, getLocalImageName(commissionFileName, objectKey)),
    mimeType: getSourceImageMimeType(objectKey),
    byteSize: fileStats.size,
    sha256: hashFile(filePath),
  }
}

function buildSourceImageRowMap(rows: SourceImageRow[]) {
  const byId = new Map<number, SourceImageRow>()
  for (const row of rows) {
    if (byId.has(row.commissionId)) {
      throw new Error(`重复的 source_images commission_id：${row.commissionId}`)
    }
    byId.set(row.commissionId, row)
  }
  return byId
}

export function resolveReusableSourceImageRecord(
  outputImagesDir: string,
  sourceImageRow?: SourceImageRow,
): GeneratedSourceImageManifestFile | null {
  if (!sourceImageRow) {
    return null
  }

  const localName = getLocalImageName(sourceImageRow.commissionFileName, sourceImageRow.objectKey)
  const outputPath = ensureOutputImagePath(outputImagesDir, localName)
  if (!existsSync(outputPath)) {
    return null
  }

  const fileStats = statSync(outputPath)
  if (fileStats.size !== sourceImageRow.byteSize) {
    return null
  }

  if (hashFile(outputPath) !== sourceImageRow.sha256) {
    return null
  }

  return {
    commissionId: sourceImageRow.commissionId,
    commissionFileName: sourceImageRow.commissionFileName,
    objectKey: sourceImageRow.objectKey,
    relativePath: path.posix.join(imageOutputDirectoryName, localName),
    mimeType: sourceImageRow.mimeType || getSourceImageMimeType(sourceImageRow.objectKey),
    byteSize: sourceImageRow.byteSize,
    sha256: sourceImageRow.sha256,
  }
}

function cleanupStaleSourceImages(outputImagesDir: string, retainedObjectKeys: Set<string>) {
  if (!existsSync(outputImagesDir)) {
    return
  }

  for (const entry of readdirSync(outputImagesDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue
    }

    if (!retainedObjectKeys.has(entry.name)) {
      rmSync(path.join(outputImagesDir, entry.name), { force: true })
    }
  }
}

function buildMeta({
  databaseBinding,
  imagesBucket,
}: {
  databaseBinding: string
  imagesBucket: string
}): Omit<GeneratedFactSourceMeta, 'revision'> {
  return {
    schemaVersion: GENERATED_FACT_SOURCE_SCHEMA_VERSION,
    source: GENERATED_FACT_SOURCE_SOURCE,
    exportedAt: new Date().toISOString(),
    databaseBinding,
    imagesBucket,
  }
}

interface ExpectedSourceImage {
  commissionId: number
  commissionFileName: string
}

function listExpectedSourceImages(characters: CharacterRecord[]): ExpectedSourceImage[] {
  const byId = new Map<number, ExpectedSourceImage>()
  const fileNames = new Set<string>()

  for (const character of characters) {
    for (const commission of character.commissions) {
      if (!Number.isSafeInteger(commission.id) || commission.id <= 0 || byId.has(commission.id)) {
        throw new Error(`事实源作品 ID 无效或重复：${commission.id}`)
      }
      if (fileNames.has(commission.fileName)) {
        throw new Error(`事实源作品 fileName 重复，无法稳定映射本地图片：${commission.fileName}`)
      }
      fileNames.add(commission.fileName)
      byId.set(commission.id, {
        commissionId: commission.id,
        commissionFileName: commission.fileName,
      })
    }
  }

  return [...byId.values()].toSorted((left, right) => left.commissionFileName.localeCompare(right.commissionFileName))
}

async function downloadSourceImageObject(
  bucketName: string,
  objectKey: string,
  outputPath: string,
) {
  let result: { status: number | null, stdout: string, stderr: string } | null = null
  let hardFailureMessage = ''

  for (let attempt = 1; attempt <= maxDownloadAttempts; attempt += 1) {
    result = await runWranglerAsync([
      'r2',
      'object',
      'get',
      `${bucketName}/${objectKey}`,
      '--config',
      wranglerConfigPath,
      '--file',
      outputPath,
      '--remote',
    ])

    if (result.status === 0 && await waitForFile(outputPath)) {
      return { message: '', ok: true }
    }

    const message = result.status === 0
      ? `Downloaded ${bucketName}/${objectKey} but file was not written to ${outputPath}.`
      : (result.stderr || result.stdout || '').trim()

    rmSync(outputPath, { force: true })

    if (looksLikeMissingObject(message)) {
      return { message, ok: false }
    }

    if (attempt === maxDownloadAttempts) {
      hardFailureMessage = message
    }
  }

  return {
    message: hardFailureMessage || (result?.stderr || result?.stdout || '').trim(),
    ok: false,
  }
}

async function exportSourceImages(
  expectedImages: ExpectedSourceImage[],
  options: ExportSourceImagesOptions,
): Promise<ExportSourceImagesResult> {
  mkdirSync(options.outputImagesDir, { recursive: true })
  const stagingDirectory = mkdtempSync(path.join(options.outputImagesDir, '.export-'))
  try {
    const result = await stageSourceImages(expectedImages, options, stagingDirectory)
    if (!result.hasHardFailure) {
      const retainedNames = new Set(result.files.map(file => path.posix.basename(file.relativePath)))
      for (const name of readdirSync(stagingDirectory)) {
        renameSync(path.join(stagingDirectory, name), ensureOutputImagePath(options.outputImagesDir, name))
      }
      cleanupStaleSourceImages(options.outputImagesDir, retainedNames)
    }
    return result
  }
  finally {
    rmSync(stagingDirectory, { recursive: true, force: true })
  }
}

async function stageSourceImages(
  expectedImages: ExpectedSourceImage[],
  { bucketName, outputImagesDir, sourceImageRows }: ExportSourceImagesOptions,
  stagingDirectory: string,
): Promise<ExportSourceImagesResult> {
  const files: GeneratedSourceImageManifestFile[] = []
  const missing: GeneratedSourceImageManifestMissing[] = []
  const sourceImageRowMap = buildSourceImageRowMap(sourceImageRows)
  let downloadedCount = 0
  let reusedCount = 0

  const downloadConcurrency = resolveDownloadConcurrency()
  const resolvedDownloadConcurrency = expectedImages.length === 0
    ? 0
    : Math.min(downloadConcurrency, expectedImages.length)
  console.log(`Materializing ${expectedImages.length} source image(s) (concurrency=${resolvedDownloadConcurrency})...`)

  const taskResults = await mapWithConcurrency(
    expectedImages,
    downloadConcurrency,
    async ({ commissionId, commissionFileName }, index): Promise<ExportSourceImageTaskResult> => {
      const progressLabel = `[${index + 1}/${expectedImages.length}] ${commissionFileName}`
      const candidateObjectKeys = buildSourceImageCandidateKeys(commissionFileName)
      const sourceImageRow = sourceImageRowMap.get(commissionId)
      if (sourceImageRow && sourceImageRow.commissionFileName !== commissionFileName) {
        throw new Error(`source_images commission_id ${commissionId} 的文件映射与作品快照不一致。`)
      }
      const reusableRecord = resolveReusableSourceImageRecord(outputImagesDir, sourceImageRow)
      if (reusableRecord) {
        return {
          downloadedCount: 0,
          file: reusableRecord,
          hardFailure: false,
          missing: null,
          reusedCount: 1,
        }
      }

      const orderedCandidateObjectKeys = sourceImageRow
        ? [sourceImageRow.objectKey]
        : candidateObjectKeys
      console.log(`  ↓ ${progressLabel}`)
      let exportedRecord: GeneratedSourceImageManifestFile | null = null
      let hardFailureMessage = ''

      for (const objectKey of orderedCandidateObjectKeys) {
        const outputPath = ensureOutputImagePath(stagingDirectory, getLocalImageName(commissionFileName, objectKey))
        const tempOutputPath = `${outputPath}.${process.pid}.${index}.download`
        rmSync(tempOutputPath, { force: true })

        const downloadResult = await downloadSourceImageObject(bucketName, objectKey, tempOutputPath)
        if (downloadResult.ok) {
          const record = buildSourceImageFileRecord(commissionFileName, objectKey, tempOutputPath, commissionId)
          if (sourceImageRow && (sourceImageRow.sha256 !== record.sha256 || sourceImageRow.byteSize !== record.byteSize)) {
            rmSync(tempOutputPath, { force: true })
            hardFailureMessage = `图片内容与读取的 D1 快照不一致：${commissionFileName}`
            break
          }
          rmSync(outputPath, { force: true })
          writeFileSync(outputPath, readFileSync(tempOutputPath))
          rmSync(tempOutputPath, { force: true })
          console.log(`  ✓ ${progressLabel} -> ${objectKey}`)
          exportedRecord = record

          break
        }

        rmSync(tempOutputPath, { force: true })

        const message = downloadResult.message
        if (!looksLikeMissingObject(message)) {
          hardFailureMessage = message
          break
        }
      }

      if (exportedRecord) {
        return {
          downloadedCount: 1,
          file: exportedRecord,
          hardFailure: false,
          missing: null,
          reusedCount: 0,
        }
      }

      if (hardFailureMessage) {
        console.error(`  ✗ ${progressLabel}: ${hardFailureMessage}`)
        return {
          downloadedCount: 0,
          file: null,
          hardFailure: true,
          missing: {
            commissionId,
            commissionFileName,
            candidateObjectKeys: orderedCandidateObjectKeys,
            reason: 'download_failed',
            message: hardFailureMessage || undefined,
          },
          reusedCount: 0,
        }
      }

      console.error(`  ✗ ${progressLabel}: no candidate found in R2`)
      return {
        downloadedCount: 0,
        file: null,
        hardFailure: Boolean(sourceImageRow),
        missing: {
          commissionId,
          commissionFileName,
          candidateObjectKeys: orderedCandidateObjectKeys,
          reason: 'not_found',
        },
        reusedCount: 0,
      }
    },
  )

  let hasHardFailure = false
  for (const result of taskResults) {
    if (result.file) {
      files.push(result.file)
    }

    if (result.missing) {
      missing.push(result.missing)
    }

    downloadedCount += result.downloadedCount
    reusedCount += result.reusedCount
    hasHardFailure = hasHardFailure || result.hardFailure
  }

  return {
    files,
    missing,
    hasHardFailure,
    downloadedCount,
    reusedCount,
  }
}

export const factSourceSnapshotTables = [
  { fields: ['id', 'name', 'status', 'sortOrder'], query: 'SELECT id, name, status, sort_order as sortOrder FROM characters ORDER BY sort_order ASC, id ASC' },
  { fields: ['id', 'publicId', 'characterId', 'commissionDate', 'creatorName', 'workGroupId', 'partNumber', 'fileName', 'links', 'design', 'description', 'hidden', 'keyword'], query: 'SELECT id, public_id as publicId, character_id as characterId, commission_date as commissionDate, creator_name as creatorName, work_group_id as workGroupId, part_number as partNumber, file_name as fileName, links, design, description, hidden, keyword FROM commissions ORDER BY character_id ASC, commission_date DESC, id DESC' },
  { fields: ['creatorName', 'aliasesJson'], query: 'SELECT creator_name as creatorName, aliases as aliasesJson FROM creator_aliases ORDER BY creator_name ASC' },
  { fields: ['characterName', 'aliasesJson'], query: 'SELECT character_name as characterName, aliases as aliasesJson FROM character_aliases ORDER BY character_name ASC' },
  { fields: ['baseKeyword', 'aliasesJson'], query: 'SELECT base_keyword as baseKeyword, aliases as aliasesJson FROM keyword_aliases ORDER BY base_keyword ASC' },
  { fields: ['keyword', 'sortOrder'], query: 'SELECT keyword, sort_order as sortOrder FROM home_featured_search_keywords ORDER BY sort_order ASC, keyword ASC' },
  { fields: ['commissionId', 'commissionFileName', 'objectKey', 'mimeType', 'byteSize', 'sha256'], query: 'SELECT source_images.commission_id as commissionId, commissions.file_name as commissionFileName, source_images.object_key as objectKey, source_images.mime_type as mimeType, source_images.byte_size as byteSize, source_images.sha256 as sha256 FROM source_images JOIN commissions ON commissions.id = source_images.commission_id ORDER BY source_images.commission_id ASC' },
]

// 一个 SELECT 读取全部 D1 表，避免跨语句拼接不同时间的业务状态。
export const factSourceSnapshotSql = `SELECT ${factSourceSnapshotTables.map(({ fields, query }, index) =>
  `(SELECT json_group_array(json_object(${fields.map(field => `'${field}', ${field}`).join(', ')})) FROM (${query})) AS table${index}`,
).join(', ')}`

function loadRemoteFactSource({
  databaseBinding,
  usePreview,
}: {
  databaseBinding: string
  usePreview: boolean
}): Omit<GeneratedFactSourceContent, 'meta'> & { sourceImages: SourceImageRow[] } {
  const snapshotRows = executeRemoteStatements([factSourceSnapshotSql], { databaseBinding, usePreview })
  const snapshot = snapshotRows[0]?.[0] as Record<string, string> | undefined
  if (!snapshot) {
    throw new Error('D1 未返回完整事实源快照。')
  }

  const [
    rawCharacterRows,
    rawCommissionRows,
    rawCreatorAliasRows,
    rawCharacterAliasRows,
    rawKeywordAliasRows,
    rawFeaturedKeywordRows,
    rawSourceImageRows,
  ] = factSourceSnapshotTables.map((_, index) => JSON.parse(snapshot[`table${index}`]) as unknown[])

  const characters = buildCharacterRecords(
    rawCharacterRows as CharacterRow[],
    rawCommissionRows as CommissionRow[],
  )

  return {
    characters,
    creatorAliases: buildCreatorAliases(rawCreatorAliasRows as CreatorAliasRow[]),
    characterAliases: buildCharacterAliases(rawCharacterAliasRows as CharacterAliasRow[]),
    keywordAliases: buildKeywordAliases(rawKeywordAliasRows as KeywordAliasRow[]),
    featuredSearchKeywords: buildFeaturedSearchKeywords(rawFeaturedKeywordRows as FeaturedKeywordRow[]),
    sourceImages: (rawSourceImageRows as SourceImageRow[]).map(row => ({
      byteSize: Number(row.byteSize),
      commissionId: Number(row.commissionId),
      commissionFileName: String(row.commissionFileName),
      mimeType: String(row.mimeType),
      objectKey: String(row.objectKey),
      sha256: String(row.sha256),
    })),
  }
}

export async function main(argv: string[] = process.argv.slice(2)) {
  const { outputRoot, usePreview } = parseArgs(argv)
  if (process.env.FACT_SOURCE_USE_EXISTING_SNAPSHOT === '1') {
    console.log(`复用已校验事实源快照 revision=${verifyExistingSnapshot(outputRoot, process.env.WEB_BUILD_CACHE_TOKEN)}`)
    return
  }
  const factSourceDir = path.join(outputRoot, factSourceDirectoryName)
  const outputImagesDir = path.join(outputRoot, imageOutputDirectoryName)

  // ==================== 导出结构化事实源 ====================
  const factSource = loadRemoteFactSource({
    databaseBinding: defaultDatabaseBinding,
    usePreview,
  })

  const meta = buildMeta({
    databaseBinding: defaultDatabaseBinding,
    imagesBucket: defaultBucketName,
  })

  const content = {
    meta,
    characters: factSource.characters,
    creatorAliases: factSource.creatorAliases,
    characterAliases: factSource.characterAliases,
    keywordAliases: factSource.keywordAliases,
    featuredSearchKeywords: factSource.featuredSearchKeywords,
  } satisfies SnapshotContentInput

  // ==================== 导出 source images 到 generated 目录 ====================
  const expectedSourceImages = listExpectedSourceImages(factSource.characters)
  const imageExport = await exportSourceImages(expectedSourceImages, {
    bucketName: defaultBucketName,
    outputImagesDir,
    sourceImageRows: factSource.sourceImages,
  })

  if (imageExport.hasHardFailure) {
    throw new Error('图片导出失败，未提交新的事实源快照。')
  }
  const snapshot = createSnapshot(content, { meta, files: imageExport.files, missing: imageExport.missing })
  writeJsonFile(path.join(factSourceDir, 'content.json'), snapshot.content)
  writeJsonFile(path.join(factSourceDir, 'source-images-manifest.json'), snapshot.manifest)

  console.log(
    [
      `Exported generated fact source to ${outputRoot}`,
      `revision=${snapshot.content.meta.revision}`,
      `characters=${factSource.characters.length}`,
      `creatorAliases=${factSource.creatorAliases.length}`,
      `characterAliases=${factSource.characterAliases.length}`,
      `keywordAliases=${factSource.keywordAliases.length}`,
      `featuredKeywords=${factSource.featuredSearchKeywords.length}`,
      `materializedImages=${imageExport.files.length}`,
      `downloadedImages=${imageExport.downloadedCount}`,
      `reusedImages=${imageExport.reusedCount}`,
      `missingImages=${imageExport.missing.length}`,
    ].join(' | '),
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
