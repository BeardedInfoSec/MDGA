-- migration-062: pre-drop hype warnings for scheduled giveaways. When a
-- giveaway-enabled post has a future forum_posts.publish_at, the new
-- warning_minutes array describes how many minutes BEFORE that publish
-- time the bot should post a "X minutes until the drop" announcement.
-- warnings_sent tracks which intervals have already fired so a scheduler
-- restart doesn't double-send.
--
-- Example: warning_minutes = [30, 15, 5]
--   publish_at = 2026-05-21 13:00:00
--   → at 12:30, 12:45, 12:55 the bot posts a warning
--   → at 13:00 the post goes live + the existing kickoff message fires

ALTER TABLE giveaway_configs
  ADD COLUMN warning_minutes JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER rate_limit_seconds,
  ADD COLUMN warnings_sent JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER winners,
  -- NULL = kickoff "Giveaway started" message has NOT been sent yet
  -- (scheduled post still hidden). Set to NOW() when the kickoff fires.
  -- Lets us defer the kickoff for scheduled posts so the Discord ping
  -- lands when the post actually becomes visible, not when officers save
  -- the config minutes/hours earlier.
  ADD COLUMN kickoff_announced_at TIMESTAMP NULL DEFAULT NULL AFTER announced;

-- Existing configs were created under the old "kickoff fires on save"
-- behavior, so backfill them as already-announced.
UPDATE giveaway_configs SET kickoff_announced_at = created_at WHERE kickoff_announced_at IS NULL;
