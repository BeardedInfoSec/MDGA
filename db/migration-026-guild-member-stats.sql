-- Migration 025: Guild member stats for guild-wide leaderboards
-- Stores per-character detailed stats fetched from Blizzard API for all guild members

CREATE TABLE IF NOT EXISTS guild_member_stats (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_member_id      INT UNSIGNED NOT NULL,
  arena_2v2            INT UNSIGNED DEFAULT 0,
  arena_3v3            INT UNSIGNED DEFAULT 0,
  solo_shuffle         INT UNSIGNED DEFAULT 0,
  rbg_rating           INT UNSIGNED DEFAULT 0,
  honorable_kills      INT UNSIGNED DEFAULT 0,
  killing_blows        INT UNSIGNED DEFAULT 0,
  arenas_played        INT UNSIGNED DEFAULT 0,
  arenas_won           INT UNSIGNED DEFAULT 0,
  arenas_lost          INT UNSIGNED DEFAULT 0,
  bgs_played           INT UNSIGNED DEFAULT 0,
  bgs_won              INT UNSIGNED DEFAULT 0,
  total_deaths         INT UNSIGNED DEFAULT 0,
  creatures_killed     INT UNSIGNED DEFAULT 0,
  dungeons_entered     INT UNSIGNED DEFAULT 0,
  raids_entered        INT UNSIGNED DEFAULT 0,
  quests_completed     INT UNSIGNED DEFAULT 0,
  achievement_points   INT UNSIGNED DEFAULT 0,
  mythic_plus_rating   INT UNSIGNED DEFAULT 0,
  item_level           INT UNSIGNED DEFAULT 0,
  highest_mplus_key    INT UNSIGNED DEFAULT 0,
  mythic_bosses_killed INT UNSIGNED DEFAULT 0,
  spec                 VARCHAR(50) DEFAULT NULL,
  fetched_at           TIMESTAMP NULL DEFAULT NULL,

  UNIQUE INDEX uq_gms_member (guild_member_id),
  FOREIGN KEY (guild_member_id) REFERENCES guild_members(id) ON DELETE CASCADE,
  INDEX idx_gms_solo_shuffle (solo_shuffle DESC),
  INDEX idx_gms_achievement (achievement_points DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add spec column to guild_members for display in leaderboard
ALTER TABLE guild_members ADD COLUMN spec VARCHAR(50) DEFAULT NULL;
