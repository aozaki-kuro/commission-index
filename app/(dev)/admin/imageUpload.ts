import fs from 'node:fs/promises'
import path from 'node:path'
import {
  getCommissionFileNameValidationError,
  normalizeCommissionFileName,
} from './commissionFileName'

const SOURCE_IMAGES_DIR = path.join(process.cwd(), 'data', 'images')

const resolveUploadExtension = (file: File): '.jpg' | '.png' | null => {
  const mimeType = file.type.toLowerCase()
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'

  const ext = path.extname(file.name).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return '.jpg'
  if (ext === '.png') return '.png'
  return null
}

const validateCommissionFileName = (rawValue: string): string => {
  const validationError = getCommissionFileNameValidationError(rawValue)
  if (validationError) throw new Error(validationError)
  return normalizeCommissionFileName(rawValue)
}

const ensureTargetNotExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath)
    throw new Error(`Source image already exists: ${path.basename(targetPath)}`)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return
    throw error
  }
}

export interface SavedSourceImage {
  targetPath: string
  targetFileName: string
}

export const saveUploadedSourceImage = async (input: {
  commissionFileName: string
  file: File
}): Promise<SavedSourceImage> => {
  const fileName = validateCommissionFileName(input.commissionFileName)
  if (input.file.size <= 0) {
    throw new Error('Uploaded image is empty.')
  }

  const ext = resolveUploadExtension(input.file)
  if (!ext) {
    throw new Error('Only JPG and PNG uploads are supported.')
  }

  await fs.mkdir(SOURCE_IMAGES_DIR, { recursive: true })
  const targetFileName = `${fileName}${ext}`
  const targetPath = path.join(SOURCE_IMAGES_DIR, targetFileName)
  await ensureTargetNotExists(targetPath)

  const bytes = new Uint8Array(await input.file.arrayBuffer())
  await fs.writeFile(targetPath, bytes)

  return { targetPath, targetFileName }
}

export const removeSourceImageFile = async (targetPath: string) => {
  try {
    await fs.unlink(targetPath)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw error
  }
}
