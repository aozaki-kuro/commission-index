import type { D1DatabaseLike, D1PreparedStatementLike } from './adminPersistence'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { createCommission, saveHomeFeaturedSearchKeywords, updateCharacterOrder } from './adminPersistence'

interface TestD1Result {
  success?: boolean
}

interface SQLiteD1Options {
  failAtBatchStatement?: number
}

function createSQLiteD1({ failAtBatchStatement }: SQLiteD1Options = {}) {
  const database = new DatabaseSync(':memory:')
  const migrationsDirectory = path.resolve(import.meta.dirname, '../migrations')
  for (const migrationName of [
    '0001_admin_fact_source.sql',
    '0002_source_image_metadata.sql',
    '0003_rename_stale_to_archived.sql',
  ]) {
    database.exec(readFileSync(path.join(migrationsDirectory, migrationName), 'utf8'))
  }

  let batchCallCount = 0
  const db: D1DatabaseLike = {
    prepare(query) {
      return createStatement(query)
    },
    async batch(statements) {
      batchCallCount += 1
      database.exec('BEGIN')
      try {
        const results: TestD1Result[] = []
        for (const [index, statement] of statements.entries()) {
          if (index + 1 === failAtBatchStatement) {
            throw new Error('Injected batch statement failure.')
          }
          results.push(await statement.run())
        }
        database.exec('COMMIT')
        return results
      }
      catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }

  function createStatement(query: string, values: unknown[] = []): D1PreparedStatementLike {
    return {
      bind(...nextValues) {
        return createStatement(query, nextValues)
      },
      async all<TRow>() {
        return { results: database.prepare(query).all(...values as never[]) as TRow[] }
      },
      async run() {
        database.prepare(query).run(...values as never[])
        return { success: true }
      },
    }
  }

  return { batchCallCount: () => batchCallCount, database, db }
}

describe('d1 batch persistence', () => {
  const databases: DatabaseSync[] = []

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close()
    }
  })

  function createDatabase(options?: SQLiteD1Options) {
    const fixture = createSQLiteD1(options)
    databases.push(fixture.database)
    return fixture
  }

  it('rolls back commission creation when the source-image metadata insert conflicts', async () => {
    const { database, db, batchCallCount } = createDatabase()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Fixture', 'active', 1);
      INSERT INTO commissions (character_id, file_name, links) VALUES (1, '20250301_existing', '[]');
      INSERT INTO source_images (commission_file_name, object_key, mime_type, byte_size, sha256)
      VALUES ('20250301_existing', 'source-images/shared-key.png', 'image/png', 1, 'old-hash');
    `)

    await expect(createCommission(db, {
      characterId: 1,
      fileName: '20250302_new',
      links: [],
    }, {
      commissionFileName: '20250302_new',
      objectKey: 'source-images/shared-key.png',
      mimeType: 'image/png',
      byteSize: 1,
      sha256: 'new-hash',
    })).rejects.toThrow()

    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT file_name FROM commissions ORDER BY file_name').all()).toEqual([
      { file_name: '20250301_existing' },
    ])
    expect(database.prepare('SELECT commission_file_name, sha256 FROM source_images').all()).toEqual([
      { commission_file_name: '20250301_existing', sha256: 'old-hash' },
    ])
  })

  it('keeps the entire featured-keyword list when the second D1 statement fails', async () => {
    const { database, db, batchCallCount } = createDatabase({ failAtBatchStatement: 2 })
    database.exec(`
      INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES ('old-a', 1), ('old-b', 2);
    `)

    await expect(saveHomeFeaturedSearchKeywords(db, ['new-a', 'new-b'])).rejects.toThrow('Injected batch')

    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT keyword FROM home_featured_search_keywords ORDER BY sort_order').all())
      .toEqual([{ keyword: 'old-a' }, { keyword: 'old-b' }])
  })

  it('rolls back active and archived ordering together when an archived update fails', async () => {
    const { database, db, batchCallCount } = createDatabase({ failAtBatchStatement: 2 })
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES
        (1, 'Active A', 'active', 4),
        (2, 'Active B', 'active', 5),
        (3, 'Archived C', 'archived', 6);
    `)

    await expect(
      updateCharacterOrder(db, { active: [2, 1], archived: [3] }),
    ).rejects.toThrow('Injected batch')

    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT id, status, sort_order FROM characters ORDER BY id').all()).toEqual([
      { id: 1, status: 'active', sort_order: 4 },
      { id: 2, status: 'active', sort_order: 5 },
      { id: 3, status: 'archived', sort_order: 6 },
    ])
  })
})
