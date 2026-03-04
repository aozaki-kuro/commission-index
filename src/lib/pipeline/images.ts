import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { getCommissionData } from '../../../data/commissionData'

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
  SUCCESS: '\x1b[0m[\x1b[32m DONE \x1b[0m]',
  WARN: '\x1b[0m[\x1b[33m WARN \x1b[0m]',
} as const

const DIRS = {
  input: path.join(process.cwd(), 'data/images'),
  webp: path.join(process.cwd(), 'public/images/webp'),
}

const JPG_CONFIG = { quality: 95, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true }
const WEBP_CONFIG = { quality: 80 }
const SUPPORTED_EXTS = new Set(['.jpg', '.png'])
const RESPONSIVE_WIDTHS = [768, 960, 1280] as const
const LEGACY_RESPONSIVE_WIDTHS = [640] as const

type ResolveMode = 'exact' | 'normalized' | 'same-date' | 'same-date-creator'

type Resolution = {
  fileName: string
  stem: string
  mode: ResolveMode
}

export type ImageAuditOptions = {
  strict?: boolean
  cleanUnused?: boolean
}

export type ImageAuditResult = {
  mappedCount: number
  unresolved: string[]
  fallbackMatched: Resolution[]
  unused: string[]
  cleaned: string[]
}

type ImageConversionResult = {
  processed: number
  skipped: number
  ignored: number
  failed: string[]
}

const collectCommissionStems = (): Set<string> => {
  const commissionData = getCommissionData()
  const stems = new Set<string>()

  for (const { Commissions } of commissionData) {
    for (const commission of Commissions) {
      stems.add(commission.fileName)
    }
  }

  return stems
}

