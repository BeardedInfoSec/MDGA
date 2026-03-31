USE `mdga_core-xTa5dfGz`;

-- Add officer_only flag to forum categories
ALTER TABLE forum_categories ADD COLUMN officer_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Move Guild Announcements to top (sort_order 0) and mark officer-only
UPDATE forum_categories SET sort_order = 0, officer_only = TRUE WHERE name = 'Guild Announcements';
