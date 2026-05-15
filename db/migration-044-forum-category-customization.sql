-- Migration 044: per-category customization for the forum.
-- Lets admins style each category independently (Reddit-like) instead of
-- relying on the hardcoded CATEGORY_ICONS map in the React client.
USE `mdga_core-xTa5dfGz`;

ALTER TABLE forum_categories
  ADD COLUMN icon         VARCHAR(50)  NULL DEFAULT NULL COMMENT 'Lucide icon name OR single emoji codepoint, e.g. "MessageCircle" or "💬"',
  ADD COLUMN accent_color CHAR(7)      NULL DEFAULT NULL COMMENT 'Hex color #RRGGBB used for the category accent strip',
  ADD COLUMN banner_url   VARCHAR(500) NULL DEFAULT NULL COMMENT 'Optional banner image URL';

-- Backfill icons for the seeded categories so existing forum index keeps
-- looking right after the client switches to reading from the DB.
UPDATE forum_categories SET icon = '💬' WHERE name = 'General Discussion' AND icon IS NULL;
UPDATE forum_categories SET icon = '⚔️' WHERE name = 'PvP Strategy'      AND icon IS NULL;
UPDATE forum_categories SET icon = '📋' WHERE name = 'Recruitment'        AND icon IS NULL;
UPDATE forum_categories SET icon = '🎮' WHERE name = 'Off-Topic'          AND icon IS NULL;
UPDATE forum_categories SET icon = '📢' WHERE name = 'Guild Announcements' AND icon IS NULL;
