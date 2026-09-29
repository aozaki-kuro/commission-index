import type { GeneratedFactSourceContent, GeneratedSourceImageManifest } from '@commission-index/domain'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSourceImageFileRecord,
  createSnapshot,
  factSourceSnapshotSql,
  getLocalImageName,
  main,
  resolveReusableSourceImageRecord,
  verifyExistingSnapshot,
} from '../scripts/exportWebFactSource'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(), spawn: vi.fn() }))

const temporaryDirectories: string[] = []
function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'fact-source-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function fixture() {
  const meta = { schemaVersion: 3 as const, source: 'remote-admin-fact-source' as const, exportedAt: '2026-01-01T00:00:00Z', revision: 'fixture', databaseBinding: 'fixture', imagesBucket: 'fixture' }
  const content: GeneratedFactSourceContent = { meta, characters: [], creatorAliases: [], characterAliases: [], keywordAliases: [], featuredSearchKeywords: ['old'] }
  const manifest: GeneratedSourceImageManifest = { meta, files: [], missing: [] }
  return { content, manifest }
}

function saveFixture(directory: string, snapshot: ReturnType<typeof createSnapshot>) {
  const target = path.join(directory, 'fact-source')
  mkdirSync(target, { recursive: true })
  writeFileSync(path.join(target, 'content.json'), JSON.stringify(snapshot.content))
  writeFileSync(path.join(target, 'source-images-manifest.json'), JSON.stringify(snapshot.manifest))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('FACT_SOURCE_USE_EXISTING_SNAPSHOT', '')
  vi.stubEnv('WEB_BUILD_CACHE_TOKEN', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('事实源快照导出', () => {
  it('导出时间变化不影响 revision，业务内容和图片哈希变化会失效', () => {
    const { content, manifest } = fixture()
    const first = createSnapshot(content, manifest)
    content.meta.exportedAt = '2026-02-01T00:00:00Z'
    const second = createSnapshot(content, manifest)
    expect(second.content.meta.revision).toBe(first.content.meta.revision)
    expect(second.content.meta.exportedAt).not.toBe(first.content.meta.exportedAt)
    content.featuredSearchKeywords = ['new']
    expect(createSnapshot(content, manifest).content.meta.revision).not.toBe(first.content.meta.revision)
    content.featuredSearchKeywords = ['old']
    manifest.files = [{ commissionId: 1, commissionFileName: '20260101', objectKey: 'source-images/20260101/hash-id.png', relativePath: 'source-images/20260101.png', mimeType: 'image/png', byteSize: 1, sha256: 'changed' }]
    expect(createSnapshot(content, manifest).content.meta.revision).not.toBe(first.content.meta.revision)
  })

  it('不可变远端 key 映射到本地 canonical 文件，复用时保留原始远端 key', () => {
    const directory = temporaryDirectory()
    const objectKey = 'source-images/20260101/sha-uuid.png'
    const filePath = path.join(directory, '20260101.png')
    writeFileSync(filePath, 'image')
    const record = buildSourceImageFileRecord('20260101', objectKey, filePath, 1)
    expect(record.relativePath).toBe('source-images/20260101.png')
    expect(record.objectKey).toBe(objectKey)
    expect(resolveReusableSourceImageRecord(directory, { ...record, byteSize: 5 })).toEqual(record)
    expect(getLocalImageName('20260101', objectKey)).toBe('20260101.png')
    expect(() => getLocalImageName('../escape', objectKey)).toThrow('Unsafe')
  })

  it('快照复用校验两份 revision、期望版本和实际图片字节', async () => {
    const directory = temporaryDirectory()
    const { content, manifest } = fixture()
    mkdirSync(path.join(directory, 'source-images'))
    const imagePath = path.join(directory, 'source-images/20260101.png')
    writeFileSync(imagePath, 'image')
    manifest.files = [buildSourceImageFileRecord('20260101', 'source-images/20260101/hash.png', imagePath, 1)]
    const snapshot = createSnapshot(content, manifest)
    saveFixture(directory, snapshot)
    const revision = snapshot.content.meta.revision
    expect(verifyExistingSnapshot(directory, revision)).toBe(revision)
    expect(() => verifyExistingSnapshot(directory, 'old-version')).toThrow('revision')
    vi.stubEnv('FACT_SOURCE_USE_EXISTING_SNAPSHOT', '1')
    vi.stubEnv('WEB_BUILD_CACHE_TOKEN', revision)
    await main(['--output-root', directory])
    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    writeFileSync(imagePath, 'changed-image')
    expect(() => verifyExistingSnapshot(directory, revision)).toThrow('图片校验失败')
    saveFixture(directory, { ...snapshot, manifest: { ...snapshot.manifest, meta: { ...snapshot.manifest.meta, revision: 'different' } } })
    expect(() => verifyExistingSnapshot(directory)).toThrow('revision')
  })

  it('单个 SQLite SELECT 读取完整快照，普通导出没有 D1 写回或第二次读取', async () => {
    const database = new DatabaseSync(':memory:')
    try {
      const migrationsDirectory = path.resolve(import.meta.dirname, '../migrations')
      database.exec(readFileSync(path.join(migrationsDirectory, '0001_admin_fact_source.sql'), 'utf8'))
      database.exec(readFileSync(path.join(migrationsDirectory, '0002_source_image_metadata.sql'), 'utf8'))
      database.exec(readFileSync(path.join(migrationsDirectory, '0003_rename_stale_to_archived.sql'), 'utf8'))
      database.exec(readFileSync(path.join(migrationsDirectory, '0004_commission_identity.sql'), 'utf8'))
      database.exec('INSERT INTO characters(name, status, sort_order) VALUES (\'fixture\', \'active\', 1)')
      const partNames = [
        '20250930_Q (part 1)',
        '20250930_Q (part 2)',
        '20241230_Q (part 1)',
        '20241230_Q (part 2)',
        '20241027_Q (part 1)',
        '20241027_Q (part 2)',
        '20240819_Q (part 1)',
        '20240819_Q (part 2)',
        '20250302_Q (part 1)',
        '20250302_Q (part 2)',
        '20240421_Gisyu (part 1)',
        '20240421_Gisyu (part 2)',
      ]
      const insertPart = database.prepare(`
        INSERT INTO commissions(id, character_id, file_name, links, commission_date, creator_name)
        VALUES (?, 1, ?, '[]', '2024-01-01', ?)
      `)
      partNames.forEach((fileName, index) => insertPart.run(100 + index, fileName, `${fileName.slice(9)}`))
      database.exec(readFileSync(path.join(migrationsDirectory, '0005_public_commission_identity_and_parts.sql'), 'utf8'))
      database.exec('INSERT INTO commissions(id, character_id, file_name, links, commission_date, creator_name) VALUES (1, 1, \'20260929_artist_fixture\', \'[]\', \'2026-09-29\', \'artist fixture\')')
      database.exec('INSERT INTO source_images(commission_file_name, object_key, mime_type, byte_size, sha256, commission_id) VALUES (\'20260929_artist_fixture\', \'source-images/20260929/hash.png\', \'image/png\', 5, \'sha256\', 1)')
      database.exec('INSERT INTO home_featured_search_keywords(keyword, sort_order) VALUES (\'new remote content\', 1)')
      const row = database.prepare(factSourceSnapshotSql).get()
      expect(JSON.parse(String(row?.table0))).toEqual([{ id: 1, name: 'fixture', status: 'active', sortOrder: 1 }])
      expect(JSON.parse(String(row?.table1)).find((commission: { fileName: string }) => commission.fileName === '20260929_artist_fixture')).toEqual({
        id: 1,
        publicId: expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/),
        characterId: 1,
        commissionDate: '2026-09-29',
        creatorName: 'artist fixture',
        workGroupId: null,
        partNumber: null,
        fileName: '20260929_artist_fixture',
        links: '[]',
        design: null,
        description: null,
        hidden: 0,
        keyword: null,
      })
      expect(JSON.parse(String(row?.table6))).toEqual([{
        commissionId: 1,
        commissionFileName: '20260929_artist_fixture',
        objectKey: 'source-images/20260929/hash.png',
        mimeType: 'image/png',
        byteSize: 5,
        sha256: 'sha256',
      }])
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify([{ results: [{ ...row, table1: '[]', table6: '[]' }] }]), stderr: '', pid: 0, signal: null, output: [] })
      const directory = temporaryDirectory()
      const old = fixture()
      saveFixture(directory, createSnapshot(old.content, old.manifest))
      await main(['--output-root', directory])
      expect(spawnSync).toHaveBeenCalledTimes(1)
      expect(spawn).not.toHaveBeenCalled()
      const call = vi.mocked(spawnSync).mock.calls[0]
      const args = call[1] as string[]
      expect(args[args.indexOf('--command') + 1]).toBe(factSourceSnapshotSql)
      expect(factSourceSnapshotSql.trimStart()).toMatch(/^SELECT /)
      const exported = JSON.parse(readFileSync(path.join(directory, 'fact-source/content.json'), 'utf8'))
      expect(exported.featuredSearchKeywords).toEqual(['new remote content'])
      expect(verifyExistingSnapshot(directory)).toBe(exported.meta.revision)
    }
    finally {
      database.close()
    }
  })

  it('图片本地哈希不同于 D1 元数据时不能从旧缓存复用', () => {
    const directory = temporaryDirectory()
    writeFileSync(path.join(directory, '20260101.png'), 'old')
    const row = { commissionId: 1, commissionFileName: '20260101', objectKey: 'source-images/20260101/new.png', mimeType: 'image/png', byteSize: 3, sha256: createHash('sha256').update('new').digest('hex') }
    expect(resolveReusableSourceImageRecord(directory, row)).toBeNull()
  })

  it('下载缺失元数据的旧图片只写本地快照，不修复远端 D1', async () => {
    const row = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`table${index}`, '[]']))
    row.table0 = JSON.stringify([{ id: 1, name: 'fixture', status: 'active', sortOrder: 1 }])
    row.table1 = JSON.stringify([{ id: 1, characterId: 1, commissionDate: '2026-01-01', creatorName: 'creator', fileName: '20260101', links: '[]', hidden: 0 }])
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify([{ results: [row] }]), stderr: '', pid: 0, signal: null, output: [] })
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
      queueMicrotask(() => {
        writeFileSync(args[args.indexOf('--file') + 1], 'image')
        child.emit('close', 0)
      })
      return child
    }) as unknown as typeof spawn)
    const directory = temporaryDirectory()
    await main(['--output-root', directory])
    expect(spawnSync).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    const manifest = JSON.parse(readFileSync(path.join(directory, 'fact-source/source-images-manifest.json'), 'utf8'))
    expect(manifest.files[0].relativePath).toBe('source-images/20260101.jpg')
    expect(verifyExistingSnapshot(directory)).toBe(manifest.meta.revision)
  })

  it('部分图片下载成功后另一张失败，旧快照及其全部图片仍可用', async () => {
    const directory = temporaryDirectory()
    const imagesDirectory = path.join(directory, 'source-images')
    mkdirSync(imagesDirectory)
    const { content, manifest } = fixture()
    const oldNames = ['20260101', '20260102', '20260103']
    for (const name of oldNames) {
      const imagePath = path.join(imagesDirectory, `${name}.png`)
      writeFileSync(imagePath, `old-${name}`)
      manifest.files.push(buildSourceImageFileRecord(name, `source-images/${name}/old.png`, imagePath, oldNames.indexOf(name) + 1))
    }
    const oldSnapshot = createSnapshot(content, manifest)
    saveFixture(directory, oldSnapshot)
    const oldContent = readFileSync(path.join(directory, 'fact-source/content.json'), 'utf8')
    const oldManifest = readFileSync(path.join(directory, 'fact-source/source-images-manifest.json'), 'utf8')
    const row = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`table${index}`, '[]']))
    row.table0 = JSON.stringify([{ id: 1, name: 'fixture', status: 'active', sortOrder: 1 }])
    row.table1 = JSON.stringify(oldNames.slice(0, 2).map((fileName, index) => ({ id: index + 1, characterId: 1, commissionDate: `2026-01-0${index + 1}`, creatorName: 'creator', fileName, links: '[]', hidden: 0 })))
    row.table6 = JSON.stringify(oldNames.slice(0, 2).map((commissionFileName, index) => ({
      commissionId: index + 1,
      commissionFileName,
      objectKey: `source-images/${commissionFileName}/new.png`,
      mimeType: 'image/png',
      byteSize: 12,
      sha256: createHash('sha256').update(`new-${commissionFileName}`).digest('hex'),
    })))
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify([{ results: [row] }]), stderr: '', pid: 0, signal: null, output: [] })
    vi.stubEnv('FACT_SOURCE_DOWNLOAD_CONCURRENCY', '1')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
      queueMicrotask(() => {
        if (args[3].includes('20260101')) {
          writeFileSync(args[args.indexOf('--file') + 1], 'new-20260101')
          child.emit('close', 0)
        }
        else {
          child.stderr.write('NoSuchKey')
          child.emit('close', 1)
        }
      })
      return child
    }) as unknown as typeof spawn)
    await expect(main(['--output-root', directory])).rejects.toThrow('图片导出失败')
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(readFileSync(path.join(directory, 'fact-source/content.json'), 'utf8')).toBe(oldContent)
    expect(readFileSync(path.join(directory, 'fact-source/source-images-manifest.json'), 'utf8')).toBe(oldManifest)
    expect(readdirSync(imagesDirectory).toSorted()).toEqual(oldNames.map(name => `${name}.png`))
    for (const name of oldNames) {
      expect(readFileSync(path.join(imagesDirectory, `${name}.png`), 'utf8')).toBe(`old-${name}`)
    }
    expect(verifyExistingSnapshot(directory)).toBe(oldSnapshot.content.meta.revision)
  })
})
