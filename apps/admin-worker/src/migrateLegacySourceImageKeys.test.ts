import type { SourceImageRow } from '../scripts/migrateLegacySourceImageKeys'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMigrationPlan, buildMigrationSql, main as migrationMain, parseArgs, selectRowsNeedingMigration, sourceImageRowsSql, sqlStringLiteral, validatePlanRows, validateSourceRows } from '../scripts/migrateLegacySourceImageKeys'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(), spawn: vi.fn() }))

const retryWait = vi.fn(async (_milliseconds: number) => {})
const main = (argv: string[]) => migrationMain(argv, { retryWait })
const logs: string[] = []
const directories: string[] = []
const bytes = Buffer.from('verified image bytes')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const target = { bucket: 'commission-index-images', binding: 'DB', wranglerConfigPath: path.resolve(import.meta.dirname, '../wrangler.jsonc') }
const uuid = '12345678-1234-4123-8123-123456789abc'
const basename = `${sha256}-${uuid}.jpg`
const flatKey = `source-images/${basename}`
const folderKey = `source-images/${row().commissionFileName}/${basename}`

function directory() {
  const value = mkdtempSync(path.join(tmpdir(), 'image-key-migration-test-'))
  directories.push(value)
  return value
}

function row(overrides: Partial<SourceImageRow> = {}): SourceImageRow {
  return { commissionId: 1, commissionFileName: '20240405_七市\'s (preview)', joinedFileName: '20240405_七市\'s (preview)', objectKey: '20240405_七市\'s (preview).JPG', sha256, byteSize: bytes.length, mimeType: 'image/jpeg', ...overrides }
}

function queryResult(rows: SourceImageRow[]) {
  return { status: 0, stdout: JSON.stringify([{ success: true, results: rows }]), stderr: '', pid: 0, signal: null, output: [] }
}

function importResult(rowsWritten: number) {
  return { ...queryResult([]), stdout: JSON.stringify([{ success: true, results: [{ 'Total queries executed': rowsWritten, 'Rows written': rowsWritten }], meta: { rows_written: rowsWritten } }]) }
}

function savePlan(rows = [row()]) {
  const plan = buildMigrationPlan(rows, target)
  const planPath = path.join(directory(), 'plan.json')
  writeFileSync(planPath, JSON.stringify(plan))
  return { plan, planPath }
}

function mockR2(objects: Map<string, Buffer>, corruptPut = false) {
  vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    queueMicrotask(() => {
      const key = args[3].slice(`${target.bucket}/`.length)
      const filePath = args[args.indexOf('--file') + 1]
      if (args[2] === 'put') {
        objects.set(key, corruptPut ? Buffer.from('wrong') : readFileSync(filePath))
        child.emit('close', 0)
      }
      else if (objects.has(key)) {
        writeFileSync(filePath, objects.get(key)!)
        child.emit('close', 0)
      }
      else {
        child.stderr.write('✘ [ERROR] The specified key does not exist.\n')
        child.emit('close', 1)
      }
    })
    return child
  }) as unknown as typeof spawn)
}

beforeEach(() => {
  vi.resetAllMocks()
  logs.length = 0
  vi.spyOn(console, 'log').mockImplementation(message => logs.push(String(message)))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  retryWait.mockImplementation(async () => {})
  vi.stubEnv('FACT_SOURCE_WRANGLER_CONFIG', target.wranglerConfigPath)
  vi.stubEnv('FACT_SOURCE_DB_BINDING', target.binding)
  vi.stubEnv('FACT_SOURCE_IMAGES_BUCKET', target.bucket)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const value of directories.splice(0)) {
    rmSync(value, { recursive: true, force: true })
  }
})

