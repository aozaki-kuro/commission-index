/**
 * Deterministic placeholder source images for building the web visual fixture offline (CI's PR `astro build`).
 * The web registry globs the fixed `apps/web/generated/source-images/`, so the files must go there even though the
 * fixture JSON lives under `FACT_SOURCE_DIR`. That directory normally holds the real export, so writing is refused
 * unless it is absent or holds nothing but earlier placeholders.
 */
import type { GeneratedSourceImageManifestFile } from '@commission-index/domain'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const WIDTH = 1280
const HEIGHT = 1600
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([
    Buffer.from(type, 'ascii'),
    data,
  ])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Solid-colour 8-bit RGB PNG; the colour comes from the commission ID so each placeholder has distinct bytes. */
export function encodePlaceholderPng(seed: number) {
  const rgb = [(seed * 67) % 256, (seed * 131) % 256, (seed * 197) % 256]
  const row = Buffer.alloc(1 + WIDTH * 3)
  for (let x = 0; x < WIDTH; x++) {
    row[1 + x * 3] = rgb[0]
    row[2 + x * 3] = rgb[1]
    row[3 + x * 3] = rgb[2]
  }
  const raw = Buffer.concat(Array.from<Buffer>({ length: HEIGHT }).fill(row))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(WIDTH, 0)
  header.writeUInt32BE(HEIGHT, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function writePlaceholderImages(
  webRoot: string,
  commissions: ReadonlyArray<{ id: number, fileName: string }>,
): GeneratedSourceImageManifestFile[] {
  const generatedDir = path.join(webRoot, 'generated')
  const imagesDir = path.join(generatedDir, 'source-images')
  const placeholderNames = new Set(commissions.map(commission => `${commission.fileName}.png`))
  if (existsSync(generatedDir)) {
    const foreignEntry = readdirSync(generatedDir).some(name => name !== 'source-images')
      || (existsSync(imagesDir) && readdirSync(imagesDir).some(name => !placeholderNames.has(name)))
    if (foreignEntry) {
      throw new Error(`Refusing to write placeholder images into ${imagesDir}: ${generatedDir} holds other files (likely a real export).`)
    }
  }

  mkdirSync(imagesDir, { recursive: true })
  return commissions.map((commission) => {
    const name = `${commission.fileName}.png`
    const bytes = encodePlaceholderPng(commission.id)
    writeFileSync(path.join(imagesDir, name), bytes)
    return {
      commissionId: commission.id,
      commissionFileName: commission.fileName,
      objectKey: `placeholder/${name}`,
      relativePath: path.posix.join('source-images', name),
      mimeType: 'image/png',
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  })
}
