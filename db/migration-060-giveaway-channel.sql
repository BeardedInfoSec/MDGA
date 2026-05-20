-- migration-060: per-giveaway Discord channel for winner announcements.
-- The first cut posted to the officer channel; admins want to switch
-- between a private test channel and the public Events channel per drop,
-- so we store the target channel directly on the config row.
-- NULL = fall back to DISCORD_OFFICER_CHANNEL_ID env var.

ALTER TABLE giveaway_configs
  ADD COLUMN channel_id VARCHAR(32) NULL DEFAULT NULL AFTER rate_limit_seconds;
