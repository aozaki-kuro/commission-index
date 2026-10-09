import { describe, expect, it } from 'vitest'
import { createSQLiteD1 } from '../test/sqliteD1'
import { createCommission, deleteCharacter, saveHomeFeaturedSearchKeywords, updateCharacterOrder } from './adminPersistence'

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
      .toEqual([{ keyword: 'old-a' }, { keyword: 'old-b' }])
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
      .toEqual([{ object_key: 'source-images/kept.jpg' }])
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
      .toEqual([{ object_key: 'source-images/shared.jpg' }])
  })
})
