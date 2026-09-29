-- 将作品业务元数据与历史文件名分离；旧文件名继续作为兼容期资产键保留。
ALTER TABLE commissions ADD COLUMN commission_date TEXT;
ALTER TABLE commissions ADD COLUMN creator_name TEXT;

UPDATE commissions
SET
  commission_date = substr(file_name, 1, 4) || '-' || substr(file_name, 5, 2) || '-' || substr(file_name, 7, 2),
  creator_name = CASE
    WHEN length(file_name) > 9 THEN substr(file_name, 10)
    ELSE NULL
  END
WHERE commission_date IS NULL;

ALTER TABLE source_images ADD COLUMN commission_id INTEGER REFERENCES commissions(id) ON DELETE CASCADE;

UPDATE source_images
SET commission_id = (
  SELECT commissions.id
  FROM commissions
  WHERE commissions.file_name = source_images.commission_file_name
)
WHERE EXISTS (
  SELECT 1 FROM commissions
  WHERE commissions.file_name = source_images.commission_file_name
);

CREATE UNIQUE INDEX idx_source_images_commission_id
  ON source_images(commission_id)
  WHERE commission_id IS NOT NULL;
CREATE INDEX idx_commissions_character_date
  ON commissions(character_id, commission_date DESC, id DESC);
CREATE INDEX idx_characters_sort_order ON characters(sort_order);
DROP INDEX idx_source_images_object_key;
