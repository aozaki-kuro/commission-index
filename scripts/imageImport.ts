import fs from 'node:fs'
import path from 'node:path'

import { getCommissionData } from '../data/commissionData'

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
  SUCCESS: '\x1b[0m[\x1b[32m DONE \x1b[0m]',
  WARN: '\x1b[0m[\x1b[33m WARN \x1b[0m]',
} as const

const OUTPUT_FILE_PATH = path.join(process.cwd(), 'data/imageImports.ts')
const WEBP_DIR_PATH = path.join(process.cwd(), 'public/images/webp')

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

function getPartNumber(fileName: string): number {
  const match = fileName.match(/\(part (\d+)\)/)
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
  if (!fs.existsSync(WEBP_DIR_PATH)) return []

  return fs
    .readdirSync(WEBP_DIR_PATH, { withFileTypes: true })
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
    sameDateStems.forEach((stem, i) => {
      names.set(stem, `A${date}${useSuffix ? toAlphaIndex(i) : ''}`)
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
    '// This file is auto-generated by scripts/imageImport.ts',
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
          const target = path.join(WEBP_DIR_PATH, `${stem}.webp`)
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
  } catch (err) {
    console.error(`${MSG.ERROR} ${(err as Error).message}`)
    throw err
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

if (process.argv[1] && path.basename(process.argv[1]).startsWith('imageImport')) {
  try {
    generateImageImports()
  } catch {
    process.exit(1)
  }
}
