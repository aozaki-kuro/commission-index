import process from 'node:process'
import { getGeneratedSourceImageManifest } from '@data/generatedFactSource'

interface SourceImageModule {
  default: ImageMetadata
}

export interface SourceImageRecord {
  commissionId: number
  stem: string
  metadata: ImageMetadata
}

export interface SourceImageLookup {
  byStem: Map<string, ImageMetadata>
  byCommissionId: Map<number, ImageMetadata>
  normalizedMap: Map<string, string[]>
  dateMap: Map<string, string[]>
}

const isDevelopment = process.env.NODE_ENV === 'development'
const generatedImageModulePrefix = '/generated/'
const SOURCE_IMAGE_MODULES = import.meta.glob<SourceImageModule>('/generated/source-images/**/*.{jpg,jpeg,png}', {
  eager: true,
})
const STEM_CONNECTOR_PATTERN = /[_-]+/g
const STEM_NOISE_PATTERN = /[\s'"`’“”()（）[\]{}]/g
let cachedSourceImageLookup: SourceImageLookup | null = null

function extensionPriority(filePath: string) {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith('.png'))
    return 0
  if (normalized.endsWith('.jpg'))
    return 1
  if (normalized.endsWith('.jpeg'))
    return 2
  return 99
}

export function normalizeSourceImageStem(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(STEM_CONNECTOR_PATTERN, '')
    .replace(STEM_NOISE_PATTERN, '')
}

const getDatePrefix = (value: string) => value.slice(0, 8)
const getCreatorName = (value: string) => (value.length > 9 ? value.slice(9) : '')

function resolveGeneratedImageModulePath(relativePath: string) {
  return `${generatedImageModulePrefix}${relativePath}`
}

function buildSourceImageRecords(): SourceImageRecord[] {
  const seenIds = new Set<number>()
  const records = getGeneratedSourceImageManifest().files.map((file) => {
    if (!Number.isSafeInteger(file.commissionId) || file.commissionId <= 0 || seenIds.has(file.commissionId)) {
      throw new Error(`Invalid or duplicate source-image commission ID: ${file.commissionId}`)
    }
    seenIds.add(file.commissionId)
    const modulePath = resolveGeneratedImageModulePath(file.relativePath)
    const module = SOURCE_IMAGE_MODULES[modulePath]
    if (!module) {
      throw new Error(
        `Generated source image missing from build input: ${modulePath}. Run \`pnpm run web:fact-source:export\` and try again.`,
      )
    }

    return {
      filePath: modulePath,
      commissionId: file.commissionId,
      stem: file.commissionFileName,
      metadata: module.default,
    }
  }).sort((a, b) => {
    const priorityDelta = extensionPriority(a.filePath) - extensionPriority(b.filePath)
    if (priorityDelta !== 0)
      return priorityDelta
    return a.stem.localeCompare(b.stem)
  })

  const deduped = new Map<string, SourceImageRecord>()
  for (const record of records) {
    if (!deduped.has(record.stem)) {
      deduped.set(record.stem, {
        commissionId: record.commissionId,
        stem: record.stem,
        metadata: record.metadata,
      })
    }
  }

  return [...deduped.values()]
}

function getSourceImageLookup() {
  if (isDevelopment) {
    return buildSourceImageLookup(buildSourceImageRecords())
  }

  if (!cachedSourceImageLookup) {
    cachedSourceImageLookup = buildSourceImageLookup(buildSourceImageRecords())
  }

  return cachedSourceImageLookup
}

export function buildSourceImageLookup(records: SourceImageRecord[]): SourceImageLookup {
  const byStem = new Map<string, ImageMetadata>()
  const byCommissionId = new Map<number, ImageMetadata>()
  const normalizedMap = new Map<string, string[]>()
  const dateMap = new Map<string, string[]>()

  for (const record of records) {
    if (!Number.isSafeInteger(record.commissionId) || record.commissionId <= 0 || byCommissionId.has(record.commissionId)) {
      throw new Error(`Invalid or duplicate source-image commission ID: ${record.commissionId}`)
    }
    byCommissionId.set(record.commissionId, record.metadata)
    byStem.set(record.stem, record.metadata)

    const normalized = normalizeSourceImageStem(record.stem)
    const normalizedEntries = normalizedMap.get(normalized)
    if (normalizedEntries)
      normalizedEntries.push(record.stem)
    else normalizedMap.set(normalized, [record.stem])

    const datePrefix = getDatePrefix(record.stem)
    const dateEntries = dateMap.get(datePrefix)
    if (dateEntries)
      dateEntries.push(record.stem)
    else dateMap.set(datePrefix, [record.stem])
  }

  return { byStem, byCommissionId, normalizedMap, dateMap }
}

function resolveStemByFallback(fileName: string, lookup: SourceImageLookup): string | null {
  const normalized = normalizeSourceImageStem(fileName)
  const normalizedCandidates = lookup.normalizedMap.get(normalized) ?? []
  if (normalizedCandidates.length === 1) {
    return normalizedCandidates[0]
  }

  const datePrefix = getDatePrefix(fileName)
  const dateCandidates = lookup.dateMap.get(datePrefix) ?? []
  if (dateCandidates.length === 1) {
    return dateCandidates[0]
  }

  const creatorNormalized = normalizeSourceImageStem(getCreatorName(fileName))
  if (!creatorNormalized || dateCandidates.length <= 1) {
    return null
  }

  const creatorCandidates = dateCandidates.filter((candidate) => {
    const candidateCreatorNormalized = normalizeSourceImageStem(getCreatorName(candidate))
    return (
      candidateCreatorNormalized.includes(creatorNormalized)
      || creatorNormalized.includes(candidateCreatorNormalized)
    )
  })

  return creatorCandidates.length === 1 ? creatorCandidates[0] : null
}

export function resolveSourceImageStem(fileName: string, lookup?: SourceImageLookup): string | null {
  const resolvedLookup = lookup ?? getSourceImageLookup()

  if (resolvedLookup.byStem.has(fileName)) {
    return fileName
  }

  return resolveStemByFallback(fileName, resolvedLookup)
}

export function listSourceImageStems(lookup?: SourceImageLookup) {
  const resolvedLookup = lookup ?? getSourceImageLookup()
  return [...resolvedLookup.byStem.keys()].toSorted((a, b) => a.localeCompare(b))
}

export function resolveSourceImageByCommissionFileName(fileName: string, lookup?: SourceImageLookup): ImageMetadata | null {
  const resolvedLookup = lookup ?? getSourceImageLookup()
  const resolvedStem = resolveSourceImageStem(fileName, resolvedLookup)
  if (!resolvedStem)
    return null
  return resolvedLookup.byStem.get(resolvedStem) ?? null
}

export function listMissingSourceImages(commissionFileNames: string[], lookup?: SourceImageLookup) {
  const resolvedLookup = lookup ?? getSourceImageLookup()
  const missing = new Set<string>()

  for (const fileName of commissionFileNames) {
    if (!resolveSourceImageStem(fileName, resolvedLookup)) {
      missing.add(fileName)
    }
  }

  return [...missing].toSorted((a, b) => a.localeCompare(b))
}
