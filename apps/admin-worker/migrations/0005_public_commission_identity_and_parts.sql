-- 为每条作品增加稳定公开身份，并把已确认的多部分作品显式建模。
CREATE TABLE commission_groups (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE commissions ADD COLUMN public_id TEXT;
ALTER TABLE commissions ADD COLUMN work_group_id TEXT REFERENCES commission_groups(id) ON DELETE RESTRICT;
ALTER TABLE commissions ADD COLUMN part_number INTEGER;

-- 回填 UUID v4；整数 id 继续服务内部关系与既有排序。
UPDATE commissions
SET public_id = lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', (random() & 3) + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)));

CREATE UNIQUE INDEX idx_commissions_public_id ON commissions(public_id);
CREATE UNIQUE INDEX idx_commissions_work_group_part
  ON commissions(work_group_id, part_number)
  WHERE work_group_id IS NOT NULL AND part_number IS NOT NULL;

-- 六组 Part 1/2 由只读生产快照中的精确文件名确认；Part 记录和图片均独立保留。
INSERT INTO commission_groups (id) VALUES
  ('a1d30840-d212-4f3b-a814-7cab2f443ac1'),
  ('a2e41951-e323-4a4c-b925-8dbc30554bd2'),
  ('b3f52a62-f434-4b5d-8a36-9ecd41665ce3'),
  ('c4063b73-a545-4c6e-9b47-afde52776df4'),
  ('d5174c84-b656-4d7f-ac58-b0ef63887e05'),
  ('e6285d95-c767-4e80-bd69-c1f074998f16');

CREATE TRIGGER commission_groups_require_uuid_insert
BEFORE INSERT ON commission_groups
WHEN NEW.id != lower(NEW.id)
  OR NEW.id NOT GLOB '????????-????-4???-[89ab]???-????????????'
  OR NEW.id GLOB '*[^0-9a-f-]*'
BEGIN
  SELECT RAISE(ABORT, 'commission_groups.id must be a lowercase UUID v4');
END;

CREATE TRIGGER commission_groups_immutable_id
BEFORE UPDATE OF id ON commission_groups
WHEN NEW.id != OLD.id
BEGIN
  SELECT RAISE(ABORT, 'commission_groups.id is immutable');
END;

UPDATE commissions
SET creator_name = 'Q', work_group_id = 'a1d30840-d212-4f3b-a814-7cab2f443ac1', part_number = 1
WHERE file_name = '20250930_Q (part 1)' AND creator_name = 'Q (part 1)';
UPDATE commissions
SET creator_name = 'Q', work_group_id = 'a1d30840-d212-4f3b-a814-7cab2f443ac1', part_number = 2
WHERE file_name = '20250930_Q (part 2)' AND creator_name = 'Q (part 2)';

UPDATE commissions
SET creator_name = 'Q', work_group_id = 'a2e41951-e323-4a4c-b925-8dbc30554bd2', part_number = 1
WHERE file_name = '20241230_Q (part 1)' AND creator_name = 'Q (part 1)';
UPDATE commissions
SET creator_name = 'Q', work_group_id = 'a2e41951-e323-4a4c-b925-8dbc30554bd2', part_number = 2
WHERE file_name = '20241230_Q (part 2)' AND creator_name = 'Q (part 2)';

UPDATE commissions
SET creator_name = 'Q', work_group_id = 'b3f52a62-f434-4b5d-8a36-9ecd41665ce3', part_number = 1
WHERE file_name = '20241027_Q (part 1)' AND creator_name = 'Q (part 1)';
UPDATE commissions
SET creator_name = 'Q', work_group_id = 'b3f52a62-f434-4b5d-8a36-9ecd41665ce3', part_number = 2
WHERE file_name = '20241027_Q (part 2)' AND creator_name = 'Q (part 2)';

UPDATE commissions
SET creator_name = 'Q', work_group_id = 'c4063b73-a545-4c6e-9b47-afde52776df4', part_number = 1
WHERE file_name = '20240819_Q (part 1)' AND creator_name = 'Q (part 1)';
UPDATE commissions
SET creator_name = 'Q', work_group_id = 'c4063b73-a545-4c6e-9b47-afde52776df4', part_number = 2
WHERE file_name = '20240819_Q (part 2)' AND creator_name = 'Q (part 2)';

UPDATE commissions
SET creator_name = 'Q', work_group_id = 'd5174c84-b656-4d7f-ac58-b0ef63887e05', part_number = 1
WHERE file_name = '20250302_Q (part 1)' AND creator_name = 'Q (part 1)';
UPDATE commissions
SET creator_name = 'Q', work_group_id = 'd5174c84-b656-4d7f-ac58-b0ef63887e05', part_number = 2
WHERE file_name = '20250302_Q (part 2)' AND creator_name = 'Q (part 2)';

UPDATE commissions
SET creator_name = 'Gisyu', work_group_id = 'e6285d95-c767-4e80-bd69-c1f074998f16', part_number = 1
WHERE file_name = '20240421_Gisyu (part 1)' AND creator_name = 'Gisyu (part 1)';
UPDATE commissions
SET creator_name = 'Gisyu', work_group_id = 'e6285d95-c767-4e80-bd69-c1f074998f16', part_number = 2
WHERE file_name = '20240421_Gisyu (part 2)' AND creator_name = 'Gisyu (part 2)';

-- 任何一条精确映射缺失或分组形态不完整，都中止迁移而非悄悄上线半套数据。
CREATE TABLE migration_0005_assertions (
  valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO migration_0005_assertions (valid)
SELECT CASE
  WHEN (SELECT count(*) FROM commissions WHERE file_name IN (
    '20250930_Q (part 1)', '20250930_Q (part 2)',
    '20241230_Q (part 1)', '20241230_Q (part 2)',
    '20241027_Q (part 1)', '20241027_Q (part 2)',
    '20240819_Q (part 1)', '20240819_Q (part 2)',
    '20250302_Q (part 1)', '20250302_Q (part 2)',
    '20240421_Gisyu (part 1)', '20240421_Gisyu (part 2)'
  )) = 0
    OR ((SELECT count(*) FROM commissions WHERE work_group_id IS NOT NULL) = 12
      AND (
      SELECT count(*)
      FROM (
        SELECT work_group_id
        FROM commissions
        WHERE work_group_id IS NOT NULL
        GROUP BY work_group_id
        HAVING count(*) = 2 AND min(part_number) = 1 AND max(part_number) = 2
      )
      ) = 6)
    THEN 1
  ELSE 0
END;

DROP TABLE migration_0005_assertions;

-- 迁移与 Worker 发布之间旧版本仍可写入：缺少 public_id 的新行由 D1 立即补 UUID。
-- 新版本可显式提供 UUID；任何版本都不能在身份已生成后更换它。
CREATE TRIGGER commissions_validate_public_id_insert
BEFORE INSERT ON commissions
WHEN NEW.public_id IS NOT NULL
  AND (NEW.public_id != lower(NEW.public_id)
    OR NEW.public_id NOT GLOB '????????-????-4???-[89ab]???-????????????'
    OR NEW.public_id GLOB '*[^0-9a-f-]*')
BEGIN
  SELECT RAISE(ABORT, 'commissions.public_id must be a lowercase UUID v4');
END;

CREATE TRIGGER commissions_assign_public_id_after_insert
AFTER INSERT ON commissions
WHEN NEW.public_id IS NULL
BEGIN
  UPDATE commissions
  SET public_id = lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', (random() & 3) + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  WHERE id = NEW.id;
END;

CREATE TRIGGER commissions_require_public_id_update
BEFORE UPDATE OF public_id ON commissions
WHEN NEW.public_id IS NULL
  OR NEW.public_id != lower(NEW.public_id)
  OR NEW.public_id NOT GLOB '????????-????-4???-[89ab]???-????????????'
  OR NEW.public_id GLOB '*[^0-9a-f-]*'
  OR (OLD.public_id IS NOT NULL AND NEW.public_id != OLD.public_id)
BEGIN
  SELECT RAISE(ABORT, 'commissions.public_id is immutable and must be a lowercase UUID v4');
END;

CREATE TRIGGER commissions_validate_work_parts_insert
BEFORE INSERT ON commissions
WHEN (NEW.part_number IS NULL) != (NEW.work_group_id IS NULL)
  OR (NEW.part_number IS NOT NULL AND (typeof(NEW.part_number) != 'integer' OR NEW.part_number <= 0))
BEGIN
  SELECT RAISE(ABORT, 'work_group_id and positive integer part_number must be set together');
END;

CREATE TRIGGER commissions_validate_work_parts_update
BEFORE UPDATE OF work_group_id, part_number ON commissions
WHEN (NEW.part_number IS NULL) != (NEW.work_group_id IS NULL)
  OR (NEW.part_number IS NOT NULL AND (typeof(NEW.part_number) != 'integer' OR NEW.part_number <= 0))
BEGIN
  SELECT RAISE(ABORT, 'work_group_id and positive integer part_number must be set together');
END;
