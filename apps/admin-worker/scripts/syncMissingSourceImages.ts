/**
 * Fast pre-dev image sync: reads the existing manifest and downloads missing or stale images from R2.
 * Unlike exportWebFactSource, this never queries D1 — just checks local files against the manifest.
 * If all images are present locally and match their expected sha256/byteSize, exits with no network calls.
 */
import type {
  GeneratedSourceImageManifest,
  GeneratedSourceImageManifestFile,
} from '@commission-index/domain'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { mapWithConcurrency, resolveDownloadConcurrency } from './lib/concurrency'
import { downloadR2Object } from './lib/wrangler'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminWorkerRoot = path.resolve(scriptDir, '..')
const configuredWranglerConfigPath = process.env.FACT_SOURCE_WRANGLER_CONFIG?.trim()
const wranglerConfigPath = path.resolve(
  adminWorkerRoot,
  configuredWranglerConfigPath && configuredWranglerConfigPath.length > 0
    ? configuredWranglerConfigPath
    : './wrangler.jsonc',
)
const defaultBucketName
  = process.env.FACT_SOURCE_IMAGES_BUCKET?.trim()
    || process.env.ADMIN_WORKER_IMAGES_BUCKET?.trim()
    || 'commission-index-images'
const defaultGeneratedRoot = path.resolve(adminWorkerRoot, '../web/generated')

async function downloadImage(bucketName: string, objectKey: string, outputPath: string) {
  return downloadR2Object({
    bucketName,
    objectKey,
    outputPath,
    wranglerConfigPath,
    onFailedAttempt: (attempt, maxAttempts, message) => {
      if (attempt < maxAttempts) {
        console.error(`  Retry ${attempt}/${maxAttempts} for ${objectKey}: ${message}`)
      }
      else {
        console.error(`  ✗ Download failed after ${maxAttempts} attempts: ${objectKey}\n    ${message}`)
      }
    },
  })
}

function hashFile(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// 本地落盘位置由 manifest 的 relativePath 决定，与导出器写入的路径一致；
// objectKey 是 R2 对象身份：新 key 只有 source-images/ 分类前缀，历史 key 也可能含作品目录；不能当作本地路径。
function resolveLocalImagePath(generatedRoot: string, file: Pick<GeneratedSourceImageManifestFile, 'relativePath'>) {
  return path.join(generatedRoot, file.relativePath)
}

function isStale(
  filePath: string,
  expected: { byteSize: number | null, sha256: string },
): boolean {
  if (!existsSync(filePath)) {
    return true
  }

  if (expected.byteSize !== null && statSync(filePath).size !== expected.byteSize) {
    return true
  }

  return hashFile(filePath) !== expected.sha256
}

export async function syncSourceImages({ generatedRoot, bucketName }: { generatedRoot: string, bucketName: string }) {
  // ==================== 读取 manifest ====================
  const manifestPath = path.resolve(generatedRoot, 'fact-source/source-images-manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}\nRun \`pnpm run fact-source:export\` first to generate it.`)
  }

  let manifest: GeneratedSourceImageManifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as GeneratedSourceImageManifest
  }
  catch (e) {
    throw new Error(`Failed to parse manifest: ${e}`)
  }

  const { files } = manifest

  // ==================== 检查：哪些图片缺失或内容已变更 ====================
  const staleFiles = files.filter(file =>
    isStale(resolveLocalImagePath(generatedRoot, file), file),
  )

  if (staleFiles.length === 0) {
    console.log(`Source images OK (${files.length}/${files.length} present and up to date)`)
    return { failed: 0, stale: 0 }
  }

  const downloadConcurrency = resolveDownloadConcurrency()
  const resolvedDownloadConcurrency = Math.min(downloadConcurrency, staleFiles.length)
  console.log(`Downloading ${staleFiles.length} missing/stale source image(s) from R2 (concurrency=${resolvedDownloadConcurrency})...`)
  mkdirSync(path.resolve(generatedRoot, 'source-images'), { recursive: true })

  const results = await mapWithConcurrency(staleFiles, downloadConcurrency, async (file, index) => {
    const outputPath = resolveLocalImagePath(generatedRoot, file)
    const tempPath = `${outputPath}.download`
    rmSync(tempPath, { force: true })

    console.log(`  ↓ [${index + 1}/${staleFiles.length}] ${file.objectKey}`)
    const result = await downloadImage(bucketName, file.objectKey, tempPath)
    if (result.ok && isStale(tempPath, file)) {
      rmSync(tempPath, { force: true })
      console.error(`  ✗ Downloaded bytes do not match the manifest sha256/byteSize: ${file.objectKey}`)
      return false
    }
    if (result.ok) {
      writeFileSync(outputPath, readFileSync(tempPath))
      rmSync(tempPath, { force: true })
      console.log(`  ✓ [${index + 1}/${staleFiles.length}] ${file.objectKey}`)
      return true
    }

    rmSync(tempPath, { force: true })
    if (result.missing) {
      console.error(`  ✗ Not found in R2: ${file.objectKey}`)
    }
    return false
  })

  const failCount = results.filter(result => !result).length
  const downloaded = staleFiles.length - failCount
  console.log(`Downloaded ${downloaded}/${staleFiles.length} images`)
  return { failed: failCount, stale: staleFiles.length }
}

async function main() {
  const { failed } = await syncSourceImages({ generatedRoot: defaultGeneratedRoot, bucketName: defaultBucketName })
  if (failed > 0) {
    console.error(`${failed} image(s) failed. Run \`pnpm run fact-source:export\` to retry.`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error
      ? error.message
      : String(error))
    process.exit(1)
  })
}
