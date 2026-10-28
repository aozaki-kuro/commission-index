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
})
