export interface CommissionFileNameParts {
  date: string
  year: string
  creator: string
}

const COMMISSION_FILE_NAME_PATTERN = /^\d{8}(?:_.+)?$/
const COMMISSION_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)$/i
const COMMISSION_FORBIDDEN_CHARACTER_PATTERN = /[<>:"/\\|?*]/

export function getCommissionFileNameValidationError(rawValue: string) {
  const fileName = rawValue.trim()
  if (!fileName) {
    return 'File name is required.'
  }

  if (COMMISSION_IMAGE_EXTENSION_PATTERN.test(fileName)) {
    return 'File name must not include an image extension.'
  }

  if (!COMMISSION_FILE_NAME_PATTERN.test(fileName)) {
    return 'File name must start with YYYYMMDD, optionally followed by "_creator".'
  }

  if (
    COMMISSION_FORBIDDEN_CHARACTER_PATTERN.test(fileName)
    || fileName.includes('..')
    || [...fileName].some(character => character.charCodeAt(0) <= 0x1F)
  ) {
    return 'File name contains forbidden path characters.'
  }

  return null
}

export function parseCommissionFileName(fileName: string): CommissionFileNameParts {
  const date = fileName.slice(0, 8)
  const year = date.slice(0, 4)
  const creator = fileName.slice(9)
  return { date, year, creator }
}
