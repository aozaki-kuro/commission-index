import type { D1DatabaseLike } from './adminPersistence'
import { describe, expect, it } from 'vitest'
import { createSQLiteD1 } from '../test/sqliteD1'
import { handleAdminReadRequest } from './adminData'

const baseUrl = 'https://admin.example'

function createMigratedDatabase() {
  const { database, db } = createSQLiteD1()
  database.exec(`
    INSERT INTO characters (id, name, status, sort_order) VALUES
      (1, 'Alice', 'active', 1),
      (2, 'Beta', 'archived', 2);
    INSERT INTO commissions (id, character_id, file_name, links, keyword, commission_date, creator_name, design, description, hidden) VALUES
      (10, 1, '20250301_alice-maker', '["https://alice.example/a"]', 'maid, cafe', '2025-03-01', 'alice-maker', 'maid outfit', 'soft lighting', 0),
      (11, 2, '20240105_beta-maker', '[]', 'armor', '2024-01-05', 'beta-maker', 'armor', 'battle scene', 1);
    INSERT INTO creator_aliases (creator_name, aliases) VALUES ('maker', '["mk"]');
    INSERT INTO character_aliases (character_name, aliases) VALUES ('Alice', '["Alicia"]');
    INSERT INTO keyword_aliases (base_keyword, aliases) VALUES ('maid', '["uniform"]');
    INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES ('maid', 1), ('maker', 2);
  `)
  return db
}

// Counts prepared statements: every D1 read in the worker goes through prepare() exactly once.
function countStatements(db: D1DatabaseLike) {
  const statements: string[] = []
  const countingDb: D1DatabaseLike = {
    ...db,
    prepare(query: string) {
      statements.push(query)
      return db.prepare(query)
    },
  }
  return { statements, db: countingDb }
}

async function readOverview(path: string) {
  const { statements, db } = countStatements(createMigratedDatabase())
  const response = await handleAdminReadRequest(new Request(`${baseUrl}${path}`), { DB: db })
  expect(response?.status).toBe(200)
  return { statements, payload: await response!.json() as Record<string, any> }
}

describe('admin read path on a fully migrated D1', () => {
  it('loads bootstrap rows with keyword in a fixed number of statements', async () => {
    const { statements, payload } = await readOverview('/api/admin/bootstrap')

    expect(payload.characters).toEqual([
      {
        id: 1,
        name: 'Alice',
        status: 'active',
        sortOrder: 1,
        commissionCount: 1,
      },
      {
        id: 2,
        name: 'Beta',
        status: 'archived',
        sortOrder: 2,
        commissionCount: 1,
      },
    ])
    expect(payload.commissionSearchRows.map((row: { keyword: string }) => row.keyword)).toEqual(['maid, cafe', 'armor'])
    expect(statements).toHaveLength(4)
  })

  it('loads alias data with the alias tables and keyword column in a fixed number of statements', async () => {
    const { statements, payload } = await readOverview('/api/admin/aliases/bootstrap')

    expect(payload.characterAliases).toContainEqual({
      characterName: 'Alice',
      aliases: ['Alicia'],
      commissionCount: 1,
    })
    expect(payload.keywordAliases).toContainEqual({
      baseKeyword: 'maid',
      aliases: ['uniform'],
      commissionCount: 1,
    })
    expect(statements).toHaveLength(6)
  })

  it('loads suggestion data in a fixed number of statements', async () => {
    const { statements, payload } = await readOverview('/api/admin/suggestion')

    expect(payload.featuredKeywords).toEqual(['maid', 'maker'])
    expect(statements).toHaveLength(5)
  })

  it('sums commission counts of characters that share a normalized alias key', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Aria', 'active', 1), (2, 'aria ', 'active', 2);
      INSERT INTO commissions (id, character_id, file_name, links, commission_date) VALUES
        (10, 1, 'a', '[]', '2025-01-01'),
        (11, 2, 'b', '[]', '2025-01-02'),
        (12, 2, 'c', '[]', '2025-01-03');
    `)

    const response = await handleAdminReadRequest(new Request(`${baseUrl}/api/admin/aliases/bootstrap`), { DB: db })
    const payload = await response!.json() as { characterAliases: Array<{ characterName: string, commissionCount: number }> }

    expect(payload.characterAliases).toEqual([
      expect.objectContaining({ commissionCount: 3 }),
    ])
  })

  it('keeps each character contiguous in bootstrap rows when sort_order values tie', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'First', 'active', 1), (2, 'Second', 'active', 1);
      INSERT INTO commissions (id, character_id, file_name, links, commission_date) VALUES
        (10, 2, 'a', '[]', '2025-06-01'),
        (11, 1, 'b', '[]', '2025-01-01'),
        (12, 2, 'c', '[]', '2024-01-01');
    `)

    const response = await handleAdminReadRequest(new Request(`${baseUrl}/api/admin/bootstrap`), { DB: db })
    const payload = await response!.json() as { characters: Array<{ id: number }>, commissionSearchRows: Array<{ characterId: number }> }

    expect(payload.characters.map(row => row.id)).toEqual([1, 2])
    expect(payload.commissionSearchRows.map(row => row.characterId)).toEqual([1, 2, 2])
  })

  it('excludes hidden commissions from suggestion keywordOptions', async () => {
    const { payload } = await readOverview('/api/admin/suggestion')

    expect(payload.keywordOptions).toEqual(expect.arrayContaining([
      'Alice',
      'alice-maker',
      'Alicia',
      'cafe',
      'maid',
      'uniform',
    ]))
    expect(payload.keywordOptions).not.toContain('armor')
    expect(payload.keywordOptions).not.toContain('beta-maker')
    expect(payload.keywordOptions).not.toContain('Beta')
  })

  it('matches weak W/ ETag prefixes against strong ETags and vice versa on source-image revalidation', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Alice', 'active', 1);
      INSERT INTO commissions (id, character_id, file_name, links, commission_date) VALUES
        (10, 1, 'alice-work', '[]', '2025-03-01');
      INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256) VALUES
        ('alice-work', 10, 'source-images/alice.jpg', 'image/jpeg', 3, 'hash');
    `)

    const weakMatchResponse = await handleAdminReadRequest(
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': 'W/"strong-etag"' },
      }),
      {
        DB: db,
        IMAGES: {
          get: async () => ({
            httpMetadata: { contentType: 'image/jpeg' },
            httpEtag: '"strong-etag"',
            size: 3,
            async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer },
          }),
        },
      },
    )
    expect(weakMatchResponse?.status).toBe(304)

    const strongClientWeakStoredResponse = await handleAdminReadRequest(
      new Request(`${baseUrl}/api/admin/commissions/10/source-image`, {
        method: 'GET',
        headers: { 'If-None-Match': '"strong-etag"' },
      }),
      {
        DB: db,
        IMAGES: {
          get: async () => ({
            httpMetadata: { contentType: 'image/jpeg' },
            httpEtag: 'W/"strong-etag"',
            size: 3,
            async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer },
          }),
        },
      },
    )
    expect(strongClientWeakStoredResponse?.status).toBe(304)
  })
})
