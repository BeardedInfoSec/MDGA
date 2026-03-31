-- ============================================
-- Guild Integration Tables
-- ============================================

-- Table 1: guilds — Track one or more WoW guilds to sync
CREATE TABLE IF NOT EXISTS guilds (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  realm_slug         VARCHAR(100) NOT NULL,
  name_slug          VARCHAR(100) NOT NULL,
  faction            VARCHAR(20)  DEFAULT NULL,
  member_count       INT UNSIGNED DEFAULT 0,
  achievement_points INT UNSIGNED DEFAULT 0,
  created_date       TIMESTAMP    NULL DEFAULT NULL,
  is_primary         BOOLEAN      NOT NULL DEFAULT FALSE,
  last_synced_at     TIMESTAMP    NULL DEFAULT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uq_guild_realm_name (realm_slug, name_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the primary guild
INSERT INTO guilds (name, realm_slug, name_slug, faction, is_primary)
VALUES ('Make Durotar Great Again', 'tichondrius', 'make-durotar-great-again', 'HORDE', TRUE)
ON DUPLICATE KEY UPDATE is_primary = TRUE;

-- Table 2: guild_members — Full roster from Blizzard API
CREATE TABLE IF NOT EXISTS guild_members (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id              INT UNSIGNED NOT NULL,
  character_name        VARCHAR(100) NOT NULL,
  realm_slug            VARCHAR(100) NOT NULL,
  realm_name            VARCHAR(100) DEFAULT NULL,
  level                 TINYINT UNSIGNED DEFAULT NULL,
  class                 VARCHAR(50)  DEFAULT NULL,
  race                  VARCHAR(50)  DEFAULT NULL,
  guild_rank            TINYINT UNSIGNED DEFAULT 0,
  guild_rank_name       VARCHAR(100) DEFAULT NULL,
  linked_user_id        INT UNSIGNED DEFAULT NULL,
  linked_character_id   INT UNSIGNED DEFAULT NULL,
  last_synced_at        TIMESTAMP    NULL DEFAULT NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_character_id) REFERENCES user_characters(id) ON DELETE SET NULL,
  UNIQUE INDEX uq_gm_guild_char (guild_id, character_name, realm_slug),
  INDEX idx_gm_guild (guild_id),
  INDEX idx_gm_class (class),
  INDEX idx_gm_rank (guild_rank),
  INDEX idx_gm_linked_user (linked_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 3: guild_achievements — Guild-level achievements
CREATE TABLE IF NOT EXISTS guild_achievements (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id          INT UNSIGNED NOT NULL,
  achievement_id    INT UNSIGNED NOT NULL,
  achievement_name  VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  completed_at      TIMESTAMP    NULL DEFAULT NULL,
  criteria_amount   INT UNSIGNED DEFAULT NULL,
  icon_url          VARCHAR(500) DEFAULT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  UNIQUE INDEX uq_ga_guild_ach (guild_id, achievement_id),
  INDEX idx_ga_completed (completed_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table 4: guild_activity — Recent activity feed
CREATE TABLE IF NOT EXISTS guild_activity (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id        INT UNSIGNED NOT NULL,
  activity_type   VARCHAR(50)  NOT NULL,
  character_name  VARCHAR(100) DEFAULT NULL,
  description     VARCHAR(500) NOT NULL,
  activity_data   JSON         DEFAULT NULL,
  occurred_at     TIMESTAMP    NULL DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  INDEX idx_gact_guild_time (guild_id, occurred_at DESC),
  INDEX idx_gact_type (activity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
