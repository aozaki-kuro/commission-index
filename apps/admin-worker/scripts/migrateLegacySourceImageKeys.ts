// d1 execute --remote --file 使用 D1 import API，更新期间数据库会短暂无法提供查询。
// 此窗口已被接受，但 admin 写入与导出会失败；操作前必须冻结写入并暂停导出。
// 回滚按完整计划整体校验；若任一图片已被后台合法替换，须人工核对计划后才能回滚其他行。
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildVersionedSourceImageKey, getSourceImageFileNameValidationError } from '../src/adminSourceImages'

export interface SourceImageRow {
  commissionId: number | null
  commissionFileName: string
  joinedFileName: string | null
  objectKey: string
  sha256: string
  byteSize: number
  mimeType: string
}

export interface MigrationEntry {
  commissionId: number
  commissionFileName: string
  oldKey: string
  newKey: string
  sha256: string
  byteSize: number
  mimeType: string
}

interface MigrationTarget {
  bucket: string
  binding: string
  wranglerConfigPath: string
}

export interface MigrationPlan {
  schemaVersion?: 2
  targetLayout?: 'flat-v1'
  metadata: MigrationTarget & { timestamp: string }
  entries: MigrationEntry[]
}

type Mode = 'dry-run' | 'execute' | 'rollback'
type Direction = 'forward' | 'rollback'
interface ParsedArgs {
  mode: Mode
  planPath: string
  binding?: string
  concurrency: number
}

interface RuntimeOptions {
  retryWait?: (milliseconds: number) => Promise<void>
}

type RetryWait = (milliseconds: number) => Promise<void>

interface CopyResult {
  copied: number
  skipped: number
  verified: number
  error?: string
}

const scriptPath = fileURLToPath(import.meta.url)
const adminWorkerRoot = path.resolve(path.dirname(scriptPath), '..')
const repoRoot = path.resolve(adminWorkerRoot, '../..')
const sha256Pattern = /^[\da-f]{64}$/
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
const missingObjectMessage = 'The specified key does not exist.'
const retryDelays = [500, 1500]
const maxAttempts = 3
const defaultPlanPath = path.join(repoRoot, '.backups/r2-flat-key-migration-20261003/plan.json')

// LEFT JOIN 保留空 ID 和悬空引用，否则损坏行会从计划中静默消失。
export const sourceImageRowsSql = `SELECT s.commission_id AS commissionId,
  s.commission_file_name AS commissionFileName, c.file_name AS joinedFileName,
  s.object_key AS objectKey, s.sha256 AS sha256, s.byte_size AS byteSize,
  s.mime_type AS mimeType
FROM source_images AS s LEFT JOIN commissions AS c ON c.id = s.commission_id
ORDER BY s.commission_id, s.commission_file_name`

function printHelp() {
  console.log(`Usage: pnpm exec tsx apps/admin-worker/scripts/migrateLegacySourceImageKeys.ts [options]
  --dry-run              Read production D1 and save a plan (default; no remote writes)
  --execute --plan <path> Copy/verify all objects, then apply guarded D1 updates
  --rollback --plan <path> Verify retained old objects, then apply reverse guarded D1 updates
  --plan <path>           Plan JSON (default: ${defaultPlanPath})
  --binding <binding>     Override D1 binding (default: FACT_SOURCE_DB_BINDING / ADMIN_WORKER_DB_BINDING / DB)
  --concurrency <1..8>    Concurrent object tasks (default: 4)
  --help                 Show this message
Environment: FACT_SOURCE_WRANGLER_CONFIG, FACT_SOURCE_IMAGES_BUCKET / ADMIN_WORKER_IMAGES_BUCKET`)
}

