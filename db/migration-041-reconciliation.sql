-- Migration 041: Guild ↔ Discord roster reconciliation
-- Adds:
--   1. discord_members table — bulk cache of every Discord guild member so we can
--      detect "site user has discord_id but is no longer in the server" and
--      "Discord member with no site account".
--   2. Officer/public notes + addon-seen columns on guild_members so notes read
--      in-game via the MDGA addon reach the reconciliation dashboard.
--   3. reconciliation_ignored_until — per-row mute so officers can dismiss a
--      reconciliation row (e.g. intentional alt without main) for N days.
--   4. addon_ingests — audit + dedup log for paste-based addon ingests.

CREATE TABLE IF NOT EXISTS discord_members (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id      VARCHAR(32)  NOT NULL,
  username        VARCHAR(100) DEFAULT NULL,
  display_name    VARCHAR(100) DEFAULT NULL,
  nickname        VARCHAR(100) DEFAULT NULL,
  joined_at       DATETIME     DEFAULT NULL,
  is_in_guild     BOOLEAN NOT NULL DEFAULT TRUE,
  roles_json      JSON         DEFAULT NULL,
  last_synced_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at         DATETIME     DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_discord_id (discord_id),
  INDEX idx_dm_in_guild (is_in_guild),
  INDEX idx_dm_last_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE guild_members
  ADD COLUMN officer_note VARCHAR(128) DEFAULT NULL,
  ADD COLUMN public_note  VARCHAR(128) DEFAULT NULL,
  ADD COLUMN addon_last_seen  DATETIME DEFAULT NULL,
  ADD COLUMN addon_ingested_at DATETIME DEFAULT NULL,
  ADD COLUMN reconciliation_ignored_until DATETIME DEFAULT NULL;

CREATE TABLE IF NOT EXISTS addon_ingests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ingested_by_user_id INT UNSIGNED NOT NULL,
  ingested_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  roster_count    INT UNSIGNED NOT NULL DEFAULT 0,
  event_count     INT UNSIGNED NOT NULL DEFAULT 0,
  matched_count   INT UNSIGNED NOT NULL DEFAULT 0,
  unmatched_count INT UNSIGNED NOT NULL DEFAULT 0,
  raw_blob_hash   CHAR(64) NOT NULL COMMENT 'SHA-256 of canonical JSON payload for dedup',
  source          VARCHAR(20) NOT NULL DEFAULT 'paste' COMMENT 'paste | companion',

  UNIQUE KEY uq_ai_hash (raw_blob_hash),
  INDEX idx_ai_ingested_at (ingested_at),
  FOREIGN KEY (ingested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
