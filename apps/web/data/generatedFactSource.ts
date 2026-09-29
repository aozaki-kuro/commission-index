import type {
  GeneratedFactSourceContent,
  GeneratedSourceImageManifest,
} from '@commission-index/domain'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { GENERATED_FACT_SOURCE_SCHEMA_VERSION } from '@commission-index/domain'

const isDevelopment = process.env.NODE_ENV === 'development'
const generatedDirectoryName = 'generated'
const factSourceDirectoryName = 'fact-source'

let cachedFactSourceContent: GeneratedFactSourceContent | null = null
let cachedSourceImageManifest: GeneratedSourceImageManifest | null = null

function resolveGeneratedFactSourcePath(fileName: string) {
  const cwdPath = path.join(process.cwd(), generatedDirectoryName, factSourceDirectoryName, fileName)
  if (fs.existsSync(cwdPath)) {
    return cwdPath
  }

  const workspacePath = path.join(
    process.cwd(),
    'apps',
    'web',
    generatedDirectoryName,
    factSourceDirectoryName,
    fileName,
  )
  if (fs.existsSync(workspacePath)) {
    return workspacePath
  }

  return cwdPath
}

export function hasGeneratedFactSourceFile(fileName: string) {
  return fs.existsSync(resolveGeneratedFactSourcePath(fileName))
}

export function hasGeneratedFactSourceContent() {
  if (!hasGeneratedFactSourceFile('content.json')) {
    return false
  }

  try {
    const content = readGeneratedJsonFile<GeneratedFactSourceContent>('content.json')
    return content.meta?.schemaVersion === GENERATED_FACT_SOURCE_SCHEMA_VERSION
  }
  catch {
    return false
  }
}

function readGeneratedJsonFile<T>(fileName: string): T {
  const filePath = resolveGeneratedFactSourcePath(fileName)
  if (!hasGeneratedFactSourceFile(fileName)) {
    throw new Error(
      `Generated fact source file not found at ${filePath}. Run \`pnpm run web:fact-source:export\` or \`pnpm run build:web\` first.`,
    )
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse generated fact source file ${filePath}: ${message}`)
  }
}

function isCommissionDate(value: unknown): value is string | null {
  if (value === null) {
    return true
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGeneratedFactSourceSnapshot(
  contentValue: unknown,
  manifestValue: unknown,
): asserts contentValue is GeneratedFactSourceContent {
  if (!isRecord(contentValue) || !isRecord(contentValue.meta)) {
    throw new Error('Generated fact-source content has an invalid shape.')
  }
  const content = contentValue
  const contentMeta = content.meta
  if (!isRecord(contentMeta)) {
    throw new TypeError('Generated fact-source content has invalid metadata.')
  }
  if (contentMeta.schemaVersion !== GENERATED_FACT_SOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported generated fact-source schema version: ${contentMeta.schemaVersion}`)
  }
  if (!Array.isArray(content.characters)) {
    throw new TypeError('Generated fact-source content has an invalid characters list.')
  }

  const ids = new Set<number>()
  for (const character of content.characters) {
    if (!isRecord(character) || !Array.isArray(character.commissions)) {
      throw new Error('Generated fact-source content has an invalid character record.')
    }
    for (const commission of character.commissions) {
      if (!isRecord(commission)) {
        throw new Error('Generated fact-source content has an invalid commission record.')
      }
      const id = commission.id
      if (!Number.isSafeInteger(id) || (id as number) <= 0 || ids.has(id as number)) {
        throw new Error(`Invalid or duplicate commission ID in generated fact source: ${id}`)
      }
      if (!Object.hasOwn(commission, 'commissionDate') || !isCommissionDate(commission.commissionDate)) {
        throw new Error(`Invalid commission date for ID ${id}`)
      }
      if (!Object.hasOwn(commission, 'creatorName') || (commission.creatorName !== null && typeof commission.creatorName !== 'string')) {
        throw new Error(`Invalid creator name for ID ${id}`)
      }
      if (commission.seriesKey != null && typeof commission.seriesKey !== 'string') {
        throw new Error(`Invalid legacy series key for ID ${id}`)
      }
      if (commission.seriesOrder != null && typeof commission.seriesOrder !== 'string') {
        throw new Error(`Invalid legacy series order for ID ${id}`)
      }
      if (typeof commission.fileName !== 'string' || !commission.fileName) {
        throw new Error(`Invalid source-image key for ID ${id}`)
      }
      ids.add(id as number)
    }
  }

  const fileNameById = new Map<number, string>()
  for (const character of content.characters as Array<Record<string, unknown>>) {
    for (const commission of character.commissions as Array<Record<string, unknown>>) {
      fileNameById.set(commission.id as number, commission.fileName as string)
    }
  }

  if (!isRecord(manifestValue) || !isRecord(manifestValue.meta)) {
    throw new Error('Generated source-image manifest has an invalid shape.')
  }
  const manifest = manifestValue
  const manifestMeta = manifest.meta
  if (!isRecord(manifestMeta)) {
    throw new TypeError('Generated source-image manifest has invalid metadata.')
  }
  if (manifestMeta.schemaVersion !== GENERATED_FACT_SOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported source-image manifest schema version: ${manifestMeta.schemaVersion}`)
  }
  if (typeof contentMeta.revision !== 'string' || typeof manifestMeta.revision !== 'string' || contentMeta.revision !== manifestMeta.revision) {
    throw new Error('Generated fact-source content and source-image manifest revisions do not match.')
  }
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.missing)) {
    throw new TypeError('Generated source-image manifest has an invalid files list.')
  }
  const imageIds = new Set<number>()
  const imageFileNames = new Set<string>()
  for (const image of [...manifest.files, ...manifest.missing]) {
    if (!isRecord(image) || !Number.isSafeInteger(image.commissionId) || (image.commissionId as number) <= 0) {
      throw new Error('Generated source-image manifest has an invalid commission ID.')
    }
    const id = image.commissionId as number
    const fileName = image.commissionFileName
    if (imageIds.has(id)) {
      throw new Error(`Duplicate source-image manifest commission ID: ${id}`)
    }
    if (typeof fileName !== 'string' || fileName !== fileNameById.get(id)) {
      throw new Error(`Source-image manifest mapping does not match commission ID ${id}.`)
    }
    if (imageFileNames.has(fileName)) {
      throw new Error(`Duplicate source-image manifest fileName: ${fileName}`)
    }
    imageIds.add(id)
    imageFileNames.add(fileName)
  }
  if (imageIds.size !== fileNameById.size) {
    throw new Error('Source-image manifest does not cover every commission ID.')
  }
}

export function getGeneratedFactSourceContent(): GeneratedFactSourceContent {
  if (!isDevelopment && cachedFactSourceContent) {
    return cachedFactSourceContent
  }

  const content = readGeneratedJsonFile<GeneratedFactSourceContent>('content.json')
  const manifest = readGeneratedJsonFile<GeneratedSourceImageManifest>('source-images-manifest.json')
  validateGeneratedFactSourceSnapshot(content, manifest)
  cachedSourceImageManifest = manifest
  if (!isDevelopment) {
    cachedFactSourceContent = content
  }
  return content
}

export function getGeneratedSourceImageManifest(): GeneratedSourceImageManifest {
  if (!isDevelopment && cachedSourceImageManifest) {
    return cachedSourceImageManifest
  }
  getGeneratedFactSourceContent()
  return cachedSourceImageManifest!
}
