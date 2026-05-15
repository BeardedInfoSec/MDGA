-- ============================================
-- Add a per-user "lock" flag that prevents the periodic Discord-role sync
-- from overwriting a manually-set rank. When TRUE, discord-role-sync
-- skips the user entirely. Default FALSE so existing users stay
-- auto-synced unless an admin explicitly locks them.
-- ============================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'rank_locked'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN rank_locked BOOLEAN NOT NULL DEFAULT FALSE AFTER `rank`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
