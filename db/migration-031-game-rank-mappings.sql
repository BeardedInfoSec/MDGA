-- Migration 031: Game rank to Discord role mappings
-- Maps WoW guild rank indices (0=GM, 1=Officer, etc.) to Discord role IDs
-- Used by guild-sync to auto-assign Discord roles when in-game rank changes
CREATE TABLE IF NOT EXISTS game_rank_mappings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id INT UNSIGNED NOT NULL,
  game_rank INT NOT NULL COMMENT 'WoW guild rank index (0=GM, higher=lower rank)',
  game_rank_name VARCHAR(100) DEFAULT NULL,
  discord_role_id VARCHAR(20) DEFAULT NULL COMMENT 'Discord role to assign for this game rank',
  site_rank ENUM('recruit','member','veteran','officer','guildmaster') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guild_game_rank (guild_id, game_rank),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Also add previous_guild_rank to guild_members for change detection
ALTER TABLE guild_members
  ADD COLUMN previous_guild_rank INT DEFAULT NULL AFTER guild_rank;
