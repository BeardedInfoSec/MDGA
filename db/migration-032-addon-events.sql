-- Migration 032: Addon events table for WoW addon real-time data
-- Stores events captured by the in-game addon and submitted via companion app.
-- Dedup relies on UNIQUE(event_id) — addon generates IDs as "evt_{timestamp}_{counter}".

CREATE TABLE IF NOT EXISTS addon_events (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id        VARCHAR(100) NOT NULL COMMENT 'Addon-generated unique event ID (evt_timestamp_counter)',
  guild_id        INT UNSIGNED NOT NULL,
  event_type      VARCHAR(30)  NOT NULL COMMENT 'rank_change, join, leave, online, offline',
  character_name  VARCHAR(100) NOT NULL,
  realm_slug      VARCHAR(100) NOT NULL,
  event_data      JSON DEFAULT NULL,
  event_timestamp BIGINT UNSIGNED NOT NULL COMMENT 'Unix epoch seconds from addon',
  submitted_by    INT UNSIGNED NOT NULL COMMENT 'User ID who submitted via companion app',
  submitted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,

  UNIQUE INDEX uq_addon_event_id (event_id),
  INDEX idx_ae_guild_time (guild_id, event_timestamp DESC),
  INDEX idx_ae_type (event_type),
  INDEX idx_ae_processed (processed),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