export function parseArgs(argv: string[]): ParsedArgs {
  let mode: Mode = 'dry-run'
  let explicitMode = false
  let planPath: string | undefined
  let binding: string | undefined
  let concurrency = 4
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (['--dry-run', '--execute', '--rollback'].includes(arg)) {
      if (explicitMode) {
        throw new Error('Choose exactly one mode.')
      }
      mode = arg.slice(2) as Mode
      explicitMode = true
      continue
    }
    if (!['--plan', '--binding', '--concurrency'].includes(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value.`)
    }
    index += 1
    if (arg === '--plan') {
      planPath = path.resolve(value)
    }
    else if (arg === '--binding') {
      binding = value
    }
    else {
      concurrency = Number(value)
      if (!/^\d+$/.test(value) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new Error('--concurrency must be an integer from 1 to 8.')
      }
    }
  }
  if (mode !== 'dry-run' && !planPath) {
    throw new Error(`${mode} requires --plan pointing to an existing dry-run plan.`)
  }
  return { mode, planPath: planPath ?? defaultPlanPath, binding, concurrency }
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1F || (code >= 0x7F && code <= 0x9F)
  })
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value || hasControlCharacters(value)) {
    throw new Error(`${label} must be nonempty text without control characters.`)
  }
}

export function sqlStringLiteral(value: string): string {
  requireText(value, 'SQL string literal')
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function assertImageMetadata(row: Pick<MigrationEntry, 'commissionFileName' | 'sha256' | 'byteSize' | 'mimeType'>) {
  requireText(row.commissionFileName, 'commissionFileName')
  requireText(row.mimeType, 'mimeType')
  if (getSourceImageFileNameValidationError(row.commissionFileName) || row.commissionFileName !== row.commissionFileName.trim()) {
    throw new Error(`Invalid commissionFileName: ${row.commissionFileName}`)
  }
  if (typeof row.sha256 !== 'string' || !sha256Pattern.test(row.sha256)) {
    throw new Error(`Invalid sha256: ${row.commissionFileName}`)
  }
  if (!Number.isSafeInteger(row.byteSize) || row.byteSize <= 0) {
    throw new Error(`Invalid byteSize: ${row.commissionFileName}`)
  }
}

function isUrlUnsafe(value: string) {
  return typeof value !== 'string' || /[#?%\\]/.test(value)
    || value.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

function assertUrlSafeRows(rows: Array<{ commissionFileName: string, objectKey: string }>) {
  // Wrangler 将 key 直接拼入 URL；双方都被重写时，下载校验也无法发现真实 key 不存在。
  const unsafe = rows.filter(row => isUrlUnsafe(row.commissionFileName) || isUrlUnsafe(row.objectKey))
  if (unsafe.length > 0) {
    throw new Error(`URL-unsafe source-image rows: ${unsafe.map(row => `${row.commissionFileName} (${row.objectKey})`).join(', ')}`)
  }
}

type KeyLayout = 'root' | 'folder' | 'flat'

function classifySourceImageKey(key: string, image: Pick<MigrationEntry, 'commissionFileName' | 'sha256' | 'mimeType'>): KeyLayout {
  requireText(key, 'objectKey')
  assertUrlSafeRows([{ commissionFileName: image.commissionFileName, objectKey: key }])
  const extension = path.posix.extname(key).toLowerCase()
  if (!['.jpg', '.png'].includes(extension)) {
    throw new Error(`Unsupported source-image extension (only .jpg/.png): ${key}`)
  }
  if (image.mimeType !== (extension === '.png' ? 'image/png' : 'image/jpeg')) {
    throw new Error(`Source-image mimeType does not match extension: ${key}`)
  }
  const segments = key.split('/')
  if (segments.length === 1) {
    return 'root'
  }
  if (segments[0] !== 'source-images' || ![2, 3].includes(segments.length)) {
    throw new Error(`Unknown source-image key layout: ${key}`)
  }
  if (segments.length === 3 && segments[1] !== image.commissionFileName) {
    throw new Error(`Source-image folder name disagrees with commissionFileName: ${key}`)
  }
  const basename = segments.at(-1)!
  const hash = basename.slice(0, 64)
  const uuid = basename.slice(65, -extension.length)
  if (!sha256Pattern.test(hash) || basename[64] !== '-' || !uuidPattern.test(uuid) || !basename.endsWith(extension)) {
    throw new Error(`Malformed source-image versioned key: ${key}`)
  }
  if (hash !== image.sha256) {
    throw new Error(`Source-image key sha256 disagrees with metadata: ${key}`)
  }
  return segments.length === 2 ? 'flat' : 'folder'
}

export function validateSourceRows(rows: SourceImageRow[]) {
  assertUrlSafeRows(rows)
  const ids = new Set<number>()
  const names = new Set<string>()
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.commissionId == null || !Number.isSafeInteger(row.commissionId) || row.commissionId <= 0) {
      throw new Error(`Invalid source_images commission_id: ${row.commissionFileName}`)
    }
    if (row.commissionFileName !== row.joinedFileName) {
      throw new Error(`source_images commission_file_name differs from commissions.file_name: ${row.commissionFileName}`)
    }
    if (ids.has(row.commissionId) || names.has(row.commissionFileName) || keys.has(row.objectKey)) {
      throw new Error(`Duplicate source_images commission_id, file_name, or object_key: ${row.commissionFileName}`)
    }
    ids.add(row.commissionId)
    names.add(row.commissionFileName)
    keys.add(row.objectKey)
    assertImageMetadata(row)
    classifySourceImageKey(row.objectKey, row)
  }
}

export function selectRowsNeedingMigration(rows: SourceImageRow[]) {
  validateSourceRows(rows)
  const rowsNeedingMigration = rows.filter(row => classifySourceImageKey(row.objectKey, row) !== 'flat')
  return { rowsNeedingMigration, skipped: rows.length - rowsNeedingMigration.length }
}

function planVersion(plan: MigrationPlan): 1 | 2 {
  // 字段位置固定在顶层；显式空值、半套字段或混放 metadata 均不能被当作旧计划。
  if ('schemaVersion' in plan.metadata || 'targetLayout' in plan.metadata) {
    throw new Error('Invalid migration plan version fields in metadata.')
  }
  if (!('schemaVersion' in plan) && !('targetLayout' in plan)) {
    return 1
  }
  if (plan.schemaVersion !== 2 || plan.targetLayout !== 'flat-v1') {
    throw new Error('Unsupported migration plan version or targetLayout; expected schemaVersion=2 and targetLayout=flat-v1.')
  }
  return 2
}

function assertForwardPlan(plan: MigrationPlan) {
  if (planVersion(plan) === 1) {
    throw new Error('Unversioned folder plans allow rollback only; create a fresh v2 flat plan.')
  }
}

function assertPlan(plan: MigrationPlan, target?: MigrationTarget) {
  if (!plan || typeof plan !== 'object' || !plan.metadata || typeof plan.metadata !== 'object' || !Array.isArray(plan.entries)) {
    throw new TypeError('Invalid migration plan shape.')
  }
  const version = planVersion(plan)
  requireText(plan.metadata.timestamp, 'Plan timestamp')
  if (Number.isNaN(Date.parse(plan.metadata.timestamp))) {
    throw new TypeError('Invalid plan timestamp.')
  }
  for (const field of ['bucket', 'binding', 'wranglerConfigPath'] as const) {
    requireText(plan.metadata[field], `Plan ${field}`)
    if (target && plan.metadata[field] !== target[field]) {
      throw new Error(`Plan target ${field} differs from current configuration.`)
    }
  }
  assertUrlSafeRows(plan.entries.map(entry => ({ commissionFileName: entry.commissionFileName, objectKey: entry.oldKey })))
  assertUrlSafeRows(plan.entries.map(entry => ({ commissionFileName: entry.commissionFileName, objectKey: entry.newKey })))
  const ids = new Set<number>()
  const newKeys = new Set<string>()
  const oldKeys = new Set<string>()
  const fileNames = new Set<string>()
  for (const entry of plan.entries) {
    if (!entry || !Number.isSafeInteger(entry.commissionId) || entry.commissionId <= 0) {
      throw new Error('Invalid plan commissionId.')
    }
    assertImageMetadata(entry)
    requireText(entry.oldKey, 'oldKey')
    requireText(entry.newKey, 'newKey')
    const oldLayout = classifySourceImageKey(entry.oldKey, entry)
    const newLayout = classifySourceImageKey(entry.newKey, entry)
    if (oldLayout === 'flat' || (version === 1 && oldLayout !== 'root')) {
      throw new Error(`Invalid plan oldKey layout: ${entry.oldKey}`)
    }
    const extension = path.posix.extname(entry.oldKey).toLowerCase()
    if (newLayout !== (version === 1 ? 'folder' : 'flat') || !entry.newKey.endsWith(extension)) {
      throw new Error(`Invalid plan newKey layout: ${entry.newKey}`)
    }
    if (version === 2 && oldLayout === 'folder' && path.posix.basename(entry.oldKey) !== path.posix.basename(entry.newKey)) {
      throw new Error(`Plan newKey must preserve the historical folder basename: ${entry.newKey}`)
    }
    if (ids.has(entry.commissionId) || newKeys.has(entry.newKey) || oldKeys.has(entry.oldKey) || fileNames.has(entry.commissionFileName)) {
      throw new Error(`Duplicate migration plan entry: ${entry.commissionFileName}`)
    }
    ids.add(entry.commissionId)
    newKeys.add(entry.newKey)
    oldKeys.add(entry.oldKey)
    fileNames.add(entry.commissionFileName)
  }
  if ([...newKeys].some(key => oldKeys.has(key))) {
    throw new Error('Migration plan newKey/oldKey overlap is forbidden.')
  }
}

export function validatePlanRows(plan: MigrationPlan, rows: SourceImageRow[], target: MigrationTarget) {
  assertPlan(plan, target)
  validateSourceRows(rows)
  const rowMap = new Map(rows.map(row => [row.commissionId, row]))
  for (const entry of plan.entries) {
    const row = rowMap.get(entry.commissionId)
    if (!row) {
      throw new Error(`Planned row missing from D1: ${entry.commissionFileName}`)
    }
    // 已完成的 newKey 也是合法状态；中断重跑时必须保留原计划的 UUID。
    if (row.commissionFileName !== entry.commissionFileName || ![entry.oldKey, entry.newKey].includes(row.objectKey)
      || row.sha256 !== entry.sha256 || row.byteSize !== entry.byteSize || row.mimeType !== entry.mimeType) {
      throw new Error(`Planned row changed in D1: ${entry.commissionFileName} (${row.objectKey})`)
    }
    for (const key of [entry.oldKey, entry.newKey]) {
      if (rows.some(other => other.commissionId !== entry.commissionId && other.objectKey === key)) {
        throw new Error(`Plan key is referenced by another D1 row: ${key}`)
      }
    }
  }
}

export function buildMigrationPlan(rows: SourceImageRow[], target: MigrationTarget, existing?: MigrationPlan): MigrationPlan {
  if (existing) {
    assertPlan(existing, target)
    assertForwardPlan(existing)
  }
  const { rowsNeedingMigration } = selectRowsNeedingMigration(rows)
  if (existing) {
    validatePlanRows(existing, rows, target)
    const plannedIds = new Set(existing.entries.map(entry => entry.commissionId))
    const missing = rowsNeedingMigration.filter(row => !plannedIds.has(row.commissionId!))
    if (missing.length > 0) {
      throw new Error(`Noncanonical rows missing from plan; create a separate plan: ${missing.map(row => row.commissionFileName).join(', ')}`)
    }
    return existing
  }
  const plan: MigrationPlan = {
    schemaVersion: 2,
    targetLayout: 'flat-v1',
    metadata: { timestamp: new Date().toISOString(), ...target },
    entries: rowsNeedingMigration.map(row => ({
      commissionId: row.commissionId!,
      commissionFileName: row.commissionFileName,
      oldKey: row.objectKey,
      newKey: classifySourceImageKey(row.objectKey, row) === 'folder'
        ? `source-images/${path.posix.basename(row.objectKey)}`
        : buildVersionedSourceImageKey(row.sha256, path.posix.extname(row.objectKey).toLowerCase() as '.jpg' | '.png'),
      sha256: row.sha256,
      byteSize: row.byteSize,
      mimeType: row.mimeType,
    })),
  }
  validatePlanRows(plan, rows, target)
  return plan
}

export function buildMigrationSql(plan: MigrationPlan, direction: Direction): string {
  assertPlan(plan)
  if (direction === 'forward') {
    assertForwardPlan(plan)
  }
  return `${plan.entries.map((entry) => {
    const from = direction === 'forward' ? entry.oldKey : entry.newKey
    const to = direction === 'forward' ? entry.newKey : entry.oldKey
    // 与正常持久化使用同一种数据库时间；额外身份条件避免并发元数据编辑被覆盖。
    return `UPDATE source_images SET object_key = ${sqlStringLiteral(to)}, updated_at = CURRENT_TIMESTAMP WHERE commission_id = ${entry.commissionId} AND object_key = ${sqlStringLiteral(from)} AND sha256 = ${sqlStringLiteral(entry.sha256)} AND commission_file_name = ${sqlStringLiteral(entry.commissionFileName)} AND byte_size = ${entry.byteSize} AND mime_type = ${sqlStringLiteral(entry.mimeType)};`
  }).join('\n')}\n`
}

async function resolveTarget(binding?: string): Promise<MigrationTarget> {
  const target = {
    bucket: process.env.FACT_SOURCE_IMAGES_BUCKET?.trim() || process.env.ADMIN_WORKER_IMAGES_BUCKET?.trim() || 'commission-index-images',
    binding: binding ?? (process.env.FACT_SOURCE_DB_BINDING?.trim() || process.env.ADMIN_WORKER_DB_BINDING?.trim() || 'DB'),
    wranglerConfigPath: path.resolve(adminWorkerRoot, process.env.FACT_SOURCE_WRANGLER_CONFIG?.trim() || './wrangler.jsonc'),
  }
  requireText(target.bucket, 'Bucket')
  requireText(target.binding, 'Binding')
  if (target.bucket.includes('/') || target.binding.startsWith('-')) {
    throw new Error('Invalid bucket or binding.')
  }
  // 复用已安装 Wrangler 的 JSONC 解析器，不另写去注释逻辑，也不连接远端资源。
  const { unstable_readConfig } = await import('wrangler')
  const config = unstable_readConfig({ config: target.wranglerConfigPath }, { hideWarnings: true }) as { r2_buckets: Array<{ binding: string, bucket_name?: string }> }
  const imageBuckets = config.r2_buckets.filter(bucket => bucket.binding === 'IMAGES')
  if (imageBuckets.length !== 1 || imageBuckets[0].bucket_name !== target.bucket) {
    throw new Error(`Resolved bucket ${target.bucket} must equal the Wrangler IMAGES binding bucket_name (${imageBuckets.map(bucket => bucket.bucket_name).join(', ') || '<missing>'}).`)
  }
  return target
}

function getWranglerCommand() {
  const bin = path.join(repoRoot, 'node_modules/.bin/wrangler')
  const cmd = `${bin}.cmd`
  return existsSync(bin) ? bin : existsSync(cmd) ? cmd : 'wrangler'
}

function runD1(args: string[]) {
  const result = spawnSync(getWranglerCommand(), args, { cwd: adminWorkerRoot, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || 'Wrangler D1 command failed.')
  }
  return result.stdout
}

function loadRows(target: MigrationTarget): SourceImageRow[] {
  const stdout = runD1(['d1', 'execute', target.binding, '--config', target.wranglerConfigPath, '--remote', '--json', '--command', sourceImageRowsSql])
  const payload = JSON.parse(stdout) as Array<{ success?: boolean, results?: SourceImageRow[] }>
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success === false || !Array.isArray(payload[0]?.results)) {
    throw new Error('Unexpected D1 JSON payload shape.')
  }
  return payload[0].results
}

function runR2(args: string[]) {
  return new Promise<{ status: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    // key 直接作为 argv 传给进程，日文、引号和空格不经过 shell 展开。
    const child = spawn(getWranglerCommand(), args, { cwd: adminWorkerRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' } })
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
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
}

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (existsSync(filePath)) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

async function downloadObject(target: MigrationTarget, key: string, filePath: string, retryWait: RetryWait): Promise<boolean> {
  let lastError = ''
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // 上一次失败的部分文件不能被误当作这次下载成功的字节。
    rmSync(filePath, { force: true })
    try {
      const result = await runR2(['r2', 'object', 'get', `${target.bucket}/${key}`, '--config', target.wranglerConfigPath, '--file', filePath, '--remote'])
      if (result.status === 0 && await waitForFile(filePath)) {
        return true
      }
      lastError = result.stderr || result.stdout || 'Downloaded file was not written.'
      if (result.status !== 0 && result.stderr.includes(missingObjectMessage)) {
        return false
      }
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < maxAttempts - 1) {
      await retryWait(retryDelays[attempt])
    }
  }
  throw new Error(`R2 download failed: ${key}: ${lastError}`)
}

function verifyFile(filePath: string, entry: MigrationEntry) {
  const bytes = readFileSync(filePath)
  if (bytes.length !== entry.byteSize || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    throw new Error(`Object verification failed: ${entry.commissionFileName}`)
  }
}

async function uploadObject(target: MigrationTarget, entry: MigrationEntry, filePath: string, retryWait: RetryWait) {
  let lastError = ''
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await runR2(['r2', 'object', 'put', `${target.bucket}/${entry.newKey}`, '--config', target.wranglerConfigPath, '--file', filePath, '--content-type', entry.mimeType, '--remote', '--force'])
      if (result.status === 0) {
        return
      }
      lastError = result.stderr || result.stdout || 'Wrangler R2 upload failed.'
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < maxAttempts - 1) {
      await retryWait(retryDelays[attempt])
    }
  }
  throw new Error(`R2 upload failed: ${entry.newKey}: ${lastError}`)
}

async function verifyEntry(entry: MigrationEntry, options: { target: MigrationTarget, directory: string, index: number, rollback: boolean, retryWait: RetryWait }): Promise<CopyResult> {
  const oldPath = path.join(options.directory, `${options.index}.old`)
  const newPath = path.join(options.directory, `${options.index}.new`)
  let copied = 0
  try {
    if (!options.rollback && await downloadObject(options.target, entry.newKey, newPath, options.retryWait)) {
      // 已存在但字节错误的目标不能覆盖；它可能已经被中断后的 D1 引用。
      verifyFile(newPath, entry)
      return { copied, skipped: 1, verified: 1 }
    }
    if (!await downloadObject(options.target, entry.oldKey, oldPath, options.retryWait)) {
      throw new Error(`Old object missing: ${entry.oldKey}`)
    }
    verifyFile(oldPath, entry)
    if (options.rollback) {
      return { copied, skipped: 1, verified: 1 }
    }
    await uploadObject(options.target, entry, oldPath, options.retryWait)
    copied = 1
    if (!await downloadObject(options.target, entry.newKey, newPath, options.retryWait)) {
      throw new Error(`Uploaded object missing: ${entry.newKey}`)
    }
    verifyFile(newPath, entry)
    return { copied, skipped: 0, verified: 1 }
  }
  catch (error) {
    return { copied, skipped: 0, verified: 0, error: `${entry.commissionFileName}: ${error instanceof Error ? error.message : String(error)}` }
  }
  finally {
    rmSync(oldPath, { force: true })
    rmSync(newPath, { force: true })
  }
}

async function verifyObjects(plan: MigrationPlan, concurrency: number, rollback: boolean, retryWait: RetryWait) {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-image-key-migration-'))
  const results: CopyResult[] = []
  let nextIndex = 0
  async function worker() {
    while (nextIndex < plan.entries.length) {
      const index = nextIndex++
      results[index] = await verifyEntry(plan.entries[index], { target: plan.metadata, directory, index, rollback, retryWait })
    }
  }
  try {
    // 等所有 worker 结束再清理，避免一处异常让其他下载失去临时目录。
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(concurrency, plan.entries.length) }, worker))
    const rejected = outcomes.find(outcome => outcome.status === 'rejected')
    if (rejected?.status === 'rejected') {
      throw rejected.reason
    }
    return results
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

function printSummary(options: { planPath: string, sqlBasePath: string, legacyRollback: boolean, binding: string, results: CopyResult[], updated: number, unchanged: number }) {
  const count = (field: 'copied' | 'skipped' | 'verified') => options.results.reduce((sum, result) => sum + result[field], 0)
  console.log(`copied=${count('copied')} | skipped=${count('skipped')} | verified=${count('verified')} | D1 updated=${options.updated} | unchanged=${options.unchanged}`)
  console.log(`Plan: ${options.planPath}${options.legacyRollback ? '' : `\nForward SQL: ${options.sqlBasePath}.forward.sql`}\nRollback SQL: ${options.sqlBasePath}.rollback.sql`)
  console.log(`Rollback command: pnpm exec tsx ${shellQuote(scriptPath)} --rollback --plan ${shellQuote(options.planPath)} --binding ${shellQuote(options.binding)}`)
}

function assertNoDrift(plan: MigrationPlan, initialRows: SourceImageRow[], currentRows: SourceImageRow[]) {
  const initialMap = new Map(initialRows.map(row => [row.commissionId, row]))
  const currentMap = new Map(currentRows.map(row => [row.commissionId, row]))
  const fields = ['commissionId', 'commissionFileName', 'joinedFileName', 'objectKey', 'sha256', 'byteSize', 'mimeType'] as const
  const drifted = plan.entries.filter((entry) => {
    const initial = initialMap.get(entry.commissionId)
    const current = currentMap.get(entry.commissionId)
    return !initial || !current || fields.some(field => initial[field] !== current[field])
  })
  if (drifted.length > 0) {
    for (const entry of drifted) {
      console.error(`D1 drift: ${entry.commissionId} ${entry.commissionFileName}; current=${JSON.stringify(currentMap.get(entry.commissionId) ?? null)}`)
    }
    throw new Error(`D1 drift detected in ${drifted.length} planned row(s); no D1 updates were submitted.`)
  }
  validatePlanRows(plan, currentRows, plan.metadata)
}

function readImportRowsWritten(stdout: string): number | undefined {
  try {
    // --json 不关闭 import spinner；只取独立 JSON 数组行之后的有效载荷。
    const jsonStart = stdout.search(/^\[/m)
    if (jsonStart < 0) {
      throw new Error('Missing JSON array.')
    }
    const payload = JSON.parse(stdout.slice(jsonStart)) as Array<{ success?: boolean, meta?: { rows_written?: number } }>
    const count = payload[0]?.meta?.rows_written
    if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success !== true || !Number.isSafeInteger(count) || count! < 0) {
      throw new Error('Invalid rows_written total.')
    }
    return count
  }
  catch {
    console.warn('D1 import statistics could not be parsed; original-plan read-back remains authoritative.')
    return undefined
  }
}

function verifyD1Result(plan: MigrationPlan, before: SourceImageRow[], after: SourceImageRow[], rollback: boolean) {
  let updated = 0
  let unchanged = 0
  const beforeMap = new Map(before.map(row => [row.commissionId, row]))
  const afterMap = new Map(after.map(row => [row.commissionId, row]))
  for (const entry of plan.entries) {
    const expected = rollback ? entry.oldKey : entry.newKey
    const row = afterMap.get(entry.commissionId)
    if (!row || row.objectKey !== expected || row.sha256 !== entry.sha256 || row.byteSize !== entry.byteSize
      || row.mimeType !== entry.mimeType || row.commissionFileName !== entry.commissionFileName || row.joinedFileName !== entry.commissionFileName) {
      unchanged += 1
      console.error(`Unchanged/unmigrated: ${entry.commissionId} ${entry.commissionFileName}; current key=${row?.objectKey ?? '<missing>'}`)
    }
    else if (beforeMap.get(entry.commissionId)?.objectKey !== expected) {
      updated += 1
    }
  }
  return { updated, unchanged }
}

export async function main(argv: string[] = process.argv.slice(2), runtime: RuntimeOptions = {}) {
  if (argv.length === 1 && argv[0] === '--help') {
    printHelp()
    return
  }
  const options = parseArgs(argv)
  const target = await resolveTarget(options.binding)
  const retryWait = runtime.retryWait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const existing = existsSync(options.planPath) ? JSON.parse(readFileSync(options.planPath, 'utf8')) as MigrationPlan : undefined
  if (options.mode !== 'dry-run' && !existing) {
    throw new Error('Execute/rollback requires an existing --plan file from dry-run.')
  }
  if (existing) {
    assertPlan(existing, target)
    if (options.mode !== 'rollback') {
      assertForwardPlan(existing)
    }
  }
  const before = loadRows(target)
  const rollback = options.mode === 'rollback'
  if (rollback) {
    validatePlanRows(existing!, before, target)
  }
  const plan = rollback ? existing! : buildMigrationPlan(before, target, existing)
  if (!existing) {
    mkdirSync(path.dirname(options.planPath), { recursive: true })
    // 排他创建防止两个规划进程互相覆盖 UUID；任何远端写入都在计划落盘之后。
    writeFileSync(options.planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }
  if (options.mode === 'dry-run') {
    console.log(`Dry-run: planned=${plan.entries.length} | already-migrated=${selectRowsNeedingMigration(before).skipped} | plan=${options.planPath}`)
    return
  }
  // v1 只允许回滚，不再生成可误执行的旧目录 forward SQL，也不覆盖第一次的执行记录。
  const legacyRollback = planVersion(plan) === 1
  const sqlBasePath = legacyRollback ? `${options.planPath}.v1-rollback-${crypto.randomUUID()}` : options.planPath
  // SQL 验证先于 R2 写入，避免非法计划在最后阶段才报错。
  const forwardSql = legacyRollback ? undefined : buildMigrationSql(plan, 'forward')
  const rollbackSql = buildMigrationSql(plan, 'rollback')
  const results = await verifyObjects(plan, options.concurrency, rollback, retryWait)
  const failures = results.filter(result => result.error)
  if (failures.length > 0) {
    console.log(`Object verification failed: copied=${results.reduce((sum, result) => sum + result.copied, 0)} | verified=${results.reduce((sum, result) => sum + result.verified, 0)} | no D1 updates submitted | plan=${options.planPath}`)
    throw new Error(`Object verification failed; D1 was not written:\n${failures.map(result => result.error).join('\n')}`)
  }
  const beforeMap = new Map(before.map(row => [row.commissionId, row]))
  // 原计划不改写；重跑只提交尚未完成的行，最终逐行校验仍覆盖完整计划。
  const pendingPlan = { ...plan, entries: plan.entries.filter(entry => beforeMap.get(entry.commissionId)?.objectKey !== (rollback ? entry.oldKey : entry.newKey)) }
  const direction = rollback ? 'rollback' : 'forward'
  const sqlPath = `${sqlBasePath}.pending.${direction}.sql`
  const pendingSql = buildMigrationSql(pendingPlan, direction)
  let writeError: unknown
  let rowsWritten: number | undefined = 0
  const currentRows = loadRows(target)
  // 校验与执行之间不再做 R2 操作；任何漂移整体中止，不能依赖条件更新的零行成功。
  assertNoDrift(plan, before, currentRows)
  if (forwardSql !== undefined) {
    writeFileSync(`${sqlBasePath}.forward.sql`, forwardSql, 'utf8')
  }
  writeFileSync(`${sqlBasePath}.rollback.sql`, rollbackSql, 'utf8')
  writeFileSync(sqlPath, pendingSql, 'utf8')
  if (pendingPlan.entries.length > 0) {
    try {
      const stdout = runD1(['d1', 'execute', target.binding, '--config', target.wranglerConfigPath, '--remote', '--yes', '--json', '--file', sqlPath])
      rowsWritten = readImportRowsWritten(stdout)
      // object_key 有 UNIQUE 索引，Cloudflare 的 rows_written 统计包含索引写入，因此它大于实际更新行数是正常的。
      if (rowsWritten === 0) {
        throw new Error('D1 rows_written=0 for a nonempty pending plan; review the write-freeze and guarded updates.')
      }
    }
    catch (error) {
      // 导入失败仍读回状态；不能仅凭 CLI 退出码猜测哪些条件更新已生效。
      writeError = error
    }
  }
  const after = loadRows(target)
  const counts = verifyD1Result(plan, currentRows, after, rollback)
  console.log(`D1 import: rows_written=${rowsWritten ?? '<unavailable>'} | planned updates=${pendingPlan.entries.length} | total plan=${plan.entries.length} (index writes inflate rows_written; original-plan read-back is authoritative)`)
  printSummary({ planPath: options.planPath, sqlBasePath, legacyRollback, binding: target.binding, results, ...counts })
  if (writeError) {
    throw writeError
  }
  if (counts.unchanged > 0) {
    throw new Error(`${counts.unchanged} planned row(s) remain unmigrated; concurrent edits were not forced.`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
