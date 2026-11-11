import { describe, expect, it } from 'vitest'
import { createSQLiteD1 } from '../test/sqliteD1'
import { createCharacter, createCommission, deleteCharacter, saveCharacterAliasesBatch, saveCreatorAliasesBatch, saveHomeFeaturedSearchKeywords, saveKeywordAliasesBatch, saveSourceImageMetadata, updateCharacter, updateCharacterOrder } from './adminPersistence'

describe('d1 batch persistence', () => {
  it('stores explicit identity fields and binds source-image metadata to the new commission id', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'Fixture\', \'active\', 1)')

    await createCommission(db, {
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Fixture Creator',
      fileName: 'commission-test-key',
      links: [],
    }, {
      commissionFileName: 'commission-test-key',
      objectKey: 'source-images/commission-test-key/hash.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash',
    })

    expect(database.prepare('SELECT commission_date, creator_name FROM commissions WHERE id = 1').get())
      .toEqual({ commission_date: '2025-03-02', creator_name: 'Fixture Creator' })
    expect(database.prepare('SELECT commission_id FROM source_images WHERE commission_file_name = ?').get('commission-test-key'))
      .toEqual({ commission_id: 1 })
    const publicId = database.prepare('SELECT public_id FROM commissions WHERE id = 1').get() as { public_id: string }
    expect(publicId.public_id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  })

  it('creates a new multi-part group with distinct commission identities and ordered parts', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'Fixture\', \'active\', 1)')

    await createCommission(db, {
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Fixture Creator',
      workGroupId: 'new',
      partNumber: 1,
      fileName: 'part-one',
      links: [],
    }, {
      commissionFileName: 'part-one',
      objectKey: 'source-images/part-one/hash.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash',
    })
    const group = database.prepare('SELECT work_group_id FROM commissions WHERE file_name = ?').get('part-one') as { work_group_id: string }
    await createCommission(db, {
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Fixture Creator',
      workGroupId: group.work_group_id,
      partNumber: 2,
      fileName: 'part-two',
      links: [],
    }, {
      commissionFileName: 'part-two',
      objectKey: 'source-images/part-two/hash.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash',
    })

    const records = database.prepare(`
      SELECT public_id, work_group_id, part_number
      FROM commissions ORDER BY part_number
    `).all()
    expect(records).toHaveLength(2)
    expect(records[0].public_id).not.toBe(records[1].public_id)
    expect(records[0].work_group_id).toBe(records[1].work_group_id)
    expect(records.map(row => row.part_number)).toEqual([1, 2])
  })

  it('rolls back commission creation when the source-image metadata insert conflicts', async () => {
    const { database, db, batchCallCount } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Fixture', 'active', 1);
      INSERT INTO commissions (character_id, file_name, links) VALUES (1, '20250301_existing', '[]');
      INSERT INTO source_images (commission_file_name, object_key, mime_type, byte_size, sha256)
      VALUES ('20250301_existing', 'source-images/shared-key.png', 'image/png', 1, 'old-hash');
    `)

    await expect(createCommission(db, {
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Fixture Creator',
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
    const { database, db, batchCallCount } = createSQLiteD1({ failAtBatchStatement: 2 })
    database.exec(`
      INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES ('old-a', 1), ('old-b', 2);
    `)

    await expect(saveHomeFeaturedSearchKeywords(db, ['new-a', 'new-b'])).rejects.toThrow('Injected batch')

    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT keyword FROM home_featured_search_keywords ORDER BY sort_order').all())
      .toEqual([
        { keyword: 'old-a' },
        { keyword: 'old-b' },
      ])
  })

  it('rolls back active and archived ordering together when an archived update fails', async () => {
    const { database, db, batchCallCount } = createSQLiteD1({ failAtBatchStatement: 2 })
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES
        (1, 'Active A', 'active', 4),
        (2, 'Active B', 'active', 5),
        (3, 'Archived C', 'archived', 6);
    `)

    await expect(
      updateCharacterOrder(db, {
        active: [2, 1],
        archived: [3],
      }),
    ).rejects.toThrow('Injected batch')

    expect(batchCallCount()).toBe(1)
    expect(database.prepare('SELECT id, status, sort_order FROM characters ORDER BY id').all()).toEqual([
      { id: 1, status: 'active', sort_order: 4 },
      { id: 2, status: 'active', sort_order: 5 },
      { id: 3, status: 'archived', sort_order: 6 },
    ])
  })
})

