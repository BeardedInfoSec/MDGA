-- ================================================
-- MDGA Seed Data: Forum Categories & Events
-- Matches production data from mdga_core-xTa5dfGz
-- Run: mysql -u USER -p DATABASE < db/seed-forum-events.sql
-- ================================================

-- Forum Categories (5 categories from production)
INSERT INTO forum_categories (name, description, sort_order, officer_only) VALUES
  ('General Discussion',   'Talk about anything guild-related',          1, 0),
  ('PvP Strategy',         'Tactics, comps, and battlefield strategy',   2, 0),
  ('Recruitment',          'Looking for members or groups',              3, 0),
  ('Off-Topic',            'Non-WoW discussion',                        4, 0),
  ('Guild Announcements',  'Official announcements from officers',      5, 0)
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Events (6 recurring events from production, created_by = 1 assumes admin user)
INSERT INTO events (title, category, description, starts_at, ends_at, timezone, created_by) VALUES
  ('Durotar Patrol',     'defense', 'Tuesday, 8:00-10:00 PM EST',
   '2026-02-10 20:00:00', '2026-02-10 22:00:00', 'America/New_York', 1),
  ('PvP War Night',      'pvp',     'Thursday, 9:00-11:00 PM EST',
   '2026-02-12 21:00:00', '2026-02-12 23:00:00', 'America/New_York', 1),
  ('War Council',         'social',  'Sunday, 7:00-8:00 PM EST',
   '2026-02-15 19:00:00', '2026-02-15 20:00:00', 'America/New_York', 1),
  ('Arena Night',         'pvp',     'Saturday, 8:00-11:00 PM EST',
   '2026-02-14 20:00:00', '2026-02-14 23:00:00', 'America/New_York', 1),
  ('Emergency Defense',   'defense', 'On Call, Ping in Discord',
   NULL, NULL, 'America/New_York', 1),
  ('Raid Night',          'raid',    'Friday, 8:30-11:30 PM EST',
   '2026-02-13 20:30:00', '2026-02-13 23:30:00', 'America/New_York', 1);
