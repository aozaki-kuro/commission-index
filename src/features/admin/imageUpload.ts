import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  getCommissionFileNameValidationError,
  normalizeCommissionFileName,
} from './commissionFileName'

const SOURCE_IMAGES_DIR = path.join(process.cwd(), 'data', 'images')

function resolveUploadExtension(file: File): '.jpg' | '.png' | null {
  const mimeType = file.type.toLowerCase()
  if (mimeType === 'image/jpeg')
    return '.jpg'
  if (mimeType === 'image/png')
    return '.png'

  const ext = path.extname(file.name).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg')
    return '.jpg'
  if (ext === '.png')
    return '.png'
  return null
}

function validateCommissionFileName(rawValue: string): string {
  const validationError = getCommissionFileNameValidationError(rawValue)
  if (validationError)
    throw new Error(validationError)
  return normalizeCommissionFileName(rawValue)
}

async function ensureTargetNotExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    throw new Error(`Source image already exists: ${path.basename(targetPath)}`)
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT')
      return
    throw error
  }
}

export interface SavedSourceImage {
  targetPath: string
  targetFileName: string
}

export interface ResolvedSourceImagePath {
  filePath: string
  mimeType: 'image/jpeg' | 'image/png'
}

async function resolveTargetFromInput(input: { commissionFileName: string, file: File }) {
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

  return { ext, targetPath, targetFileName }
}

async function writeUploadedSourceImage(input: {
  commissionFileName: string
  file: File
  overwrite: boolean
}): Promise<SavedSourceImage> {
  const { ext, targetPath, targetFileName } = await resolveTargetFromInput(input)
  if (!input.overwrite) {
    await ensureTargetNotExists(targetPath)
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer())
  await fs.writeFile(targetPath, bytes)

  if (input.overwrite) {
    const normalizedStem = path.parse(targetFileName).name
    const alternateExt = ext === '.jpg' ? '.png' : '.jpg'
    const alternatePath = path.join(SOURCE_IMAGES_DIR, `${normalizedStem}${alternateExt}`)
    await removeSourceImageFile(alternatePath)
  }

  return { targetPath, targetFileName }
}

export async function saveUploadedSourceImage(input: {
  commissionFileName: string
  file: File
}): Promise<SavedSourceImage> {
  return writeUploadedSourceImage({
    ...input,
    overwrite: false,
  })
}

export async function replaceUploadedSourceImage(input: {
  commissionFileName: string
  file: File
}): Promise<SavedSourceImage> {
  return writeUploadedSourceImage({
    ...input,
    overwrite: true,
  })
}

export async function removeSourceImageFile(targetPath: string) {
  try {
    await fs.unlink(targetPath)
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'ENOENT')
      throw error
  }
}

export async function resolveSourceImagePathByStem(rawCommissionFileName: string): Promise<ResolvedSourceImagePath | null> {
  const fileName = validateCommissionFileName(rawCommissionFileName)
  const candidates: ResolvedSourceImagePath[] = [
    { filePath: path.join(SOURCE_IMAGES_DIR, `${fileName}.jpg`), mimeType: 'image/jpeg' },
    { filePath: path.join(SOURCE_IMAGES_DIR, `${fileName}.jpeg`), mimeType: 'image/jpeg' },
    { filePath: path.join(SOURCE_IMAGES_DIR, `${fileName}.png`), mimeType: 'image/png' },
  ]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate.filePath)
      return candidate
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'ENOENT')
        throw error
    }
  }

  return null
}
