const VALID_FILE_NAME = /^\d{8}(?:_.+)?$/
const FILE_NAME_WITH_EXTENSION = /\.(?:jpe?g|png|webp)$/i
const FORBIDDEN_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/

export const normalizeCommissionFileName = (rawValue: string) => rawValue.trim()

export const getCommissionFileNameValidationError = (rawValue: string): string | null => {
  const fileName = normalizeCommissionFileName(rawValue)

  if (!fileName) {
    return 'File name is required.'
  }
  if (FILE_NAME_WITH_EXTENSION.test(fileName)) {
    return 'File name must not include an image extension.'
  }
  if (!VALID_FILE_NAME.test(fileName)) {
    return 'File name must start with YYYYMMDD, optionally followed by "_creator".'
  }
  if (FORBIDDEN_FILE_NAME_CHARS.test(fileName) || fileName.includes('..')) {
    return 'File name contains forbidden path characters.'
  }

  return null
}

export const isValidCommissionFileName = (rawValue: string) =>
  getCommissionFileNameValidationError(rawValue) === null
