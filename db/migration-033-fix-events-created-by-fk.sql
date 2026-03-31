-- Migration 033: Fix events.created_by foreign key
-- FK incorrectly references admin_users(id) but should reference users(id)

-- Dynamically find and drop the old FK constraint
SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'events'
    AND COLUMN_NAME = 'created_by'
    AND REFERENCED_TABLE_NAME = 'admin_users'
  LIMIT 1
);

SET @drop_sql = IF(@fk_name IS NOT NULL,
  CONCAT('ALTER TABLE events DROP FOREIGN KEY `', @fk_name, '`'),
  'SELECT 1');
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add correct FK pointing to users table
ALTER TABLE events
  ADD CONSTRAINT fk_events_created_by_user
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
