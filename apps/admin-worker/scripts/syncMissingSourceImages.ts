/**
 * Fast pre-dev image sync: reads the existing manifest and downloads missing or stale images from R2.
 * Unlike exportWebFactSource, this never queries D1 — just checks local files against the manifest.
 * If all images are present locally and match their expected sha256/byteSize, exits with no network calls.
 */
import type {
  GeneratedSourceImageManifest,
  GeneratedSourceImageManifestFile,
} from '@commission-index/domain'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminWorkerRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(adminWorkerRoot, '../..')
const configuredWranglerConfigPath = process.env.FACT_SOURCE_WRANGLER_CONFIG?.trim()
const wranglerConfigPath = path.resolve(
  adminWorkerRoot,
  configuredWranglerConfigPath && configuredWranglerConfigPath.length > 0
    ? configuredWranglerConfigPath
    : './wrangler.jsonc',
)
const localWranglerBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler')
const localWranglerCmdBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler.cmd')
const defaultBucketName
  = process.env.FACT_SOURCE_IMAGES_BUCKET?.trim()
    || process.env.ADMIN_WORKER_IMAGES_BUCKET?.trim()
    || 'commission-index-images'
const webRoot = path.resolve(adminWorkerRoot, '../web')
const generatedRoot = path.resolve(webRoot, 'generated')
const manifestPath = path.resolve(generatedRoot, 'fact-source/source-images-manifest.json')
const outputImagesDir = path.resolve(generatedRoot, 'source-images')
const maxDownloadAttempts = 3
const downloadFileWaitAttempts = 5
const downloadFileWaitMilliseconds = 50
const defaultDownloadConcurrency = 8
const maxDownloadConcurrency = 16
const missingObjectPattern = /NoSuchKey|The specified key does not exist|not found|404/i

function getWranglerCommand() {
  return existsSync(localWranglerBinPath)
    ? localWranglerBinPath
    : (existsSync(localWranglerCmdBinPath) ? localWranglerCmdBinPath : 'wrangler')
}

function runWranglerAsync(args: string[]) {
  return new Promise<{ status: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn(getWranglerCommand(), args, {
      cwd: adminWorkerRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (status) => {
      resolve({ status, stdout, stderr })
    })
  })
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < downloadFileWaitAttempts; attempt += 1) {
    if (existsSync(filePath)) {
      return true
    }

    await sleep(downloadFileWaitMilliseconds)
  }

  return false
}

function resolveDownloadConcurrency() {
  const rawValue = process.env.FACT_SOURCE_DOWNLOAD_CONCURRENCY?.trim()
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return defaultDownloadConcurrency
  }

  return Math.min(parsedValue, maxDownloadConcurrency)
}

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
  const results: TResult[] = []
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) {
        return
      }

      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  const workerSlots = Array.from({ length: workerCount }, (_, index) => index)
  await Promise.all(workerSlots.map(() => runWorker()))
  return results
}

async function downloadImage(bucketName: string, objectKey: string, outputPath: string) {
  for (let attempt = 1; attempt <= maxDownloadAttempts; attempt++) {
    const result = await runWranglerAsync([
      'r2',
      'object',
      'get',
      `${bucketName}/${objectKey}`,
      '--config',
      wranglerConfigPath,
      '--file',
      outputPath,
      '--remote',
    ])

    if (result.status === 0 && await waitForFile(outputPath)) {
      return { message: '', ok: true }
    }

    const message = result.status === 0
      ? `Downloaded ${bucketName}/${objectKey} but file was not written to ${outputPath}.`
      : (result.stderr || result.stdout || '').trim()
    rmSync(outputPath, { force: true })

    if (missingObjectPattern.test(message)) {
      return { message, missing: true, ok: false }
    }

    if (attempt < maxDownloadAttempts) {
      console.error(`  Retry ${attempt}/${maxDownloadAttempts} for ${objectKey}: ${message}`)
    }
    else {
      console.error(`  ✗ Download failed after ${maxDownloadAttempts} attempts: ${objectKey}\n    ${message}`)
    }
  }

  return { message: '', missing: false, ok: false }
}

function hashFile(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// 本地落盘位置由 manifest 的 relativePath 决定，与导出器写入的路径一致；
// objectKey 是 R2 对象身份：新 key 只有 source-images/ 分类前缀，历史 key 也可能含作品目录；不能当作本地路径。
function resolveLocalImagePath(file: Pick<GeneratedSourceImageManifestFile, 'relativePath'>) {
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

async function main() {
  // ==================== 读取 manifest ====================
  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found at ${manifestPath}`)
    console.error('Run `pnpm run fact-source:export` first to generate it.')
    process.exit(1)
  }

  let manifest: GeneratedSourceImageManifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as GeneratedSourceImageManifest
  }
  catch (e) {
    console.error(`Failed to parse manifest: ${e}`)
    process.exit(1)
  }

  const { files } = manifest

  // ==================== 检查：哪些图片缺失或内容已变更 ====================
  const staleFiles = files.filter(file =>
    isStale(resolveLocalImagePath(file), file),
  )

  if (staleFiles.length === 0) {
    console.log(`Source images OK (${files.length}/${files.length} present and up to date)`)
    return
  }

  const downloadConcurrency = resolveDownloadConcurrency()
  const resolvedDownloadConcurrency = Math.min(downloadConcurrency, staleFiles.length)
  console.log(`Downloading ${staleFiles.length} missing/stale source image(s) from R2 (concurrency=${resolvedDownloadConcurrency})...`)
  mkdirSync(outputImagesDir, { recursive: true })

  const results = await mapWithConcurrency(staleFiles, downloadConcurrency, async (file, index) => {
    const outputPath = resolveLocalImagePath(file)
    const tempPath = `${outputPath}.download`
    rmSync(tempPath, { force: true })

    console.log(`  ↓ [${index + 1}/${staleFiles.length}] ${file.objectKey}`)
    const result = await downloadImage(defaultBucketName, file.objectKey, tempPath)
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

  if (failCount > 0) {
    console.error(`${failCount} image(s) failed. Run \`pnpm run fact-source:export\` to retry.`)
    process.exit(1)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
