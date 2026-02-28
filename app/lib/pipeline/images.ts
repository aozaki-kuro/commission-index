import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { getCommissionData } from '#data/commissionData'

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
  SUCCESS: '\x1b[0m[\x1b[32m DONE \x1b[0m]',
  WARN: '\x1b[0m[\x1b[33m WARN \x1b[0m]',
} as const

const DIRS = {
  input: path.join(process.cwd(), 'data/images'),
  webp: path.join(process.cwd(), 'public/images/webp'),
}
const OUTPUT_FILE_PATH = path.join(process.cwd(), 'data/imageImports.ts')

const JPG_CONFIG = { quality: 95, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true }
const WEBP_CONFIG = { quality: 80 }
const SUPPORTED_EXTS = new Set(['.jpg', '.png'])

type ResolveMode = 'exact' | 'normalized' | 'same-date' | 'same-date-creator'

type Resolution = {
  fileName: string
  stem: string
  mode: ResolveMode
}

type GenerateImageImportsOptions = {
  strict?: boolean
  cleanUnused?: boolean
}

type GenerateImageImportsResult = {
  changed: boolean
  importCount: number
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

const convertImage = async (fileName: string) => {
  const { name, ext } = path.parse(fileName)
  const jpg = path.join(DIRS.input, `${name}.jpg`)
  const png = path.join(DIRS.input, `${name}.png`)
  const webp = path.join(DIRS.webp, `${name}.webp`)

  try {
    if (ext === '.jpg') {
      if (await fileExists(png)) return 'skipped'
      if (!(await needsUpdate(jpg, webp))) return 'skipped'
      await sharp(jpg).webp(WEBP_CONFIG).toFile(webp)
      return 'processed'
    }

    if (await needsUpdate(png, jpg)) {
      await sharp(png).jpeg(JPG_CONFIG).withMetadata().toFile(jpg)
      await fsp.unlink(png)
      return 'processed'
    }
    return 'skipped'
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

const getPartNumber = (value: string) => {
  const match = value.match(/\(part (\d+)\)/)
  return match ? parseInt(match[1], 10) : 0
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

const toAlphaIndex = (index: number) => {
  let n = index
  let out = ''
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  }
  return out
}

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

const createImportNames = (stems: string[]): Map<string, string> => {
  const groups = new Map<string, string[]>()
  for (const stem of stems) {
    const date = getDatePrefix(stem)
    const list = groups.get(date)
    if (list) list.push(stem)
    else groups.set(date, [stem])
  }

  const names = new Map<string, string>()
  const sortedDates = [...groups.keys()].sort((a, b) => a.localeCompare(b))
  for (const date of sortedDates) {
    const sameDateStems = (groups.get(date) ?? []).sort((a, b) => {
      const partDiff = getPartNumber(a) - getPartNumber(b)
      return partDiff !== 0 ? partDiff : a.localeCompare(b)
    })

    const useSuffix = sameDateStems.length > 1
    sameDateStems.forEach((stem, index) => {
      names.set(stem, `A${date}${useSuffix ? toAlphaIndex(index) : ''}`)
    })
  }

  return names
}

const writeFileIfChanged = (filePath: string, content: string) => {
  if (fs.existsSync(filePath)) {
    const previous = fs.readFileSync(filePath, 'utf-8')
    if (previous === content) return false
  }

  fs.writeFileSync(filePath, content, 'utf-8')
  return true
}

export const generateImageImports = (
  options: GenerateImageImportsOptions = {},
): GenerateImageImportsResult => {
  const strictMode = options.strict ?? process.env.IMAGE_IMPORT_STRICT === '1'
  const cleanUnused = options.cleanUnused ?? process.env.IMAGE_CLEAN_UNUSED === '1'
  const commissionFileNames = collectCommissionFileNames()
  const availableStems = loadAvailableWebpStems()
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
  const importNameMap = createImportNames(resolvedStems)

  const importLines = resolvedStems.map(stem => {
    const importName = importNameMap.get(stem)!
    const escapedStem = stem.replace(/'/g, "\\'")
    return `import ${importName} from '#images/webp/${escapedStem}.webp'`
  })

  const exportLines = resolutions
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map(item => {
      const importName = importNameMap.get(item.stem)!
      const escapedFileName = item.fileName.replace(/'/g, "\\'")
      return `  '${escapedFileName}': ${importName},`
    })

  const content = [
    '// This file is auto-generated by scripts/images.ts',
    '// !!! DO NOT EDIT !!!',
    ...importLines,
    '',
    'export const imageImports = {',
    ...exportLines,
    '}',
    '',
  ].join('\n')
  const fallbackMatched = resolutions.filter(item => item.mode !== 'exact')
  let changed = false

  try {
    changed = writeFileIfChanged(OUTPUT_FILE_PATH, content)
    if (changed) {
      console.log(
        `${MSG.SUCCESS} Generated imports: ${importLines.length} image files, ${resolutions.length} commission mappings`,
      )
    } else {
      console.log(
        `${MSG.SUCCESS} Import map unchanged: ${importLines.length} image files, ${resolutions.length} commission mappings`,
      )
    }

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
        throw new Error('IMAGE_IMPORT_STRICT=1 and unresolved image mappings were found.')
      }
    }

    if (unused.length > 0) {
      if (cleanUnused) {
        for (const stem of unused) {
          const target = path.join(DIRS.webp, `${stem}.webp`)
          if (!fs.existsSync(target)) continue
          fs.unlinkSync(target)
          cleaned.push(stem)
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

  return {
    changed,
    importCount: importLines.length,
    mappedCount: resolutions.length,
    unresolved,
    fallbackMatched,
    unused,
    cleaned,
  }
}

export const runImageWorkflow = async (options: GenerateImageImportsOptions = {}) => {
  const conversion = await runImageConversion()
  const imports = generateImageImports(options)

  if (imports.unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Workflow completed with unresolved images (${imports.unresolved.length})`,
    )
  }

  console.log(
    `${MSG.SUCCESS} Image workflow completed: processed=${conversion.processed}, skipped=${conversion.skipped}, imports=${imports.importCount}`,
  )
  if (imports.cleaned.length > 0) {
    console.log(`${MSG.SUCCESS} Removed unused webp files: ${imports.cleaned.length}`)
  }

  return { conversion, imports }
}

export const runImageImportWorkflow = (options: GenerateImageImportsOptions = {}) => {
  const imports = generateImageImports(options)
  if (imports.unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Import workflow completed with unresolved images (${imports.unresolved.length})`,
    )
  }

  console.log(
    `${MSG.SUCCESS} Import workflow completed: imports=${imports.importCount}, changed=${imports.changed ? 'yes' : 'no'}`,
  )
  if (imports.cleaned.length > 0) {
    console.log(`${MSG.SUCCESS} Removed unused webp files: ${imports.cleaned.length}`)
  }

  return imports
}
