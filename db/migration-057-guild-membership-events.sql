-- migration-057: append-only feed of characters joining/leaving tracked
-- guilds (rapazzini forum #31). guild-sync diffs the roster on every cycle
-- and inserts a row here per character that crossed the boundary.

CREATE TABLE IF NOT EXISTS guild_membership_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id INT UNSIGNED NOT NULL,
  character_name VARCHAR(100) NOT NULL,
  realm_slug VARCHAR(100) NOT NULL,
  event_type ENUM('joined', 'left') NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY occurred_at (occurred_at),
  KEY guild_id (guild_id),
  CONSTRAINT fk_gme_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
