import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { getCommissionData } from '../data/commissionData'

const MSG = {
  ERROR: '\x1b[0m[\x1b[31m ERROR \x1b[0m]',
  SUCCESS: '\x1b[0m[\x1b[32m DONE \x1b[0m]',
  WARN: '\x1b[0m[\x1b[33m WARN \x1b[0m]',
} as const

const DIRS = {
  input: path.join(process.cwd(), 'public/images'),
  webp: path.join(process.cwd(), 'public/images/webp'),
}

const JPG_CONFIG = { quality: 95, progressive: true, chromaSubsampling: '4:4:4', mozjpeg: true }
const WEBP_CONFIG = { quality: 80 }
const SUPPORTED_EXTS = new Set(['.jpg', '.png'])
type ResolveMode = 'exact' | 'normalized' | 'same-date' | 'same-date-creator'

type Resolution = {
  fileName: string
  stem: string
  mode: ResolveMode
}

async function fileExists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function needsUpdate(src: string, dest: string) {
  try {
    const [s, d] = await Promise.all([fs.stat(src), fs.stat(dest)])
    return d.mtime < s.mtime
  } catch {
    return true
  }
}

const normalizeStem = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, '')
    .replace(/[\s'"`’“”()（）[\]{}]/g, '')

const getDatePrefix = (value: string) => value.slice(0, 8)
const getCreatorName = (value: string) => (value.length > 9 ? value.slice(9) : '')

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

const collectEligibleStems = (availableStems: string[]) => {
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

  const fileNames = collectCommissionFileNames()
  const resolutions: Resolution[] = []
  const unresolved: string[] = []
  for (const fileName of fileNames) {
    const resolved = resolveStem(fileName, exactSet, normalizedMap, dateMap)
    if (resolved) resolutions.push(resolved)
    else unresolved.push(fileName)
  }

  return {
    eligible: new Set(resolutions.map(item => item.stem)),
    fallbackMatched: resolutions.filter(item => item.mode !== 'exact'),
    unresolved,
  }
}

async function convertImage(file: string) {
  const { name, ext } = path.parse(file)
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
      await fs.unlink(png)
      return 'processed'
    }
    return 'skipped'
  } catch {
    return 'failed'
  }
}

export const runImageConversion = async () => {
  await fs.mkdir(DIRS.webp, { recursive: true })
  const files = await fs.readdir(DIRS.input)
  const sourceFiles = files.filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()))
  const sourceStems = [...new Set(sourceFiles.map(file => path.parse(file).name))]
  const { eligible, fallbackMatched, unresolved } = collectEligibleStems(sourceStems)
  const stats = { processed: 0, skipped: 0, ignored: 0, failed: [] as string[] }

  await Promise.all(
    sourceFiles
      .filter(file => {
        const isEligible = eligible.has(path.parse(file).name)
        if (!isEligible) stats.ignored++
        return isEligible
      })
      .map(async f => {
        const res = await convertImage(f)
        if (res === 'processed') stats.processed++
        else if (res === 'skipped') stats.skipped++
        else stats.failed.push(f)
      }),
  )

  const total = stats.processed + stats.skipped + stats.failed.length + stats.ignored
  if (fallbackMatched.length > 0) {
    const preview = fallbackMatched
      .slice(0, 10)
      .map(item => `${item.fileName} -> ${item.stem} (${item.mode})`)
      .join(', ')
    const more = fallbackMatched.length > 10 ? ` ...and ${fallbackMatched.length - 10} more` : ''
    console.warn(
      `${MSG.WARN} Conversion fallback matched ${fallbackMatched.length} items: ${preview}${more}`,
    )
  }
  if (unresolved.length > 0) {
    console.warn(
      `${MSG.WARN} Skipped ${unresolved.length} commissions with unresolved source images: ${unresolved.join(', ')}`,
    )
  }
  if (stats.failed.length) {
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

if (process.argv[1] && path.basename(process.argv[1]).startsWith('convert')) {
  runImageConversion().catch(err => {
    console.error(`${MSG.ERROR} ${err}`)
    process.exit(1)
  })
}
