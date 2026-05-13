-- ============================================
-- Federation: seed child guilds (MDGA on every realm + MEGA Moon Guard)
-- and link user_characters to a specific guild row.
-- ============================================

-- 1. Seed child guilds. Tichondrius primary already exists from migration-023;
--    everything else inserts as non-primary. ON DUPLICATE KEY makes this re-runnable.
INSERT INTO guilds (name, realm_slug, name_slug, faction, is_primary) VALUES
  ('Make Durotar Great Again', 'area-52',     'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'arthas',      'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'darkspear',   'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'illidan',     'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'thrall',      'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'barthilas',   'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'farstriders', 'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'sargeras',    'make-durotar-great-again', 'HORDE',    FALSE),
  ('Make Durotar Great Again', 'moonrunner',  'make-durotar-great-again', 'ALLIANCE', FALSE),
  ('Make Elwynn Great Again',  'moon-guard',  'make-elwynn-great-again',  'ALLIANCE', FALSE)
ON DUPLICATE KEY UPDATE name = VALUES(name), faction = VALUES(faction);

-- 2. Add guild_id FK on user_characters so each linked character points at the
--    specific child guild it belongs to (NULL = guildless / not yet resolved).
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'user_characters'
    AND COLUMN_NAME  = 'guild_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE user_characters ADD COLUMN guild_id INT UNSIGNED DEFAULT NULL AFTER faction',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'user_characters'
    AND INDEX_NAME   = 'idx_uc_guild'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE user_characters ADD INDEX idx_uc_guild (guild_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA   = DATABASE()
    AND TABLE_NAME     = 'user_characters'
    AND CONSTRAINT_NAME = 'fk_uc_guild'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE user_characters ADD CONSTRAINT fk_uc_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Backfill guild_id by matching existing user_characters to the registered
--    child guilds via (guild_name, realm_slug).
UPDATE user_characters uc
JOIN guilds g
  ON UPPER(TRIM(uc.guild_name)) = UPPER(TRIM(g.name))
 AND uc.realm_slug = g.realm_slug
SET uc.guild_id = g.id
WHERE uc.guild_id IS NULL;
