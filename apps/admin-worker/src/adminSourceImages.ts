interface R2HttpMetadataLike {
  contentType?: string | null
}

export interface R2ObjectBodyLike {
  arrayBuffer: () => Promise<ArrayBuffer>
  httpMetadata?: R2HttpMetadataLike
}

export interface R2WriteBucketLike {
  // Single-key delete for replacing an object; the array form clears every source image of one character during cascade delete.
  delete: (keys: string | string[]) => Promise<unknown>
  get: (key: string) => Promise<R2ObjectBodyLike | null>
  put: (
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>
}

export interface SavedSourceImage {
  byteSize: number
  commissionFileName: string
  mimeType: string
  objectKey: string
  sha256: string
  targetKey: string
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), part => part.toString(16).padStart(2, '0'))
    .join('')
}

async function hashArrayBuffer(buffer: ArrayBuffer) {
  return toHex(await crypto.subtle.digest('SHA-256', buffer))
}

function normalizeCommissionFileName(rawValue: string) {
  return rawValue.trim()
}

function getSourceImageContentType(extension: '.jpg' | '.png') {
  if (extension === '.png') {
    return 'image/png'
  }

  return 'image/jpeg'
}

// The crop output is 1280x525; the largest live image is under 1 MB and a worst-case PNG is ~2.7 MB.
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024

// Magic bytes decide the type: a renamed WebP/HEIC would otherwise be stored and break the publish build.
function sniffImageExtension(bytes: Uint8Array): '.jpg' | '.png' | null {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return '.jpg'
  }

  const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    return '.png'
  }

  return null
}

export function getSourceImageFileNameValidationError(rawValue: string) {
  const key = rawValue.trim()
  if (!key || key.length > 180) {
    return 'Image asset key is required and must be 180 characters or fewer.'
  }
  if (key.includes('/') || key.includes('\\') || key.includes('..') || [...key].some(char => char.charCodeAt(0) <= 0x1F)) {
    return 'Image asset key contains forbidden path characters.'
  }
  return null
}

export function buildVersionedSourceImageKey(
  sha256: string,
  extension: '.jpg' | '.png',
) {
  return `source-images/${sha256}-${crypto.randomUUID()}${extension}`
}

export function getSourceImageMimeType(key: string, object?: R2ObjectBodyLike | null) {
  const contentType = object?.httpMetadata?.contentType?.trim()
  if (contentType) {
    return contentType
  }

  if (key.toLowerCase().endsWith('.png')) {
    return 'image/png'
  }

  return 'image/jpeg'
}

export function resolveImageWriteBucket(value: unknown): R2WriteBucketLike | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    delete?: unknown
    get?: unknown
    put?: unknown
  }

  if (
    typeof candidate.get !== 'function'
    || typeof candidate.put !== 'function'
    || typeof candidate.delete !== 'function'
  ) {
    return null
  }

  return value as R2WriteBucketLike
}

export async function saveSourceImageToBucket(
  bucket: R2WriteBucketLike,
  input: {
    commissionFileName: string
    file: File
  },
): Promise<SavedSourceImage> {
  const validationError = getSourceImageFileNameValidationError(input.commissionFileName)
  if (validationError) {
    throw new Error(validationError)
  }

  if (input.file.size <= 0) {
    throw new Error('Uploaded image is empty.')
  }

  // Checked before arrayBuffer() so an oversized upload is never read into memory.
  if (input.file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`Uploaded image must be ${MAX_SOURCE_IMAGE_BYTES / 1024 / 1024} MiB or smaller.`)
  }

  const fileName = normalizeCommissionFileName(input.commissionFileName)
  const imageBuffer = await input.file.arrayBuffer()
  const extension = sniffImageExtension(new Uint8Array(imageBuffer, 0, Math.min(imageBuffer.byteLength, 8)))
  if (!extension) {
    throw new Error('Only JPG and PNG uploads are supported.')
  }
  const sha256 = await hashArrayBuffer(imageBuffer)
  const targetKey = buildVersionedSourceImageKey(sha256, extension)
  const mimeType = getSourceImageContentType(extension)

  await bucket.put(targetKey, imageBuffer, {
    httpMetadata: {
      contentType: mimeType,
    },
  })

  return {
    byteSize: imageBuffer.byteLength,
    commissionFileName: fileName,
    mimeType,
    objectKey: targetKey,
    sha256,
    targetKey,
  }
}

export async function removeSourceImageObject(bucket: R2WriteBucketLike, key: string) {
  await bucket.delete(key)
}