describe('character delete source-image selection', () => {
  it('returns exactly the object keys of every source_images row the cascade removes', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Doomed', 'active', 1);
      INSERT INTO characters (id, name, status, sort_order) VALUES (2, 'Kept', 'active', 2);
      INSERT INTO commissions (id, character_id, file_name, commission_date, creator_name, links) VALUES
        (10, 1, 'linked-by-id', '2025-01-01', 'A', '[]'),
        (11, 1, 'linked-by-name', '2025-01-02', 'B', '[]'),
        (20, 2, 'kept', '2025-01-03', 'C', '[]');
      INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256) VALUES
        ('renamed-away', 10, 'source-images/by-id.jpg', 'image/jpeg', 1, 'a'),
        ('linked-by-name', NULL, 'source-images/by-name.jpg', 'image/jpeg', 1, 'b'),
        ('kept', 20, 'source-images/kept.jpg', 'image/jpeg', 1, 'c');
    `)

    const objectKeys = await deleteCharacter(db, 1)

    expect(objectKeys.toSorted()).toEqual(['source-images/by-id.jpg', 'source-images/by-name.jpg'])
    expect(database.prepare('SELECT object_key FROM source_images ORDER BY object_key').all())
      .toEqual([
        { object_key: 'source-images/kept.jpg' },
      ])
  })

  it('never returns an object key that a row surviving the delete still references', async () => {
    const { database, db } = createSQLiteD1()
    // object_key is UNIQUE in the real schema (0002), so a shared key can only be built after dropping that constraint.
    database.exec(`
      CREATE TABLE source_images_unconstrained (
        commission_file_name TEXT PRIMARY KEY,
        object_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        commission_id INTEGER REFERENCES commissions(id) ON DELETE CASCADE
      );
      INSERT INTO source_images_unconstrained SELECT commission_file_name, object_key, mime_type, byte_size, sha256, updated_at, commission_id FROM source_images;
      DROP TABLE source_images;
      ALTER TABLE source_images_unconstrained RENAME TO source_images;
      CREATE UNIQUE INDEX idx_source_images_commission_id ON source_images(commission_id) WHERE commission_id IS NOT NULL;

      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Doomed', 'active', 1);
      INSERT INTO characters (id, name, status, sort_order) VALUES (2, 'Kept', 'active', 2);
      INSERT INTO commissions (id, character_id, file_name, commission_date, creator_name, links) VALUES
        (10, 1, 'shared-a', '2025-01-01', 'A', '[]'),
        (11, 1, 'own', '2025-01-02', 'B', '[]'),
        (20, 2, 'shared-b', '2025-01-03', 'C', '[]');
      INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256) VALUES
        ('shared-a', 10, 'source-images/shared.jpg', 'image/jpeg', 1, 'a'),
        ('own', 11, 'source-images/own.jpg', 'image/jpeg', 1, 'b'),
        ('shared-b', 20, 'source-images/shared.jpg', 'image/jpeg', 1, 'a');
    `)

    const objectKeys = await deleteCharacter(db, 1)

    expect(objectKeys).toEqual(['source-images/own.jpg'])
    expect(database.prepare('SELECT object_key FROM source_images ORDER BY commission_file_name').all())
      .toEqual([
        { object_key: 'source-images/shared.jpg' },
      ])
  })
})

describe('character rename and aliases', () => {
  const aliasRows = (database: ReturnType<typeof createSQLiteD1>['database']) =>
    database.prepare('SELECT character_name, aliases FROM character_aliases ORDER BY character_name').all()

  function seed() {
    const { database, db } = createSQLiteD1()
    database.exec(`
      CREATE TABLE IF NOT EXISTS character_aliases (character_name TEXT PRIMARY KEY, aliases TEXT NOT NULL);
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Old Name', 'active', 1);
      INSERT INTO characters (id, name, status, sort_order) VALUES (2, 'Other', 'active', 2);
    `)
    return { database, db }
  }

  it('moves aliases to the new name and leaves no row under the old one', async () => {
    const { database, db } = seed()
    database.exec('INSERT INTO character_aliases VALUES (\'Old Name\', \'["Alpha","Beta"]\')')

    await updateCharacter(db, { id: 1, name: 'New Name', status: 'active' })

    expect(aliasRows(database)).toEqual([
      { character_name: 'New Name', aliases: '["Alpha","Beta"]' },
    ])
  })

  it('merges with an orphan row already stored under the new name, deduplicating case-insensitively', async () => {
    const { database, db } = seed()
    database.exec(`
      INSERT INTO character_aliases VALUES ('Old Name', '["Alpha","Beta"]');
      INSERT INTO character_aliases VALUES ('new name', '["beta","Gamma"]');
    `)

    await updateCharacter(db, { id: 1, name: 'New Name', status: 'active' })

    const rows = aliasRows(database) as Array<{ character_name: string, aliases: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.character_name).toBe('New Name')
    expect(JSON.parse(rows[0]?.aliases ?? '[]')).toEqual(['beta', 'Gamma', 'Alpha'])
  })

  it('moves an alias row whose stored name differs from the old name only by case and spacing', async () => {
    const { database, db } = seed()
    database.exec('INSERT INTO character_aliases VALUES (\'old  NAME\', \'["Alpha"]\')')

    await updateCharacter(db, { id: 1, name: 'New Name', status: 'active' })

    expect(aliasRows(database)).toEqual([
      { character_name: 'New Name', aliases: '["Alpha"]' },
    ])
  })

  it('renames a character that has no aliases', async () => {
    const { database, db } = seed()

    await updateCharacter(db, { id: 1, name: 'New Name', status: 'archived' })

    expect(database.prepare('SELECT name, status FROM characters WHERE id = 1').get())
      .toEqual({ name: 'New Name', status: 'archived' })
    expect(aliasRows(database)).toEqual([])
  })

  it('leaves both tables unchanged when the new name collides with another character', async () => {
    const { database, db } = seed()
    database.exec('INSERT INTO character_aliases VALUES (\'Old Name\', \'["Alpha"]\')')

    await expect(updateCharacter(db, { id: 1, name: 'Other', status: 'active' })).rejects.toThrow()

    expect(database.prepare('SELECT name FROM characters WHERE id = 1').get()).toEqual({ name: 'Old Name' })
    expect(aliasRows(database)).toEqual([
      { character_name: 'Old Name', aliases: '["Alpha"]' },
    ])
  })
})

describe('source-image metadata replacement', () => {
  const metadata = (commissionFileName: string, objectKey: string) => ({
    commissionFileName,
    objectKey,
    mimeType: 'image/png',
    byteSize: 34,
    sha256: 'new-hash',
  })

  it('upserts the row for an existing commission', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`
      INSERT INTO characters (id, name, status, sort_order) VALUES (1, 'Fixture', 'active', 1);
      INSERT INTO commissions (id, character_id, file_name, commission_date, creator_name, links) VALUES (7, 1, 'kept', '2025-03-02', 'Creator', '[]');
      INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256)
        VALUES ('kept', 7, 'source-images/old.jpg', 'image/jpeg', 12, 'old-hash');
    `)

    await saveSourceImageMetadata(db, metadata('kept', 'source-images/new.png'))

    expect(database.prepare('SELECT commission_file_name, commission_id, object_key, mime_type, byte_size, sha256 FROM source_images').all())
      .toEqual([
        {
          commission_file_name: 'kept',
          commission_id: 7,
          object_key: 'source-images/new.png',
          mime_type: 'image/png',
          byte_size: 34,
          sha256: 'new-hash',
        },
      ])
  })

  it('rejects a commission deleted before the write and stores no orphan row', async () => {
    const { database, db } = createSQLiteD1()

    await expect(saveSourceImageMetadata(db, metadata('gone', 'source-images/new.png')))
      .rejects
      .toThrow('Commission not found.')
    expect(database.prepare('SELECT * FROM source_images').all()).toEqual([])
  })
})

describe('character order at scale', () => {
  it('reorders 150 characters across both statuses in one batch within the D1 bound-parameter limit', async () => {
    const { database, db, batchCallCount } = createSQLiteD1()
    database.exec('BEGIN')
    for (let id = 1; id <= 150; id += 1) {
      database.prepare('INSERT INTO characters (id, name, status, sort_order) VALUES (?, ?, ?, ?)')
        .run(id, `Character ${id}`, id <= 75
          ? 'active'
          : 'archived', id)
    }
    database.exec('COMMIT')
    // Reverse the order and swap the two status groups.
    const archived = Array.from({ length: 75 }, (_, index) => 75 - index)
    const active = Array.from({ length: 75 }, (_, index) => 150 - index)

    await updateCharacterOrder(db, { active, archived })

    expect(batchCallCount()).toBe(1)
    const rows = database.prepare('SELECT id, status FROM characters ORDER BY sort_order').all()
    expect(rows).toEqual([
      ...active.map(id => ({ id, status: 'active' })),
      ...archived.map(id => ({ id, status: 'archived' })),
    ])
  })

  it('still rejects an unknown identifier among many without writing', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('BEGIN')
    for (let id = 1; id <= 120; id += 1) {
      database.prepare('INSERT INTO characters (id, name, status, sort_order) VALUES (?, ?, \'active\', ?)').run(id, `C${id}`, id)
    }
    database.exec('COMMIT')

    await expect(updateCharacterOrder(db, {
      active: [
        ...Array.from({ length: 120 }, (_, index) => index + 1),
        999,
      ],
      archived: [],
    })).rejects.toThrow('Character order payload must include existing character identifiers only.')
    expect(database.prepare('SELECT sort_order FROM characters WHERE id = 1').get()).toEqual({ sort_order: 1 })
  })
})

describe('character creation order', () => {
  it('gives concurrent creates distinct sort_order values', async () => {
    const { database, db } = createSQLiteD1()

    await Promise.all([
      createCharacter(db, { name: 'A', status: 'active' }),
      createCharacter(db, { name: 'B', status: 'active' }),
    ])

    expect(database.prepare('SELECT DISTINCT sort_order FROM characters').all()).toHaveLength(2)
  })

  it('appends after the highest sort_order', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'A\', \'active\', 7)')

    await createCharacter(db, { name: 'B', status: 'archived' })
    await createCharacter(db, { name: 'C', status: 'active' })

    expect(database.prepare('SELECT name, status, sort_order FROM characters ORDER BY id').all()).toEqual([
      { name: 'A', status: 'active', sort_order: 7 },
      { name: 'B', status: 'archived', sort_order: 8 },
      { name: 'C', status: 'active', sort_order: 9 },
    ])
  })
})

describe('alias batch key normalization', () => {
  const rows = (database: ReturnType<typeof createSQLiteD1>['database'], table: string, key: string) =>
    database.prepare(`SELECT ${key} AS name, aliases FROM ${table} ORDER BY ${key}`).all()

  it('replaces every keyword alias row with the same normalized key and deletes them all on an empty save', async () => {
    const { database, db } = createSQLiteD1()

    await saveKeywordAliasesBatch(db, [
      {
        baseKeyword: 'Full Body',
        aliases: ['fb'],
      },
    ])
    await saveKeywordAliasesBatch(db, [
      {
        baseKeyword: 'full  body',
        aliases: ['fullbody'],
      },
    ])
    expect(rows(database, 'keyword_aliases', 'base_keyword')).toEqual([
      { name: 'full body', aliases: '["fullbody"]' },
    ])

    await saveKeywordAliasesBatch(db, [
      { baseKeyword: 'FULL BODY', aliases: [] },
    ])
    expect(rows(database, 'keyword_aliases', 'base_keyword')).toEqual([])
  })

  it('collapses pre-existing duplicate keyword rows into one canonical row', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`INSERT INTO keyword_aliases (base_keyword, aliases) VALUES ('Full Body', '["a"]'), ('full body', '["b"]'), ('Other', '["o"]')`)

    await saveKeywordAliasesBatch(db, [
      {
        baseKeyword: 'Full Body',
        aliases: ['c'],
      },
    ])

    expect(rows(database, 'keyword_aliases', 'base_keyword')).toEqual([
      { name: 'Full Body', aliases: '["c"]' },
      { name: 'Other', aliases: '["o"]' },
    ])
  })

  it('replaces every character alias row with the same normalized key and deletes them all on an empty save', async () => {
    const { database, db } = createSQLiteD1()

    await saveCharacterAliasesBatch(db, [
      {
        characterName: 'Aria Rose',
        aliases: ['ar'],
      },
    ])
    await saveCharacterAliasesBatch(db, [
      {
        characterName: 'aria rose',
        aliases: ['rose'],
      },
    ])
    expect(rows(database, 'character_aliases', 'character_name')).toEqual([
      { name: 'aria rose', aliases: '["rose"]' },
    ])

    await saveCharacterAliasesBatch(db, [
      { characterName: 'ARIA  ROSE', aliases: '' },
    ])
    expect(rows(database, 'character_aliases', 'character_name')).toEqual([])
  })

  it('keeps creator keys case-sensitive but replaces rows stored with a (part N) suffix', async () => {
    const { database, db } = createSQLiteD1()
    database.exec(`INSERT INTO creator_aliases (creator_name, aliases) VALUES ('Q (part 2)', '["old"]'), ('q', '["lower"]')`)

    await saveCreatorAliasesBatch(db, [
      {
        creatorName: 'Q',
        aliases: ['new'],
      },
    ])
    expect(rows(database, 'creator_aliases', 'creator_name')).toEqual([
      { name: 'Q', aliases: '["new"]' },
      { name: 'q', aliases: '["lower"]' },
    ])

    database.exec(`INSERT INTO creator_aliases (creator_name, aliases) VALUES ('Q (part 3)', '["stale"]')`)
    await saveCreatorAliasesBatch(db, [
      { creatorName: 'Q (part 1)', aliases: [] },
    ])
    expect(rows(database, 'creator_aliases', 'creator_name')).toEqual([
      { name: 'q', aliases: '["lower"]' },
    ])
  })
})

describe('persistence-side commission validation', () => {
  it('refuses invalid dates and work-group pairs on direct calls without writing', async () => {
    const { database, db } = createSQLiteD1()
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'Fixture\', \'active\', 1)')
    const sourceImage = {
      commissionFileName: 'invalid',
      objectKey: 'source-images/invalid.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash',
    }
    const base = {
      characterId: 1,
      commissionDate: '2025-03-02',
      fileName: 'invalid',
      links: [],
    }

    await expect(createCommission(db, { ...base, commissionDate: '2025-3-2' }, sourceImage))
      .rejects
      .toThrow('Commission date must use YYYY-MM-DD format.')
    await expect(createCommission(db, { ...base, commissionDate: '2025-02-30' }, sourceImage))
      .rejects
      .toThrow('Commission date must be a real calendar date.')
    await expect(createCommission(db, { ...base, workGroupId: 'new' }, sourceImage))
      .rejects
      .toThrow('Work group and part number must be set together.')
    await expect(createCommission(db, { ...base, workGroupId: 'not-a-uuid', partNumber: 1 }, sourceImage))
      .rejects
      .toThrow('Work group must be a lowercase UUID v4.')
    await expect(createCommission(db, { ...base, workGroupId: 'new', partNumber: 0 }, sourceImage))
      .rejects
      .toThrow('Part number must be a positive integer.')
    expect(database.prepare('SELECT COUNT(*) AS count FROM commissions').get()).toEqual({ count: 0 })
  })
})

describe('runtime source_images DDL', () => {
  function describeTable(database: ReturnType<typeof createSQLiteD1>['database']) {
    return {
      columns: database.prepare('PRAGMA table_info(source_images)').all(),
      foreignKeys: database.prepare('PRAGMA foreign_key_list(source_images)').all(),
    }
  }

  // Only the alias/featured/source_images tables have runtime DDL, so the database keeps the migrated
  // characters/commissions tables and loses source_images, which ensureSourceImagesTable must then recreate.
  it('recreates a source_images table that accepts a commission create and a metadata save', async () => {
    const migrated = createSQLiteD1()
    const { database, db } = createSQLiteD1()
    database.exec('DROP TABLE source_images')
    database.exec('INSERT INTO characters (id, name, status, sort_order) VALUES (1, \'Fixture\', \'active\', 1)')

    await createCommission(db, {
      characterId: 1,
      commissionDate: '2025-03-02',
      fileName: 'runtime-ddl',
      links: [],
    }, {
      commissionFileName: 'runtime-ddl',
      objectKey: 'source-images/runtime-ddl-a.jpg',
      mimeType: 'image/jpeg',
      byteSize: 12,
      sha256: 'hash-a',
    })
    await saveSourceImageMetadata(db, {
      commissionFileName: 'runtime-ddl',
      objectKey: 'source-images/runtime-ddl-b.png',
      mimeType: 'image/png',
      byteSize: 34,
      sha256: 'hash-b',
    })

    expect(describeTable(database)).toEqual(describeTable(migrated.database))
    expect(database.prepare('SELECT commission_id, object_key, mime_type FROM source_images').all()).toEqual([
      { commission_id: 1, object_key: 'source-images/runtime-ddl-b.png', mime_type: 'image/png' },
    ])
  })
})