const collectCommissionFileNames = (): string[] => {
  const commissionData = getCommissionData()

  const names = new Set<string>()
  for (const { Commissions } of commissionData) {
    for (const commission of Commissions) {
      names.add(commission.fileName)
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

const fileExists = async (targetPath: string) => {
  try {
    await fsp.access(targetPath)
    return true
  } catch {
    return false
  }
}

const needsUpdate = async (src: string, dest: string) => {
  try {
    const [sourceStat, destStat] = await Promise.all([fsp.stat(src), fsp.stat(dest)])
    return destStat.mtime < sourceStat.mtime
  } catch {
    return true
  }
}

const buildResponsiveWebpPath = (stem: string, width: (typeof RESPONSIVE_WIDTHS)[number]) =>
  path.join(DIRS.webp, `${stem}-${width}.webp`)

const stripResponsiveWidthSuffix = (stem: string): string | null => {
  for (const width of [...RESPONSIVE_WIDTHS, ...LEGACY_RESPONSIVE_WIDTHS]) {
    const suffix = `-${width}`
    if (stem.endsWith(suffix)) {
      return stem.slice(0, -suffix.length)
    }
  }

  return null
}

const needsAnyUpdate = async (src: string, outputs: string[]) => {
  for (const output of outputs) {
    if (await needsUpdate(src, output)) return true
  }

  return false
}

const convertJpgToWebpSet = async (jpg: string, stem: string) => {
  const baseWebp = path.join(DIRS.webp, `${stem}.webp`)
  const responsiveWebps = RESPONSIVE_WIDTHS.map(width => buildResponsiveWebpPath(stem, width))
  const outputs = [baseWebp, ...responsiveWebps]

  if (!(await needsAnyUpdate(jpg, outputs))) {
    return 'skipped'
  }

  await Promise.all([
    sharp(jpg).webp(WEBP_CONFIG).toFile(baseWebp),
    ...RESPONSIVE_WIDTHS.map(width =>
      sharp(jpg)
        .resize({ width, withoutEnlargement: true })
        .webp(WEBP_CONFIG)
        .toFile(buildResponsiveWebpPath(stem, width)),
    ),
  ])

  return 'processed'
}

const convertImage = async (fileName: string) => {
  const { name, ext } = path.parse(fileName)
  const jpg = path.join(DIRS.input, `${name}.jpg`)
  const png = path.join(DIRS.input, `${name}.png`)

  try {
    if (ext === '.jpg') {
      if (await fileExists(png)) return 'skipped'
      return convertJpgToWebpSet(jpg, name)
    }

    const shouldRefreshJpg = await needsUpdate(png, jpg)

    if (shouldRefreshJpg) {
      await sharp(png).jpeg(JPG_CONFIG).withMetadata().toFile(jpg)
    }

    const conversionResult = await convertJpgToWebpSet(jpg, name)

    if (shouldRefreshJpg) {
      await fsp.unlink(png)
    }

    return conversionResult
  } catch {
    return 'failed'
  }
}

export const runImageConversion = async (): Promise<ImageConversionResult> => {
  await fsp.mkdir(DIRS.webp, { recursive: true })
  const files = await fsp.readdir(DIRS.input)
  const commissionStems = collectCommissionStems()
  const sourceFiles = files.filter(file => SUPPORTED_EXTS.has(path.extname(file).toLowerCase()))
  const stats: ImageConversionResult = { processed: 0, skipped: 0, ignored: 0, failed: [] }

  await Promise.all(
    sourceFiles
      .filter(file => {
        const isEligible = commissionStems.has(path.parse(file).name)
        if (!isEligible) stats.ignored++
        return isEligible
      })
      .map(async file => {
        const result = await convertImage(file)
        if (result === 'processed') stats.processed++
        else if (result === 'skipped') stats.skipped++
        else stats.failed.push(file)
      }),
  )

  const total = stats.processed + stats.skipped + stats.failed.length + stats.ignored
  if (stats.failed.length > 0) {
    console.warn(
      `${MSG.WARN} Processed ${total} files (processed=${stats.processed}, skipped=${stats.skipped}, ignored=${stats.ignored}), but failed: ${stats.failed.join(', ')}`,
    )
  } else {
    console.log(
      `${MSG.SUCCESS} Processed ${total} files (processed=${stats.processed}, skipped=${stats.skipped}, ignored=${stats.ignored})`,
    )
  }

  return stats
}

const normalizeStem = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.webp$/i, '')
    .replace(/[_-]+/g, '')
    .replace(/[\s'"`’“”()（）[\]{}]/g, '')

const getDatePrefix = (value: string) => value.slice(0, 8)
const getCreatorName = (value: string) => (value.length > 9 ? value.slice(9) : '')

const loadAvailableWebpStems = (): string[] => {
  if (!fs.existsSync(DIRS.webp)) return []

  return fs
    .readdirSync(DIRS.webp, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.webp')
    .map(entry => path.parse(entry.name).name)
}

const resolveStem = (
  fileName: string,
  exactSet: Set<string>,
  normalizedMap: Map<string, string[]>,
  dateMap: Map<string, string[]>,
): Resolution | null => {
  if (exactSet.has(fileName)) {
    return { fileName, stem: fileName, mode: 'exact' }
  }

  const normalized = normalizeStem(fileName)
  const normalizedCandidates = normalizedMap.get(normalized) ?? []
  if (normalizedCandidates.length === 1) {
    return { fileName, stem: normalizedCandidates[0], mode: 'normalized' }
  }

  const dateKey = getDatePrefix(fileName)
  const dateCandidates = dateMap.get(dateKey) ?? []
  if (dateCandidates.length === 1) {
    return { fileName, stem: dateCandidates[0], mode: 'same-date' }
  }

  const creatorNormalized = normalizeStem(getCreatorName(fileName))
  if (creatorNormalized && dateCandidates.length > 1) {
    const creatorCandidates = dateCandidates.filter(candidate => {
      const candidateCreatorNormalized = normalizeStem(getCreatorName(candidate))
      return (
        candidateCreatorNormalized.includes(creatorNormalized) ||
        creatorNormalized.includes(candidateCreatorNormalized)
      )
    })

    if (creatorCandidates.length === 1) {
      return { fileName, stem: creatorCandidates[0], mode: 'same-date-creator' }
    }
  }

  return null
}

export const runImageAudit = (options: ImageAuditOptions = {}): ImageAuditResult => {
  const strictMode = options.strict ?? process.env.IMAGE_IMPORT_STRICT === '1'
  const cleanUnused = options.cleanUnused ?? process.env.IMAGE_CLEAN_UNUSED === '1'
  const commissionFileNames = collectCommissionFileNames()
  const commissionStemSet = new Set(commissionFileNames)
  const allAvailableStems = loadAvailableWebpStems()
  const allAvailableStemSet = new Set(allAvailableStems)
  const variantStemsByBase = new Map<string, string[]>()
  const availableStems: string[] = []

  for (const stem of allAvailableStems) {
    const baseStem = stripResponsiveWidthSuffix(stem)
    const isResponsiveVariant =
      baseStem !== null && (allAvailableStemSet.has(baseStem) || commissionStemSet.has(baseStem))

    if (isResponsiveVariant && baseStem) {
      const variants = variantStemsByBase.get(baseStem)
      if (variants) variants.push(stem)
      else variantStemsByBase.set(baseStem, [stem])
      continue
    }

    availableStems.push(stem)
  }

  const exactSet = new Set(availableStems)

  const normalizedMap = new Map<string, string[]>()
  const dateMap = new Map<string, string[]>()
  for (const stem of availableStems) {
    const normalized = normalizeStem(stem)
    const normalizedList = normalizedMap.get(normalized)
    if (normalizedList) normalizedList.push(stem)
    else normalizedMap.set(normalized, [stem])

    const date = getDatePrefix(stem)
    const dateList = dateMap.get(date)
    if (dateList) dateList.push(stem)
    else dateMap.set(date, [stem])
  }

  const resolutions: Resolution[] = []
  const unresolved: string[] = []
  for (const fileName of commissionFileNames) {
    const resolved = resolveStem(fileName, exactSet, normalizedMap, dateMap)
    if (resolved) resolutions.push(resolved)
    else unresolved.push(fileName)
  }

  const resolvedStems = [...new Set(resolutions.map(item => item.stem))].sort((a, b) =>
    a.localeCompare(b),
  )
  const usedStemSet = new Set(resolvedStems)
  const unused = availableStems
    .filter(stem => !usedStemSet.has(stem))
    .sort((a, b) => a.localeCompare(b))
  const cleaned: string[] = []

  const fallbackMatched = resolutions.filter(item => item.mode !== 'exact')

  try {
    if (fallbackMatched.length > 0) {
      const preview = fallbackMatched
        .slice(0, 10)
        .map(item => `${item.fileName} -> ${item.stem} (${item.mode})`)
      const suffix =
        fallbackMatched.length > preview.length
          ? ` ...and ${fallbackMatched.length - preview.length} more`
          : ''
      console.warn(
        `${MSG.WARN} Fallback matched ${fallbackMatched.length} items: ${preview.join(', ')}${suffix}`,
      )
    }

    if (unresolved.length > 0) {
      console.warn(
        `${MSG.WARN} Missing webp for ${unresolved.length} commissions: ${unresolved.join(', ')}`,
      )
      if (strictMode) {
        throw new Error('IMAGE_IMPORT_STRICT=1 and unresolved images were found.')
      }
    }

    if (unused.length > 0) {
      if (cleanUnused) {
        for (const stem of unused) {
          const target = path.join(DIRS.webp, `${stem}.webp`)
          if (fs.existsSync(target)) {
            fs.unlinkSync(target)
            cleaned.push(stem)
          }

          const variants = variantStemsByBase.get(stem) ?? []
          for (const variantStem of variants) {
            const variantPath = path.join(DIRS.webp, `${variantStem}.webp`)
            if (!fs.existsSync(variantPath)) continue
            fs.unlinkSync(variantPath)
            cleaned.push(variantStem)
          }
        }
        console.warn(`${MSG.WARN} Removed ${cleaned.length} unused webp files`)
      } else {
        console.warn(
          `${MSG.WARN} Found ${unused.length} unused webp files. Run with IMAGE_CLEAN_UNUSED=1 to remove them.`,
        )
      }
    }
  } catch (error) {
    console.error(`${MSG.ERROR} ${(error as Error).message}`)
    throw error
  }

  console.log(
    `${MSG.SUCCESS} Image audit completed: mapped=${resolutions.length}, unresolved=${unresolved.length}, unused=${unused.length}`,
  )

  return {
    mappedCount: resolutions.length,
    unresolved,
    fallbackMatched,
    unused,
    cleaned,
  }
}

export const runImageWorkflow = async (options: ImageAuditOptions = {}) => {
  const conversion = await runImageConversion()
  const audit = runImageAudit(options)

  if (audit.unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Workflow completed with unresolved images (${audit.unresolved.length})`,
    )
  }

  console.log(
    `${MSG.SUCCESS} Image workflow completed: processed=${conversion.processed}, skipped=${conversion.skipped}, mapped=${audit.mappedCount}`,
  )
  if (audit.cleaned.length > 0) {
    console.log(`${MSG.SUCCESS} Removed unused webp files: ${audit.cleaned.length}`)
  }

  return { conversion, audit }
}
