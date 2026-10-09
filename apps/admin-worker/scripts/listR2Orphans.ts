import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Offline inventory of R2 source-image objects that no D1 source_images row references.
// Dry-run by default; deletion needs --delete, which only removes keys already proven unreferenced.
// Wrangler cannot list R2 objects, so listing goes through the Cloudflare REST API.

interface Options {
  bucketName: string
  databaseBinding: string
  deleteOrphans: boolean
  usePreview: boolean
}

interface R2ListItem {
  key: string
  size: number
}

interface R2ListResponse {
  result?: R2ListItem[]
  result_info?: {
    cursor?: string | null
    is_truncated?: boolean
  }
  success?: boolean
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const adminWorkerRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(adminWorkerRoot, '../..')
const localWranglerBinPath = path.resolve(repoRoot, 'node_modules/.bin/wrangler')
const wranglerConfigPath = path.resolve(adminWorkerRoot, './wrangler.jsonc')
const sourceImagePrefix = 'source-images/'
const cloudflareApiBase = 'https://api.cloudflare.com/client/v4'

function printHelp() {
  console.log(`
Usage: pnpm -C apps/admin-worker run r2:list-orphans [-- options]

Lists R2 objects under source-images/ that no D1 source_images.object_key references.

Required env: CLOUDFLARE_API_TOKEN (R2 read; plus write when using --delete), CLOUDFLARE_ACCOUNT_ID.

Options:
  --bucket <name>   R2 bucket (default: FACT_SOURCE_IMAGES_BUCKET, then commission-index-images)
  --preview         Read preview D1 instead of production D1
  --delete          Delete the orphan objects (per key). Without it, the script only reports.
  --help            Show this message
`.trim())
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    bucketName: process.env.FACT_SOURCE_IMAGES_BUCKET?.trim()
      || process.env.ADMIN_WORKER_IMAGES_BUCKET?.trim()
      || 'commission-index-images',
    databaseBinding: process.env.FACT_SOURCE_DB_BINDING?.trim()
      || process.env.ADMIN_WORKER_DB_BINDING?.trim()
      || 'DB',
    deleteOrphans: false,
    usePreview: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
    if (arg === '--preview') {
      options.usePreview = true
      continue
    }
    if (arg === '--delete') {
      options.deleteOrphans = true
      continue
    }
    if (arg === '--bucket') {
      const value = argv[index + 1]?.trim()
      if (!value) {
        throw new Error('--bucket requires a value.')
      }
      options.bucketName = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`)
  }
  return value
}

function encodeObjectKey(key: string) {
  // Keys keep their slashes as path separators; each segment is escaped on its own.
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

async function listR2ObjectKeys(bucketName: string, accountId: string, token: string) {
  const keys: string[] = []
  let cursor: string | null = null

  do {
    const url = new URL(`${cloudflareApiBase}/accounts/${accountId}/r2/buckets/${bucketName}/objects`)
    url.searchParams.set('prefix', sourceImagePrefix)
    url.searchParams.set('per_page', '1000')
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) {
      throw new Error(`R2 list failed with HTTP ${response.status}.`)
    }

    const body = await response.json() as R2ListResponse
    for (const item of body.result ?? []) {
      keys.push(item.key)
    }

    cursor = body.result_info?.is_truncated ? (body.result_info.cursor ?? null) : null
  } while (cursor)

  return keys
}

function listReferencedObjectKeys(databaseBinding: string, usePreview: boolean) {
  const args = [
    'd1',
    'execute',
    databaseBinding,
    '--config',
    wranglerConfigPath,
    '--json',
    '--remote',
    '--command',
    'SELECT object_key AS objectKey FROM source_images',
  ]
  if (usePreview) {
    args.splice(6, 0, '--preview')
  }

  const wranglerBin = existsSync(localWranglerBinPath) ? localWranglerBinPath : 'wrangler'
  const result = spawnSync(wranglerBin, args, {
    cwd: adminWorkerRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'D1 query failed.')
  }

  const payload = JSON.parse(result.stdout) as Array<{ results?: Array<{ objectKey: string }> }>
  return new Set((payload[0]?.results ?? []).map(row => row.objectKey))
}

async function deleteR2Object(bucketName: string, key: string, accountId: string, token: string) {
  const response = await fetch(
    `${cloudflareApiBase}/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeObjectKey(key)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    throw new Error(`R2 delete of ${key} failed with HTTP ${response.status}.`)
  }
}

export async function main(argv: string[] = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')

  const referenced = listReferencedObjectKeys(options.databaseBinding, options.usePreview)
  const stored = await listR2ObjectKeys(options.bucketName, accountId, token)
  const orphans = stored.filter(key => !referenced.has(key)).toSorted()

  console.log(`bucket=${options.bucketName} stored=${stored.length} referenced=${referenced.size} orphans=${orphans.length}`)
  for (const key of orphans) {
    console.log(`orphan ${key}`)
  }

  if (!options.deleteOrphans) {
    console.log('Dry run: no objects were deleted. Re-run with --delete to remove the orphans above.')
    return
  }

  let failed = 0
  for (const key of orphans) {
    try {
      await deleteR2Object(options.bucketName, key, accountId, token)
      console.log(`deleted ${key}`)
    }
    catch (error) {
      failed += 1
      console.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (failed > 0) {
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
