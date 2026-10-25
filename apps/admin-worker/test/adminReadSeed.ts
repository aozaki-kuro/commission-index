import type { DatabaseSync } from 'node:sqlite'

// Rows behind the admin read-route contract payloads. Adding a commission changes every
// bootstrap/alias count, so extend this only together with the expectations that read it.
export function seedAdminReadFixture(database: DatabaseSync) {
  database.exec(`
    INSERT INTO characters (id, name, status, sort_order) VALUES
      (1, 'Alice', 'active', 1),
      (2, 'Beta', 'archived', 2);

    INSERT INTO commissions (
      id, public_id, character_id, commission_date, creator_name, work_group_id, part_number,
      file_name, links, design, description, keyword, hidden
    ) VALUES
      (10, 'a0ed1441-77c3-4f23-9f81-6d7c3ac95431', 1, '2025-03-01', 'alice-maker', NULL, NULL,
        '20250301_alice-maker', '["https://alice.example/a","https://alice.example/b"]',
        'maid outfit', 'soft lighting', 'maid, cafe', 0),
      (11, 'b1ed1441-77c3-4f23-9f81-6d7c3ac95432', 2, '2024-01-05', 'beta-maker', NULL, NULL,
        '20240105_beta-maker', '["https://beta.example/1"]',
        'armor', 'battle scene', 'armor', 1);

    -- Commission 11 deliberately has no source-image metadata.
    INSERT INTO source_images (commission_file_name, commission_id, object_key, mime_type, byte_size, sha256) VALUES
      ('20250301_alice-maker', 10, 'source-images/commission-opaque-key/hash.jpg', 'image/jpeg', 3, 'hash');

    INSERT INTO creator_aliases (creator_name, aliases) VALUES ('maker', '["mk"]');
    INSERT INTO character_aliases (character_name, aliases) VALUES ('Alice', '["Alicia"]'), ('Beta', '["B"]');
    INSERT INTO keyword_aliases (base_keyword, aliases) VALUES ('maid', '["uniform"]');
    INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES ('maid', 1), ('maker', 2);
  `)
}