describe('legacy source-image key migration', () => {
  it('defaults to dry-run and requires a saved plan for write modes', () => {
    expect(parseArgs([]).mode).toBe('dry-run')
    expect(parseArgs([]).concurrency).toBe(4)
    expect(parseArgs([]).planPath).toBe(path.resolve(import.meta.dirname, '../../..', '.backups/r2-flat-key-migration-20261003/plan.json'))
    expect(() => parseArgs(['--execute'])).toThrow('--plan')
    expect(() => parseArgs(['--rollback'])).toThrow('--plan')
    expect(() => parseArgs(['--execute', '--dry-run', '--plan', 'p.json'])).toThrow('mode')
    for (const value of ['0', '9', '4.5', '4junk']) {
      expect(() => parseArgs(['--concurrency', value])).toThrow('concurrency')
    }
    expect(parseArgs(['--concurrency', '8']).concurrency).toBe(8)
  })

  it('selects roots and valid historical folders while skipping only canonical flat rows', () => {
    const root = row()
    const folder = row({ commissionId: 2, commissionFileName: 'folder', joinedFileName: 'folder', objectKey: `source-images/folder/${basename}` })
    const flat = row({ commissionId: 3, commissionFileName: 'flat', joinedFileName: 'flat', objectKey: `source-images/${sha256}-87654321-1234-4123-8123-123456789abc.jpg` })
    expect(selectRowsNeedingMigration([root, folder, flat])).toEqual({ rowsNeedingMigration: [root, folder], skipped: 1 })
    const plan = buildMigrationPlan([root, folder, flat], target)
    expect(plan.schemaVersion).toBe(2)
    expect(plan.targetLayout).toBe('flat-v1')
    expect(plan.entries.map(entry => entry.commissionId)).toEqual([1, 2])
    expect(plan.entries[1].newKey).toBe(flatKey)
  })

  it('flattens a historical folder preserving its SHA, UUID, extension, and bytes metadata', () => {
    const plan = buildMigrationPlan([row({ objectKey: folderKey })], target)
    expect(plan.entries[0]).toEqual({
      commissionId: 1,
      commissionFileName: row().commissionFileName,
      oldKey: folderKey,
      newKey: flatKey,
      sha256,
      byteSize: bytes.length,
      mimeType: 'image/jpeg',
    })
  })

  it('rejects invalid associations and metadata even on canonical rows', () => {
    expect(() => validateSourceRows([row({ commissionId: null, objectKey: flatKey })])).toThrow('commission_id')
    expect(() => validateSourceRows([row({ joinedFileName: 'different', objectKey: flatKey })])).toThrow('file_name')
    expect(() => validateSourceRows([row({ joinedFileName: null, objectKey: flatKey })])).toThrow('file_name')
    expect(() => selectRowsNeedingMigration([row({ byteSize: 0, objectKey: flatKey })])).toThrow('byteSize')
    expect(() => validateSourceRows([row(), row({ objectKey: flatKey })])).toThrow('Duplicate')
    expect(() => validateSourceRows([row(), row({ commissionId: 2, objectKey: flatKey })])).toThrow('Duplicate')
    expect(() => validateSourceRows([row(), row({ commissionId: 2, commissionFileName: 'other', joinedFileName: 'other' })])).toThrow('Duplicate')
  })

  it('lowercases root extensions and rejects unsupported extensions and MIME disagreements', () => {
    const plan = buildMigrationPlan([row()], target)
    expect(plan.entries[0].newKey).toMatch(new RegExp(`^source-images/${sha256}-[\\da-f-]+\\.jpg$`))
    for (const key of ['first.jpeg', 'second.webp']) {
      expect(() => buildMigrationPlan([row({ objectKey: key })], target)).toThrow('extension')
    }
    expect(() => buildMigrationPlan([row({ mimeType: 'image/png' })], target)).toThrow('mimeType')
    expect(() => buildMigrationPlan([row({ objectKey: flatKey, mimeType: 'image/png' })], target)).toThrow('mimeType')
  })

  it.each([
    `source-images/${'a'.repeat(64)}-${uuid}.jpg`,
    `source-images/${row().commissionFileName}/${'a'.repeat(64)}-${uuid}.jpg`,
    `source-images/wrong-name/${basename}`,
    `source-images/${sha256}-not-a-uuid.jpg`,
    `source-images/${sha256}-12345678-1234-5123-8123-123456789abc.jpg`,
    `source-images/${sha256}-${uuid}.JPG`,
    `source-images/${row().commissionFileName}/hash.jpg`,
    `unknown/${basename}`,
    `source-images/extra/folder/${basename}`,
  ])('rejects malformed or contradictory self-identified keys: %s', (objectKey) => {
    expect(() => buildMigrationPlan([row({ objectKey })], target)).toThrow(/layout|sha256|name|key/i)
  })

  it('rejects duplicate flattening destinations and destinations already referenced in D1', () => {
    const first = row({ objectKey: folderKey })
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: `source-images/second/${basename}` })
    expect(() => buildMigrationPlan([first, second], target)).toThrow(/collision|Duplicate/i)
    expect(() => buildMigrationPlan([first, { ...second, objectKey: flatKey }], target)).toThrow('another D1 row')
  })

  it('reuses saved UUIDs after partial D1 updates without adding a new plan entry', () => {
    const first = row()
    const second = row({ commissionId: 2, commissionFileName: '20240406_七市', joinedFileName: '20240406_七市', objectKey: '20240406_七市.png', mimeType: 'image/png' })
    const plan = buildMigrationPlan([first, second], target)
    expect(buildMigrationPlan([first, { ...second, objectKey: plan.entries[1].newKey }], target, plan)).toEqual(plan)
    expect(() => buildMigrationPlan([first, second, row({ commissionId: 3, commissionFileName: 'new', joinedFileName: 'new', objectKey: 'new.jpg' })], target, plan)).toThrow('missing from plan')
  })

  it('rejects changed keys, hashes, missing rows, target changes, and edited plan destinations', () => {
    const plan = buildMigrationPlan([row()], target)
    expect(() => validatePlanRows(plan, [row({ objectKey: 'changed.jpg' })], target)).toThrow('changed')
    expect(() => validatePlanRows(plan, [row({ sha256: 'a'.repeat(64) })], target)).toThrow('changed')
    expect(() => validatePlanRows(plan, [], target)).toThrow('missing')
    expect(() => validatePlanRows(plan, [row()], { ...target, bucket: 'other' })).toThrow('target')
    expect(() => validatePlanRows({ ...plan, entries: [{ ...plan.entries[0], newKey: 'victim.jpg' }] }, [row()], target)).toThrow('newKey')
    expect(() => validatePlanRows({ ...plan, entries: [...plan.entries, plan.entries[0]] }, [row()], target)).toThrow('Duplicate')
  })

  it.each([
    { schemaVersion: 3, targetLayout: 'flat-v1' },
    { schemaVersion: 2, targetLayout: 'folder-v1' },
    { schemaVersion: 2 },
    { targetLayout: 'flat-v1' },
    { schemaVersion: null, targetLayout: null },
  ])('rejects unknown and mixed plan versions before any D1 or R2 calls: %j', async (version) => {
    const { plan, planPath } = savePlan()
    const { schemaVersion: _schemaVersion, targetLayout: _targetLayout, ...base } = plan
    writeFileSync(planPath, JSON.stringify({ ...base, ...version }))
    await expect(main(['--rollback', '--plan', planPath])).rejects.toThrow(/version|layout/i)
    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects version fields mixed between metadata and top level', () => {
    const plan = buildMigrationPlan([row()], target)
    const mixed = { ...plan, metadata: { ...plan.metadata, schemaVersion: 2, targetLayout: 'flat-v1' } }
    expect(() => validatePlanRows(mixed, [row()], target)).toThrow(/version|layout/i)
  })

  it('rejects canonical or contradictory flat old keys and cross-entry target/source overlap', () => {
    const plan = buildMigrationPlan([row()], target)
    for (const oldKey of [flatKey, `source-images/${'a'.repeat(64)}-${uuid}.jpg`]) {
      expect(() => validatePlanRows({ ...plan, entries: [{ ...plan.entries[0], oldKey }] }, [row({ objectKey: oldKey })], target)).toThrow(/oldKey|sha256/i)
    }
    const second = { ...plan.entries[0], commissionId: 2, commissionFileName: 'second', oldKey: plan.entries[0].newKey, newKey: flatKey }
    expect(() => validatePlanRows({ ...plan, entries: [...plan.entries, second] }, [row(), row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: second.oldKey })], target)).toThrow(/overlap|oldKey/i)
  })

  it.each(['--dry-run', '--execute'])('refuses to reuse an unversioned folder plan in %s mode without changing it', async (mode) => {
    const { plan, planPath } = savePlan()
    const legacy = { metadata: plan.metadata, entries: [{ ...plan.entries[0], newKey: folderKey }] }
    const original = JSON.stringify(legacy)
    writeFileSync(planPath, original)
    await expect(main([mode, '--plan', planPath])).rejects.toThrow('rollback only')
    expect(readFileSync(planPath, 'utf8')).toBe(original)
    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rolls back a strict unversioned folder plan through main amid unrelated canonical flat rows', async () => {
    const { plan, planPath } = savePlan()
    const legacy = { metadata: plan.metadata, entries: [{ ...plan.entries[0], newKey: folderKey }] }
    const original = JSON.stringify(legacy)
    writeFileSync(planPath, original)
    const historicalFiles = ['forward.sql', 'rollback.sql', 'pending.forward.sql', 'pending.rollback.sql']
    for (const suffix of historicalFiles) {
      writeFileSync(`${planPath}.${suffix}`, `first execution ${suffix}`)
    }
    const flat = row({ commissionId: 2, commissionFileName: 'other', joinedFileName: 'other', objectKey: flatKey })
    const before = [row({ objectKey: folderKey }), flat]
    mockR2(new Map([[row().objectKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(importResult(2)).mockReturnValueOnce(queryResult([row(), flat]))
    await main(['--rollback', '--plan', planPath])
    expect(readFileSync(planPath, 'utf8')).toBe(original)
    for (const suffix of historicalFiles) {
      expect(readFileSync(`${planPath}.${suffix}`, 'utf8')).toBe(`first execution ${suffix}`)
    }
    const writeArgs = vi.mocked(spawnSync).mock.calls[2][1] as string[]
    const sqlPath = writeArgs[writeArgs.indexOf('--file') + 1]
    expect(sqlPath).toMatch(/\.v1-rollback-[\da-f-]+\.pending\.rollback\.sql$/)
    expect(readFileSync(sqlPath, 'utf8')).toContain(sqlStringLiteral(folderKey))
    expect(logs).toContainEqual(expect.stringContaining('D1 updated=1'))
    expect(vi.mocked(spawn).mock.calls.map(call => (call[1] as string[])[2])).toEqual(['get'])
    expect(() => buildMigrationSql(legacy, 'forward')).toThrow('rollback only')
  })

  it.each([
    flatKey,
    `source-images/wrong-name/${basename}`,
    `source-images/${row().commissionFileName}/${'a'.repeat(64)}-${uuid}.jpg`,
    `source-images/${row().commissionFileName}/${sha256}-not-a-uuid.jpg`,
  ])('strictly rejects edited v1 folder destinations on rollback: %s', async (newKey) => {
    const { plan, planPath } = savePlan()
    writeFileSync(planPath, JSON.stringify({ metadata: plan.metadata, entries: [{ ...plan.entries[0], newKey }] }))
    await expect(main(['--rollback', '--plan', planPath])).rejects.toThrow(/newKey|layout|sha256|name|key/i)
    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('v1 rollback still rejects missing, unrelated, or changed planned associations', () => {
    const fresh = buildMigrationPlan([row()], target)
    const legacy = { metadata: fresh.metadata, entries: [{ ...fresh.entries[0], newKey: folderKey }] }
    expect(() => validatePlanRows(legacy, [], target)).toThrow('missing')
    expect(() => validatePlanRows(legacy, [row({ objectKey: flatKey })], target)).toThrow('changed')
    expect(() => validatePlanRows(legacy, [row({ objectKey: folderKey, joinedFileName: null })], target)).toThrow('file_name')
    expect(() => validatePlanRows(legacy, [row({ objectKey: folderKey, byteSize: bytes.length + 1 })], target)).toThrow('changed')
  })

  it('folder v2 plans reject destination UUID edits instead of losing the preserved basename', () => {
    const plan = buildMigrationPlan([row({ objectKey: folderKey })], target)
    const edited = { ...plan, entries: [{ ...plan.entries[0], newKey: `source-images/${sha256}-87654321-1234-4123-8123-123456789abc.jpg` }] }
    expect(() => validatePlanRows(edited, [row({ objectKey: folderKey })], target)).toThrow('basename')
  })

  it('quotes apostrophes while preserving Japanese, spaces, and parentheses and rejects controls', () => {
    expect(sqlStringLiteral('七市\'s (preview).jpg')).toBe('\'七市\'\'s (preview).jpg\'')
    for (const value of ['line\nfeed', 'nul\0', 'tab\t', 'delete\u007F', 'control\u0085']) {
      expect(() => sqlStringLiteral(value)).toThrow('control')
    }
  })

  it('forward and rollback SQL preserve bytes metadata and guard concurrent edits in real SQLite', () => {
    const plan = buildMigrationPlan([row()], target)
    const entry = plan.entries[0]
    const database = new DatabaseSync(':memory:')
    try {
      database.exec('CREATE TABLE source_images (commission_id INTEGER, commission_file_name TEXT, object_key TEXT UNIQUE, sha256 TEXT, byte_size INTEGER, mime_type TEXT, updated_at TEXT)')
      database.prepare('INSERT INTO source_images VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.commissionId, entry.commissionFileName, entry.oldKey, entry.sha256, entry.byteSize, entry.mimeType, 'old timestamp')
      database.exec(buildMigrationSql(plan, 'forward'))
      expect(database.prepare('SELECT object_key, updated_at, sha256, byte_size, mime_type FROM source_images').get()).toEqual({ object_key: entry.newKey, updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} /), sha256, byte_size: bytes.length, mime_type: 'image/jpeg' })
      database.exec(buildMigrationSql(plan, 'rollback'))
      expect(database.prepare('SELECT object_key FROM source_images').get()?.object_key).toBe(entry.oldKey)
      database.prepare('UPDATE source_images SET sha256 = ?').run('a'.repeat(64))
      database.exec(buildMigrationSql(plan, 'forward'))
      expect(database.prepare('SELECT object_key FROM source_images').get()?.object_key).toBe(entry.oldKey)
      database.prepare('UPDATE source_images SET sha256 = ?, object_key = ?').run(sha256, 'concurrent.jpg')
      database.exec(buildMigrationSql(plan, 'rollback'))
      expect(database.prepare('SELECT object_key FROM source_images').get()?.object_key).toBe('concurrent.jpg')
    }
    finally {
      database.close()
    }
  })

  it('dry-run makes one D1 SELECT, saves the plan, and never contacts R2 or writes D1', async () => {
    const planPath = path.join(directory(), 'plan.json')
    vi.mocked(spawnSync).mockReturnValue(queryResult([row()]))
    await main(['--plan', planPath])
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(spawn).not.toHaveBeenCalled()
    expect(JSON.parse(readFileSync(planPath, 'utf8')).entries[0].oldKey).toBe(row().objectKey)
    const original = readFileSync(planPath, 'utf8')
    await main(['--dry-run', '--plan', planPath])
    expect(readFileSync(planPath, 'utf8')).toBe(original)
  })

  it('refuses all D1 writes when a copied object fails hash/size verification', async () => {
    const { planPath } = savePlan()
    vi.mocked(spawnSync).mockReturnValue(queryResult([row()]))
    mockR2(new Map([[row().objectKey, bytes]]), true)
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('verification')
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(vi.mocked(spawnSync).mock.calls.every(call => !(call[1] as string[]).includes('--file'))).toBe(true)
  })

  it('copies and verifies all bytes before forward D1 SQL, then detects guarded updates', async () => {
    const { plan, planPath } = savePlan()
    const objects = new Map([[row().objectKey, bytes]])
    mockR2(objects)
    vi.mocked(spawnSync).mockImplementation(((_command: string, args: string[]) => {
      if (args.includes('--file')) {
        expect(objects.get(plan.entries[0].newKey)).toEqual(bytes)
        expect(args).toContain('--yes')
        expect(readFileSync(`${planPath}.rollback.sql`, 'utf8')).toContain('object_key = \'20240405_七市\'\'s (preview).JPG\'')
        return importResult(1)
      }
      return queryResult([row({ objectKey: vi.mocked(spawnSync).mock.calls.length > 3 ? plan.entries[0].newKey : row().objectKey })])
    }) as unknown as typeof spawnSync)
    await main(['--execute', '--plan', planPath])
    const put = vi.mocked(spawn).mock.calls.find(call => (call[1] as string[])[2] === 'put')!
    expect(put[1]).toContain('--content-type')
    expect(put[1]).toContain('image/jpeg')
    expect(objects.get(row().objectKey)).toEqual(bytes)
    expect(logs).toContainEqual(expect.stringContaining('copied=1'))
    expect(logs).toContainEqual(expect.stringContaining('D1 updated=1'))
  })

  it('rechecks existing verified objects and completed D1 rows without uploading or refreshing UUIDs', async () => {
    const { plan, planPath } = savePlan()
    const completedRow = row({ objectKey: plan.entries[0].newKey })
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValue(queryResult([completedRow]))
    await main(['--execute', '--plan', planPath])
    expect(vi.mocked(spawn).mock.calls.every(call => (call[1] as string[])[2] === 'get')).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(readFileSync(planPath, 'utf8')).toBe(JSON.stringify(plan))
    expect(logs).toContainEqual(expect.stringContaining('skipped=1'))
  })

  it('aborts all D1 writes and reports every drifted row at the final prewrite read', async () => {
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: 'second.jpg' })
    const { plan, planPath } = savePlan([row(), second])
    mockR2(new Map(plan.entries.map(entry => [entry.newKey, bytes])))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row(), second])).mockReturnValueOnce(queryResult([row({ objectKey: 'concurrent.jpg' })]))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('drift')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('concurrent.jpg'))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('second'))
    expect(vi.mocked(spawnSync).mock.calls.every(call => !(call[1] as string[]).includes('--file'))).toBe(true)
  })

  it('rejects an import that reports no writes for pending rows', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(importResult(0)).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })]))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('rows_written')
    expect(spawnSync).toHaveBeenCalledTimes(4)
  })

  it('accepts index-inflated rows_written when original-plan read-back proves every row', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(importResult(2)).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })]))
    await main(['--execute', '--plan', planPath])
    expect(logs).toContainEqual(expect.stringContaining('rows_written=2 | planned updates=1'))
  })

  it('resumes a partially flattened v2 folder plan using pending rows and keeps the original JSON', async () => {
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: `source-images/second/${sha256}-87654321-1234-4123-8123-123456789abc.jpg` })
    const { plan, planPath } = savePlan([row({ objectKey: folderKey }), second])
    const originalJson = readFileSync(planPath, 'utf8')
    const rows = [row({ objectKey: plan.entries[0].newKey }), second]
    mockR2(new Map(plan.entries.map(entry => [entry.newKey, bytes])))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult(rows)).mockReturnValueOnce(queryResult(rows)).mockReturnValueOnce(importResult(1)).mockReturnValueOnce(queryResult(rows.map((value, index) => ({ ...value, objectKey: plan.entries[index].newKey }))))
    await main(['--execute', '--plan', planPath])
    expect(readFileSync(planPath, 'utf8')).toBe(originalJson)
    expect(readFileSync(`${planPath}.forward.sql`, 'utf8').trim().split('\n')).toHaveLength(2)
    expect(readFileSync(`${planPath}.rollback.sql`, 'utf8').trim().split('\n')).toHaveLength(2)
    expect(readFileSync(`${planPath}.pending.forward.sql`, 'utf8').trim().split('\n')).toHaveLength(1)
    expect(logs).toContainEqual(expect.stringContaining('planned updates=1 | total plan=2'))
  })

  it('reports a guarded update race after the final prewrite read as unmigrated', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(importResult(1)).mockReturnValueOnce(queryResult([row({ objectKey: 'concurrent.jpg' })]))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('unmigrated')
    expect(logs).toContainEqual(expect.stringContaining('unchanged=1'))
  })

  it('rollback verifies retained old bytes and writes only reverse guarded D1 updates', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[row().objectKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })])).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })])).mockReturnValueOnce(importResult(1)).mockReturnValueOnce(queryResult([row()]))
    await main(['--rollback', '--plan', planPath])
    expect(vi.mocked(spawn).mock.calls.every(call => (call[1] as string[])[2] === 'get')).toBe(true)
    const writeArgs = vi.mocked(spawnSync).mock.calls[2][1] as string[]
    expect(writeArgs[writeArgs.indexOf('--file') + 1]).toBe(`${planPath}.pending.rollback.sql`)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect((vi.mocked(spawn).mock.calls[0][1] as string[])[3]).toBe(`${target.bucket}/${row().objectKey}`)
  })

  it('one SELECT preserves null and orphan relationships for validation', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec('CREATE TABLE commissions (id INTEGER PRIMARY KEY, file_name TEXT); CREATE TABLE source_images (commission_id INTEGER, commission_file_name TEXT, object_key TEXT, mime_type TEXT, byte_size INTEGER, sha256 TEXT)')
      database.exec('INSERT INTO commissions VALUES (1, \'七市 (preview)\')')
      const insert = database.prepare('INSERT INTO source_images VALUES (?, ?, ?, ?, ?, ?)')
      insert.run(1, '七市 (preview)', '七市 (preview).jpg', 'image/jpeg', bytes.length, sha256)
      insert.run(null, 'null-id', 'null-id.jpg', 'image/jpeg', bytes.length, sha256)
      insert.run(2, 'orphan', 'orphan.jpg', 'image/jpeg', bytes.length, sha256)
      const rows = database.prepare(sourceImageRowsSql).all() as unknown as SourceImageRow[]
      expect(rows).toHaveLength(3)
      expect(rows.find(value => value.commissionId === null)?.joinedFileName).toBeNull()
      expect(rows.find(value => value.commissionId === 2)?.joinedFileName).toBeNull()
      expect(rows.find(value => value.commissionId === 1)?.joinedFileName).toBe('七市 (preview)')
    }
    finally {
      database.close()
    }
  })

  it('a verified copy beside a failed copy cannot permit any D1 write and all temp files are cleaned', async () => {
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: 'second.jpg' })
    const { plan, planPath } = savePlan([row(), second])
    const objects = new Map([[row().objectKey, bytes], [second.objectKey, Buffer.from('wrong old bytes')]])
    mockR2(objects)
    vi.mocked(spawnSync).mockReturnValue(queryResult([row(), second]))
    await expect(main(['--execute', '--plan', planPath, '--concurrency', '2'])).rejects.toThrow('verification')
    expect(objects.get(plan.entries[0].newKey)).toEqual(bytes)
    expect(objects.has(plan.entries[1].newKey)).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(1)
    for (const call of vi.mocked(spawn).mock.calls) {
      const args = call[1] as string[]
      expect(existsSync(path.dirname(args[args.indexOf('--file') + 1]))).toBe(false)
    }
  })

  it('does not overwrite an existing destination whose bytes disagree with the plan', async () => {
    const { plan, planPath } = savePlan()
    const invalidBytes = Buffer.from('someone else\'s bytes')
    const objects = new Map([[row().objectKey, bytes], [plan.entries[0].newKey, invalidBytes]])
    mockR2(objects)
    vi.mocked(spawnSync).mockReturnValue(queryResult([row()]))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('verification')
    expect(objects.get(plan.entries[0].newKey)).toEqual(invalidBytes)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(spawn).mock.calls.every(call => (call[1] as string[])[2] === 'get')).toBe(true)
    expect(spawnSync).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed D1 JSON before touching R2', async () => {
    const { planPath } = savePlan()
    vi.mocked(spawnSync).mockReturnValue({ ...queryResult([]), stdout: JSON.stringify([{ success: false, results: [] }]) })
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('D1 JSON')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('bounds simultaneous R2 processes and retries transient downloads and uploads', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => row({ commissionId: index + 1, commissionFileName: `image ${index}`, joinedFileName: `image ${index}`, objectKey: `image ${index}.jpg` }))
    const { plan, planPath } = savePlan(rows)
    const objects = new Map(rows.map(value => [value.objectKey, bytes]))
    mockR2(objects)
    const implementation = vi.mocked(spawn).getMockImplementation()!
    let active = 0
    let peak = 0
    let transientDownloads = 0
    let transientUploads = 0
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      active += 1
      peak = Math.max(peak, active)
      const isOldGet = args[2] === 'get' && args[3].endsWith('/image 0.jpg')
      const isFirstPut = args[2] === 'put' && args[3].endsWith(plan.entries[0].newKey)
      if ((isOldGet && transientDownloads++ < 2) || (isFirstPut && transientUploads++ < 2)) {
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
        queueMicrotask(() => {
          active -= 1
          child.stderr.write('Temporary service unavailable')
          child.emit('close', 1)
        })
        return child
      }
      const child = implementation(_command, args, {})
      child.on('close', () => {
        active -= 1
      })
      return child
    }) as unknown as typeof spawn)
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult(rows)).mockReturnValueOnce(queryResult(rows)).mockReturnValueOnce(importResult(rows.length)).mockReturnValueOnce(queryResult(rows.map((value, index) => ({ ...value, objectKey: plan.entries[index].newKey }))))
    await main(['--execute', '--plan', planPath, '--concurrency', '2'])
    expect(peak).toBe(2)
    expect(active).toBe(0)
    expect(transientDownloads).toBe(3)
    expect(transientUploads).toBe(3)
    expect(retryWait.mock.calls.map(call => call[0])).toEqual([500, 1500, 500, 1500])
    for (const entry of plan.entries) {
      expect(objects.get(entry.newKey)).toEqual(bytes)
    }
  })

  it.each(['spinner', 'malformed'])('uses authoritative read-back with %s import output', async (format) => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    const result = importResult(2)
    result.stdout = format === 'spinner' ? `├ Checking if file needs uploading\n│ 🌀 Uploading complete.\n${result.stdout}` : 'unexpected import output'
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(result).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })]))
    await main(['--execute', '--plan', planPath])
    if (format === 'malformed') {
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('read-back'))
    }
  })

  it('lists URL-unsafe rows before generating a plan', () => {
    const values = ['.', '..', 'name#fragment', 'name?query', 'name%20decoded']
    const rows = values.map((value, index) => row({ commissionId: index + 1, commissionFileName: value, joinedFileName: value, objectKey: `${value}.jpg` }))
    expect(() => buildMigrationPlan(rows, target)).toThrow('URL-unsafe')
    for (const value of values) {
      expect(() => buildMigrationPlan(rows, target)).toThrow(value)
    }
    for (const key of ['image#fragment.jpg', 'image?query.jpg', 'image%20decoded.jpg', 'source-images/./file.jpg', 'source-images/../file.jpg', 'source-images//file.jpg', '/file.jpg', 'image\\file.jpg']) {
      expect(() => buildMigrationPlan([row({ objectKey: key })], target)).toThrow('URL-unsafe')
    }
  })

  it('rejects a mirror bucket before any D1 read using real JSONC config parsing', async () => {
    const configPath = path.join(directory(), 'wrangler.jsonc')
    writeFileSync(configPath, '{ // binding must match production\n "name": "test", "r2_buckets": [{ "binding": "IMAGES", "bucket_name": "actual-bucket", }], }')
    vi.stubEnv('FACT_SOURCE_WRANGLER_CONFIG', configPath)
    await expect(main(['--plan', path.join(directory(), 'plan.json')])).rejects.toThrow('IMAGES')
    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects a planned destination already referenced by another D1 row', () => {
    const plan = buildMigrationPlan([row()], target)
    const other = row({ commissionId: 2, commissionFileName: 'other', joinedFileName: 'other', objectKey: plan.entries[0].newKey })
    expect(() => validatePlanRows(plan, [row(), other], target)).toThrow('another D1 row')
  })

  it('rejects a retained rollback destination referenced by a different commission', () => {
    const plan = buildMigrationPlan([row()], target)
    const current = row({ objectKey: plan.entries[0].newKey })
    const other = row({ commissionId: 2, commissionFileName: 'other', joinedFileName: 'other', objectKey: row().objectKey })
    expect(() => validatePlanRows(plan, [current, other], target)).toThrow('another D1 row')
  })

  it('metadata-only drift blocks SQL file creation and D1 writes', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[plan.entries[0].newKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row({ byteSize: bytes.length + 1 })]))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('drift')
    for (const suffix of ['forward.sql', 'rollback.sql', 'pending.forward.sql']) {
      expect(existsSync(`${planPath}.${suffix}`)).toBe(false)
    }
    expect(spawnSync).toHaveBeenCalledTimes(2)
  })

  it.each(['partial', 'complete'])('reads back a %s application after an import process error and rethrows', async (state) => {
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: 'second.jpg' })
    const { plan, planPath } = savePlan([row(), second])
    mockR2(new Map(plan.entries.map(entry => [entry.newKey, bytes])))
    const after = [row({ objectKey: plan.entries[0].newKey }), { ...second, objectKey: state === 'complete' ? plan.entries[1].newKey : second.objectKey }]
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row(), second])).mockReturnValueOnce(queryResult([row(), second])).mockReturnValueOnce({ ...importResult(0), status: 1, stderr: 'Import process disconnected' }).mockReturnValueOnce(queryResult(after))
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('Import process disconnected')
    expect(spawnSync).toHaveBeenCalledTimes(4)
    expect(logs).toContainEqual(expect.stringContaining(`D1 updated=${state === 'complete' ? 2 : 1}`))
  })

  it('v2 rollback resumes folder rows already restored and downloads every original old key', async () => {
    const first = row({ objectKey: folderKey })
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: 'second.jpg' })
    const { plan, planPath } = savePlan([first, second])
    const original = readFileSync(planPath, 'utf8')
    const before = [first, { ...second, objectKey: plan.entries[1].newKey }]
    mockR2(new Map([[first.objectKey, bytes], [second.objectKey, bytes]]))
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(importResult(2)).mockReturnValueOnce(queryResult([first, second]))
    await main(['--rollback', '--plan', planPath])
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(spawn).mock.calls.map(call => (call[1] as string[])[3]).toSorted()).toEqual([`${target.bucket}/${first.objectKey}`, `${target.bucket}/${second.objectKey}`].toSorted())
    expect(readFileSync(`${planPath}.pending.rollback.sql`, 'utf8').trim().split('\n')).toHaveLength(1)
    expect(readFileSync(`${planPath}.rollback.sql`, 'utf8').trim().split('\n')).toHaveLength(2)
    expect(readFileSync(planPath, 'utf8')).toBe(original)
  })

  it.each(['--execute', '--rollback'])('full-plan read-back detects damage to previously completed rows in %s', async (mode) => {
    const first = row({ objectKey: folderKey })
    const second = row({ commissionId: 2, commissionFileName: 'second', joinedFileName: 'second', objectKey: 'second.jpg' })
    const { plan, planPath } = savePlan([first, second])
    const rollback = mode === '--rollback'
    const before = rollback
      ? [first, { ...second, objectKey: plan.entries[1].newKey }]
      : [{ ...first, objectKey: plan.entries[0].newKey }, second]
    const expected = [first, second].map((value, index) => ({ ...value, objectKey: rollback ? plan.entries[index].oldKey : plan.entries[index].newKey }))
    const objects = new Map(plan.entries.map(entry => [rollback ? entry.oldKey : entry.newKey, bytes]))
    mockR2(objects)
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(queryResult(before)).mockReturnValueOnce(importResult(2)).mockReturnValueOnce(queryResult([{ ...expected[0], byteSize: bytes.length + 1 }, expected[1]]))
    await expect(main([mode, '--plan', planPath])).rejects.toThrow('unmigrated')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(first.commissionFileName))
    expect(readFileSync(`${planPath}.pending.${rollback ? 'rollback' : 'forward'}.sql`, 'utf8').trim().split('\n')).toHaveLength(1)
  })

  it('retries a failed destination GET containing 404 in its key and never falls through to PUT', async () => {
    const { planPath } = savePlan()
    vi.mocked(spawnSync).mockReturnValue(queryResult([row()]))
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
      queueMicrotask(() => {
        child.stderr.write(`Failed to fetch /accounts/id/r2/buckets/${args[3]} - 503: Service unavailable`)
        child.emit('close', 1)
      })
      return child
    }) as unknown as typeof spawn)
    await expect(main(['--execute', '--plan', planPath])).rejects.toThrow('download failed')
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(vi.mocked(spawn).mock.calls.every(call => (call[1] as string[])[2] === 'get')).toBe(true)
    expect(retryWait.mock.calls.map(call => call[0])).toEqual([500, 1500])
    expect(spawnSync).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 for an old key containing 404 instead of declaring it missing', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[row().objectKey, bytes]]))
    const implementation = vi.mocked(spawn).getMockImplementation()!
    let oldAttempts = 0
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      if (args[2] !== 'get' || args[3].endsWith(plan.entries[0].newKey) || oldAttempts++ > 0) {
        return implementation(_command, args, {})
      }
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
      queueMicrotask(() => {
        child.stderr.write(`Failed to fetch /accounts/id/r2/buckets/${args[3]} - 429: Too many requests`)
        child.emit('close', 1)
      })
      return child
    }) as unknown as typeof spawn)
    vi.mocked(spawnSync).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(queryResult([row()])).mockReturnValueOnce(importResult(2)).mockReturnValueOnce(queryResult([row({ objectKey: plan.entries[0].newKey })]))
    await main(['--execute', '--plan', planPath])
    expect(oldAttempts).toBe(2)
    expect(retryWait.mock.calls.map(call => call[0])).toEqual([500])
  })

  it('every SQL guard independently prevents forward and reverse updates', () => {
    const plan = buildMigrationPlan([row()], target)
    const entry = plan.entries[0]
    const guards = { commission_id: 2, commission_file_name: 'different', object_key: 'different.jpg', sha256: 'a'.repeat(64), byte_size: bytes.length + 1, mime_type: 'image/png' }
    const database = new DatabaseSync(':memory:')
    try {
      database.exec('CREATE TABLE source_images (commission_id INTEGER, commission_file_name TEXT, object_key TEXT, sha256 TEXT, byte_size INTEGER, mime_type TEXT, updated_at TEXT)')
      for (const direction of ['forward', 'rollback'] as const) {
        for (const [column, changed] of Object.entries(guards)) {
          database.exec('SAVEPOINT fixture')
          const from = direction === 'forward' ? entry.oldKey : entry.newKey
          database.prepare('INSERT INTO source_images VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.commissionId, entry.commissionFileName, from, entry.sha256, entry.byteSize, entry.mimeType, 'unchanged')
          database.prepare(`UPDATE source_images SET ${column} = ?`).run(changed)
          const before = database.prepare('SELECT * FROM source_images').get()
          database.exec(buildMigrationSql(plan, direction))
          expect(database.prepare('SELECT * FROM source_images').get()).toEqual(before)
          database.exec('ROLLBACK TO fixture; RELEASE fixture')
        }
      }
    }
    finally {
      database.close()
    }
  })

  it('rollback aborts before D1 writes when retained old bytes are corrupt', async () => {
    const { plan, planPath } = savePlan()
    mockR2(new Map([[row().objectKey, Buffer.from('bad old bytes')]]))
    vi.mocked(spawnSync).mockReturnValue(queryResult([row({ objectKey: plan.entries[0].newKey })]))
    await expect(main(['--rollback', '--plan', planPath])).rejects.toThrow('verification')
    expect(spawnSync).toHaveBeenCalledTimes(1)
  })
})
