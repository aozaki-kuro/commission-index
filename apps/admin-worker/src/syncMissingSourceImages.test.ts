import type { GeneratedSourceImageManifest } from '@commission-index/domain'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncSourceImages } from '../scripts/syncMissingSourceImages'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const directories: string[] = []

function seedManifest(objectKey: string, bytes: string) {
  const generatedRoot = mkdtempSync(path.join(tmpdir(), 'sync-images-test-'))
  directories.push(generatedRoot)
  const manifest: GeneratedSourceImageManifest = {
    meta: {
      schemaVersion: 3,
      source: 'remote-admin-fact-source',
      exportedAt: '2026-01-01T00:00:00Z',
      revision: 'r',
      databaseBinding: 'DB',
      imagesBucket: 'bucket',
    },
    files: [
      {
        commissionId: 1,
        commissionFileName: '20240421',
        objectKey,
        relativePath: 'source-images/20240421.jpg',
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
    missing: [],
  }
  mkdirSync(path.join(generatedRoot, 'fact-source'), { recursive: true })
  writeFileSync(path.join(generatedRoot, 'fact-source/source-images-manifest.json'), JSON.stringify(manifest))
  return {
    generatedRoot,
    outputPath: path.join(generatedRoot, 'source-images/20240421.jpg'),
  }
}

function mockWrangler(handle: (args: string[], child: EventEmitter & { stderr: PassThrough }) => void) {
  vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    })
    queueMicrotask(() => handle(args, child))
    return child
  }) as unknown as typeof spawn)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('source image sync', () => {
  it('writes a download that matches the manifest', async () => {
    const { generatedRoot, outputPath } = seedManifest('source-images/a.jpg', 'image')
    mockWrangler((args, child) => {
      writeFileSync(args[args.indexOf('--file') + 1]!, 'image')
      child.emit('close', 0)
    })

    expect(await syncSourceImages({ generatedRoot, bucketName: 'bucket' })).toEqual({ failed: 0, stale: 1 })
    expect(readFileSync(outputPath, 'utf8')).toBe('image')
  })

  it('fails the item and writes nothing when the downloaded bytes do not match the manifest', async () => {
    const { generatedRoot, outputPath } = seedManifest('source-images/a.jpg', 'image')
    mockWrangler((args, child) => {
      writeFileSync(args[args.indexOf('--file') + 1]!, 'other bytes')
      child.emit('close', 0)
    })

    expect(await syncSourceImages({ generatedRoot, bucketName: 'bucket' })).toEqual({ failed: 1, stale: 1 })
    expect(existsSync(outputPath)).toBe(false)
  })

  it('retries a transient failure whose message contains "404" only inside the key and path', async () => {
    const { generatedRoot } = seedManifest('source-images/20240421-404.jpg', 'image')
    mockWrangler((args, child) => {
      child.stderr.write(`Downloading "${args[3]}" to "${args[args.indexOf('--file') + 1]}"\n✘ [ERROR] fetch failed: ECONNRESET`)
      child.emit('close', 1)
    })

    expect(await syncSourceImages({ generatedRoot, bucketName: 'bucket' })).toEqual({ failed: 1, stale: 1 })
    expect(spawn).toHaveBeenCalledTimes(3)
  })

  it('stops retrying once wrangler reports the key does not exist', async () => {
    const { generatedRoot } = seedManifest('source-images/gone.jpg', 'image')
    mockWrangler((_args, child) => {
      child.stderr.write('✘ [ERROR] The specified key does not exist.')
      child.emit('close', 1)
    })

    expect(await syncSourceImages({ generatedRoot, bucketName: 'bucket' })).toEqual({ failed: 1, stale: 1 })
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
