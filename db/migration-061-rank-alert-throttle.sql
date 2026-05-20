-- migration-061: track when a rank-change alert was last sent for each
-- guild_members row so the bot doesn't spam the officer channel when
-- Blizzard's roster API flaps the same character between two ranks each
-- sync cycle (observed in prod: same "rank changed: 2 -> 1" alert every
-- 8 minutes for Wärchief). Throttle window: 1 hour by default.

ALTER TABLE guild_members
  ADD COLUMN last_rank_alert_at DATETIME NULL DEFAULT NULL AFTER previous_guild_rank;
