-- ============================================
-- Fix table charsets: convert binary → utf8mb4
-- Skips tables that don't exist yet
-- ============================================

-- Change the database default so new tables get utf8mb4 automatically
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Convert each table (wrapped in a procedure so missing tables don't halt the script)
DELIMITER //
CREATE PROCEDURE _fix_charset()
BEGIN
  DECLARE CONTINUE HANDLER FOR 1146 BEGIN END;

  ALTER TABLE guilds CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE guild_members CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE guild_achievements CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE guild_activity CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE guild_member_stats CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE user_characters CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE forum_categories CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE forum_threads CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE forum_comments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE applications CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE events CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE pvp_stats CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE role_permissions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER TABLE user_roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
END //
DELIMITER ;

CALL _fix_charset();
DROP PROCEDURE _fix_charset;
