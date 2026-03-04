type SourceImageModule = {
  default: ImageMetadata
}

export type SourceImageRecord = {
  stem: string
  metadata: ImageMetadata
}

export type SourceImageLookup = {
  byStem: Map<string, ImageMetadata>
  normalizedMap: Map<string, string[]>
  dateMap: Map<string, string[]>
}

const SOURCE_IMAGE_MODULES = import.meta.glob<SourceImageModule>('/data/images/*.{jpg,jpeg,png}', {
  eager: true,
})

const extensionPriority = (filePath: string) => {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith('.png')) return 0
  if (normalized.endsWith('.jpg')) return 1
  if (normalized.endsWith('.jpeg')) return 2
  return 99
}

const extractStemFromPath = (filePath: string): string => {
  const fileName = filePath.split('/').pop() ?? filePath
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return fileName
  return fileName.slice(0, dotIndex)
}

export const normalizeSourceImageStem = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, '')
    .replace(/[\s'"`’“”()（）[\]{}]/g, '')

const getDatePrefix = (value: string) => value.slice(0, 8)
const getCreatorName = (value: string) => (value.length > 9 ? value.slice(9) : '')

const buildSourceImageRecords = (): SourceImageRecord[] => {
  const records = Object.entries(SOURCE_IMAGE_MODULES)
    .map(([filePath, module]) => ({
      filePath,
      stem: extractStemFromPath(filePath),
      metadata: module.default,
    }))
    .sort((a, b) => {
      const priorityDelta = extensionPriority(a.filePath) - extensionPriority(b.filePath)
      if (priorityDelta !== 0) return priorityDelta
      return a.stem.localeCompare(b.stem)
    })

  const deduped = new Map<string, SourceImageRecord>()
  for (const record of records) {
    if (!deduped.has(record.stem)) {
      deduped.set(record.stem, {
        stem: record.stem,
        metadata: record.metadata,
      })
    }
  }

  return [...deduped.values()]
}

export const buildSourceImageLookup = (records: SourceImageRecord[]): SourceImageLookup => {
  const byStem = new Map<string, ImageMetadata>()
  const normalizedMap = new Map<string, string[]>()
  const dateMap = new Map<string, string[]>()

  for (const record of records) {
    byStem.set(record.stem, record.metadata)

    const normalized = normalizeSourceImageStem(record.stem)
    const normalizedEntries = normalizedMap.get(normalized)
    if (normalizedEntries) normalizedEntries.push(record.stem)
    else normalizedMap.set(normalized, [record.stem])

    const datePrefix = getDatePrefix(record.stem)
    const dateEntries = dateMap.get(datePrefix)
    if (dateEntries) dateEntries.push(record.stem)
    else dateMap.set(datePrefix, [record.stem])
  }

  return { byStem, normalizedMap, dateMap }
}

const resolveStemByFallback = (fileName: string, lookup: SourceImageLookup): string | null => {
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

  const creatorCandidates = dateCandidates.filter(candidate => {
    const candidateCreatorNormalized = normalizeSourceImageStem(getCreatorName(candidate))
    return (
      candidateCreatorNormalized.includes(creatorNormalized) ||
      creatorNormalized.includes(candidateCreatorNormalized)
    )
  })

  return creatorCandidates.length === 1 ? creatorCandidates[0] : null
}

export const resolveSourceImageStem = (
  fileName: string,
  lookup: SourceImageLookup,
): string | null => {
  if (lookup.byStem.has(fileName)) {
    return fileName
  }

  return resolveStemByFallback(fileName, lookup)
}

const sourceImageLookup = buildSourceImageLookup(buildSourceImageRecords())

export const resolveSourceImageByCommissionFileName = (
  fileName: string,
  lookup: SourceImageLookup = sourceImageLookup,
): ImageMetadata | null => {
  const resolvedStem = resolveSourceImageStem(fileName, lookup)
  if (!resolvedStem) return null
  return lookup.byStem.get(resolvedStem) ?? null
}

export const listMissingSourceImages = (
  commissionFileNames: string[],
  lookup: SourceImageLookup = sourceImageLookup,
) => {
  const missing = new Set<string>()

  for (const fileName of commissionFileNames) {
    if (!resolveSourceImageStem(fileName, lookup)) {
      missing.add(fileName)
    }
  }

  return [...missing].sort((a, b) => a.localeCompare(b))
}
