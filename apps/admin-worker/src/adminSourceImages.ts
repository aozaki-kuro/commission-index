interface R2HttpMetadataLike {
  contentType?: string | null
}

export interface R2ObjectBodyLike {
  arrayBuffer: () => Promise<ArrayBuffer>
  httpMetadata?: R2HttpMetadataLike
}

export interface R2WriteBucketLike {
  delete: (key: string) => Promise<unknown>
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

function resolveUploadExtension(file: File): '.jpg' | '.png' | null {
  const mimeType = file.type.toLowerCase()
  if (mimeType === 'image/jpeg') {
    return '.jpg'
  }

  if (mimeType === 'image/png') {
    return '.png'
  }

  const fileName = file.name.toLowerCase()
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return '.jpg'
  }

  if (fileName.endsWith('.png')) {
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

  const extension = resolveUploadExtension(input.file)
  if (!extension) {
    throw new Error('Only JPG and PNG uploads are supported.')
  }

  const fileName = normalizeCommissionFileName(input.commissionFileName)
  const imageBuffer = await input.file.arrayBuffer()
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
