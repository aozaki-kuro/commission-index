import process from 'node:process'
import { getGeneratedSourceImageManifest } from '@data/generatedFactSource'

interface SourceImageModule {
  default: ImageMetadata
}

export interface SourceImageRecord {
  commissionId: number
  metadata: ImageMetadata
}

export interface SourceImageLookup {
  byCommissionId: Map<number, ImageMetadata>
}

const isDevelopment = process.env.NODE_ENV === 'development'
const generatedImageModulePrefix = '/generated/'
const SOURCE_IMAGE_MODULES = import.meta.glob<SourceImageModule>('/generated/source-images/**/*.{jpg,jpeg,png}', {
  eager: true,
})
let cachedSourceImageLookup: SourceImageLookup | null = null

function buildSourceImageRecords(): SourceImageRecord[] {
  // The manifest links each image to its commission by integer ID. Filenames are
  // never matched against commissions: a missing image must surface as missing.
  return getGeneratedSourceImageManifest().files.map((file) => {
    const modulePath = `${generatedImageModulePrefix}${file.relativePath}`
    const module = SOURCE_IMAGE_MODULES[modulePath]
    if (!module) {
      throw new Error(
        `Generated source image missing from build input: ${modulePath}. Run \`pnpm run web:fact-source:export\` and try again.`,
      )
    }

    return {
      commissionId: file.commissionId,
      metadata: module.default,
    }
  })
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
  const byCommissionId = new Map<number, ImageMetadata>()

  for (const record of records) {
    if (!Number.isSafeInteger(record.commissionId) || record.commissionId <= 0 || byCommissionId.has(record.commissionId)) {
      throw new Error(`Invalid or duplicate source-image commission ID: ${record.commissionId}`)
    }
    byCommissionId.set(record.commissionId, record.metadata)
  }

  return { byCommissionId }
}

export function resolveSourceImageByCommissionId(commissionId: number, lookup?: SourceImageLookup): ImageMetadata | null {
  const resolvedLookup = lookup ?? getSourceImageLookup()
  return resolvedLookup.byCommissionId.get(commissionId) ?? null
}

/** Returns the file names of commissions without their own image, for diagnostics only. */
export function listMissingSourceImages(
  commissions: ReadonlyArray<{ id: number, fileName: string }>,
  lookup?: SourceImageLookup,
) {
  const resolvedLookup = lookup ?? getSourceImageLookup()
  const missing = new Set<string>()

  for (const commission of commissions) {
    if (!resolvedLookup.byCommissionId.has(commission.id)) {
      missing.add(commission.fileName)
    }
  }

  return [...missing].toSorted((a, b) => a.localeCompare(b))
}
