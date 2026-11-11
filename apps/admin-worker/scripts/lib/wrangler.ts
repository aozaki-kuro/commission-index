import type { SpawnSyncReturns } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export interface WranglerResult {
  status: number | null
  stdout: string
  stderr: string
}

const adminWorkerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(adminWorkerRoot, '../..')
const localWranglerBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler')
const localWranglerCmdBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler.cmd')
const missingObjectPattern = /NoSuchKey|The specified key does not exist|not found/i
const maxDownloadAttempts = 3
const downloadFileWaitAttempts = 5
const downloadFileWaitMilliseconds = 50

// Call the repo-local binary: runner wrappers have broken `d1 execute --command` argument parsing before.
function getWranglerCommand() {
  return existsSync(localWranglerBinPath)
    ? localWranglerBinPath
    : (existsSync(localWranglerCmdBinPath)
        ? localWranglerCmdBinPath
        : 'wrangler')
}

export function runWrangler(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(getWranglerCommand(), args, {
    cwd: adminWorkerRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    // The whole D1 snapshot arrives on stdout as one JSON row; the 1 MiB default would truncate it.
    maxBuffer: 64 * 1024 * 1024,
  })
}

// `result.error` carries spawn failures and a maxBuffer overflow, where `status` alone can look like a plain failure.
export function runWranglerOrThrow(args: string[], label: string): string {
  const result = runWrangler(args)
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to ${label}.`)
  }

  return result.stdout
}

export function runWranglerAsync(args: string[]) {
  return new Promise<WranglerResult>((resolve, reject) => {
    const child = spawn(getWranglerCommand(), args, {
      cwd: adminWorkerRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
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

// Wrangler echoes the object key and output path, and real keys carry digits such as `20240421`; strip them so only
// wrangler's own not-found wording can classify a failure as a missing object (a bare `404` is never matched).
export function looksLikeMissingObject(message: string, echoedValues: string[] = []): boolean {
  const ownText = echoedValues.filter(Boolean).reduce((text, value) => text.replaceAll(value, ''), message)
  return missingObjectPattern.test(ownText)
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

export interface R2DownloadResult {
  message: string
  missing: boolean
  ok: boolean
}

// Retries transient failures; a not-found answer returns at once so callers can treat it as its own case.
export async function downloadR2Object({
  bucketName,
  objectKey,
  outputPath,
  wranglerConfigPath,
  onFailedAttempt,
}: {
  bucketName: string
  objectKey: string
  outputPath: string
  wranglerConfigPath: string
  onFailedAttempt?: (attempt: number, maxAttempts: number, message: string) => void
}): Promise<R2DownloadResult> {
  let message = ''

  for (let attempt = 1; attempt <= maxDownloadAttempts; attempt += 1) {
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
      return { message: '', missing: false, ok: true }
    }

    message = result.status === 0
      ? `Downloaded ${bucketName}/${objectKey} but file was not written to ${outputPath}.`
      : (result.stderr || result.stdout || '').trim()

    rmSync(outputPath, { force: true })

    if (result.status !== 0 && looksLikeMissingObject(message, [`${bucketName}/${objectKey}`, objectKey, outputPath])) {
      return { message, missing: true, ok: false }
    }

    onFailedAttempt?.(attempt, maxDownloadAttempts, message)
  }

  return { message, missing: false, ok: false }
}
