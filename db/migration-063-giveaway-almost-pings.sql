-- migration-063: track "one valid reply away from a slot fill" pings so
-- the bot fires a hype heads-up exactly once per target position. Used
-- by the post-comment hook: when the valid-comment counter just hit
-- target - 1, we want to ping Discord with "Slot #N fills on the next
-- valid reply!" but only if we haven't pinged for that slot already.

ALTER TABLE giveaway_configs
  ADD COLUMN almost_announced JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER announced;
