-- ================================================
-- MDGA — Complete Database Schema
-- Initializes all tables and seed data from scratch.
-- The setup script (bash setup.sh) runs this automatically.
-- ================================================

-- ================================================
-- TABLES (ordered by FK dependencies)
-- ================================================

-- Admin users (legacy officer auth)
CREATE TABLE IF NOT EXISTS admin_users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login attempt tracking for lockout
CREATE TABLE IF NOT EXISTS login_attempts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(50)  NOT NULL,
  ip_address   VARCHAR(45)  NOT NULL,
  attempted_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_user_time (username, attempted_at),
  INDEX idx_login_ip_time   (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users (Discord OAuth)
CREATE TABLE IF NOT EXISTS users (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id       VARCHAR(20)  DEFAULT NULL UNIQUE,
  username         VARCHAR(50)  NOT NULL UNIQUE,
  email            VARCHAR(255) DEFAULT NULL UNIQUE,
  discord_username VARCHAR(100) DEFAULT NULL,
  discord_avatar   VARCHAR(255) DEFAULT NULL,
  password_hash    VARCHAR(255) DEFAULT NULL,
  display_name     VARCHAR(100) NOT NULL,
  avatar_url       VARCHAR(500) DEFAULT NULL,
  realm            VARCHAR(100) DEFAULT NULL,
  character_name   VARCHAR(100) DEFAULT NULL,
  `rank`           ENUM('recruit','member','veteran','officer','guildmaster') NOT NULL DEFAULT 'recruit',
  timezone         VARCHAR(50)  DEFAULT NULL,
  status           ENUM('pending_discord','pending_approval','active','suspended','rejected','banned') NOT NULL DEFAULT 'pending_discord',
  ban_reason       TEXT DEFAULT NULL,
  banned_at        TIMESTAMP NULL DEFAULT NULL,
  banned_by        INT UNSIGNED DEFAULT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_rank (`rank`),
  INDEX idx_users_username (username),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guilds (Blizzard API sync)
CREATE TABLE IF NOT EXISTS guilds (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  realm_slug         VARCHAR(100) NOT NULL,
  name_slug          VARCHAR(100) NOT NULL,
  faction            VARCHAR(20)  DEFAULT NULL,
  member_count       INT UNSIGNED DEFAULT 0,
  achievement_points INT UNSIGNED DEFAULT 0,
  created_date       TIMESTAMP    NULL DEFAULT NULL,
  is_primary         TINYINT(1)   NOT NULL DEFAULT 0,
  last_synced_at     TIMESTAMP    NULL DEFAULT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guild_realm_name (realm_slug, name_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC roles
CREATE TABLE IF NOT EXISTS roles (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(50)  NOT NULL UNIQUE,
  display_name   VARCHAR(100) NOT NULL,
  color          VARCHAR(7)   DEFAULT '#6B7280',
  description    VARCHAR(255) DEFAULT '',
  discord_role_id VARCHAR(20) DEFAULT NULL,
  is_default     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC permissions
CREATE TABLE IF NOT EXISTS permissions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name     VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  category     VARCHAR(50)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Events (calendar-based with timezone support)
CREATE TABLE IF NOT EXISTS events (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(150) NOT NULL,
  day           VARCHAR(20)  NULL DEFAULT NULL,
  time          VARCHAR(60)  NULL DEFAULT NULL,
  category      ENUM('pvp','defense','social','raid') NOT NULL,
  description   TEXT,
  starts_at     DATETIME     NULL DEFAULT NULL,
  ends_at       DATETIME     NULL DEFAULT NULL,
  timezone      VARCHAR(50)  NOT NULL DEFAULT 'America/New_York',
  created_by    INT UNSIGNED,
  series_id     CHAR(36)     NULL DEFAULT NULL,
  series_index  SMALLINT     NULL DEFAULT NULL,
  series_total  SMALLINT     NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_starts_at (starts_at),
  INDEX idx_events_series_id (series_id),
  CONSTRAINT fk_events_created_by_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions (JWT tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE,
  ip_address  VARCHAR(45),
  expires_at  TIMESTAMP    NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Applications
CREATE TABLE IF NOT EXISTS applications (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_name  VARCHAR(100) NOT NULL,
  server          VARCHAR(50)  NOT NULL,
  class_spec      VARCHAR(100) NOT NULL,
  discord_tag     VARCHAR(100) NOT NULL,
  experience      TEXT,
  why_join        TEXT,
  status          ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  reviewed_by     INT UNSIGNED,
  submitted_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP    NULL,
  FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_app_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum categories
CREATE TABLE IF NOT EXISTS forum_categories (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  description  VARCHAR(500) DEFAULT '',
  sort_order   INT UNSIGNED NOT NULL DEFAULT 0,
  created_by   INT UNSIGNED DEFAULT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  officer_only TINYINT(1)   NOT NULL DEFAULT 0,
  UNIQUE KEY uq_category_name (name),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User characters (Blizzard armory)
CREATE TABLE IF NOT EXISTS user_characters (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            INT UNSIGNED NOT NULL,
  character_name     VARCHAR(100) NOT NULL,
  realm              VARCHAR(100) NOT NULL,
  realm_slug         VARCHAR(100) NOT NULL,
  class              VARCHAR(50)  DEFAULT NULL,
  spec               VARCHAR(50)  DEFAULT NULL,
  is_main            TINYINT(1)   NOT NULL DEFAULT 0,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  level              TINYINT UNSIGNED DEFAULT NULL,
  race               VARCHAR(50)  DEFAULT NULL,
  item_level         SMALLINT UNSIGNED DEFAULT NULL,
  media_url          VARCHAR(500) DEFAULT NULL,
  guild_name         VARCHAR(100) DEFAULT NULL,
  faction            VARCHAR(20)  DEFAULT NULL,
  last_login         TIMESTAMP    NULL DEFAULT NULL,
  talents_json       TEXT,
  talents_updated_at TIMESTAMP    NULL DEFAULT NULL,
  INDEX idx_char_user (user_id),
  INDEX idx_char_main (user_id, is_main),
  UNIQUE KEY uq_user_char_realm (user_id, character_name, realm_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role <-> Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User <-> Role mapping
CREATE TABLE IF NOT EXISTS user_roles (
  user_id     INT UNSIGNED NOT NULL,
  role_id     INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discord role mappings
CREATE TABLE IF NOT EXISTS discord_role_mappings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_role_id   VARCHAR(20)  NOT NULL UNIQUE,
  discord_role_name VARCHAR(100) NOT NULL DEFAULT '',
  site_rank         ENUM('recruit','member','veteran','officer','guildmaster') DEFAULT NULL,
  site_role_id      INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_role_id) REFERENCES roles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id  INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  status    ENUM('going','maybe','not_going') NOT NULL DEFAULT 'going',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_user (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User report presets
CREATE TABLE IF NOT EXISTS user_report_presets (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(120) NOT NULL,
  filters_json       JSON NOT NULL,
  created_by_user_id INT UNSIGNED DEFAULT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_report_presets_updated_at (updated_at),
  CONSTRAINT fk_user_report_presets_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Site settings (shared UI/media config)
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum posts
CREATE TABLE IF NOT EXISTS forum_posts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(200) NOT NULL,
  content     TEXT         NOT NULL,
  image_url   VARCHAR(500) DEFAULT NULL,
  pinned      TINYINT(1)   NOT NULL DEFAULT 0,
  locked      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  view_count  INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_post_category (category_id),
  INDEX idx_post_pinned (pinned),
  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum comments
CREATE TABLE IF NOT EXISTS forum_comments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  content    TEXT         NOT NULL,
  image_url  VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comment_post (post_id),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum post votes
CREATE TABLE IF NOT EXISTS forum_votes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  vote       TINYINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_post_vote (user_id, post_id),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum post views
CREATE TABLE IF NOT EXISTS forum_post_views (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_post_view (user_id, post_id),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum comment votes
CREATE TABLE IF NOT EXISTS forum_comment_votes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  vote       TINYINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_comment_vote (user_id, comment_id),
  FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forum reports
CREATE TABLE IF NOT EXISTS forum_reports (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_user_id     INT UNSIGNED NOT NULL,
  target_type          ENUM('post','comment') NOT NULL,
  target_post_id       INT UNSIGNED DEFAULT NULL,
  target_comment_id    INT UNSIGNED DEFAULT NULL,
  target_user_id       INT UNSIGNED DEFAULT NULL,
  reason               VARCHAR(500) NOT NULL DEFAULT '',
  status               ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
  reviewed_by_user_id  INT UNSIGNED DEFAULT NULL,
  reviewed_note        VARCHAR(500) DEFAULT NULL,
  reviewed_at          TIMESTAMP NULL DEFAULT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_reports_status (status),
  INDEX idx_forum_reports_target_post (target_post_id),
  INDEX idx_forum_reports_target_comment (target_comment_id),
  INDEX idx_forum_reports_reporter (reporter_user_id),
  FOREIGN KEY (reporter_user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_post_id)      REFERENCES forum_posts(id) ON DELETE SET NULL,
  FOREIGN KEY (target_comment_id)   REFERENCES forum_comments(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id)      REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PvP stats (per registered user character)
CREATE TABLE IF NOT EXISTS pvp_stats (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id         INT UNSIGNED NOT NULL,
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
  mythic_plus_rating   INT DEFAULT 0,
  item_level           INT DEFAULT 0,
  highest_mplus_key    INT DEFAULT 0,
  mythic_bosses_killed INT DEFAULT 0,
  fetched_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_pvp_char (character_id),
  INDEX idx_pvp_solo_shuffle (solo_shuffle DESC),
  INDEX idx_pvp_3v3 (arena_3v3 DESC),
  FOREIGN KEY (character_id) REFERENCES user_characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guild members (full roster from Blizzard API)
CREATE TABLE IF NOT EXISTS guild_members (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id            INT UNSIGNED NOT NULL,
  character_name      VARCHAR(100) NOT NULL,
  realm_slug          VARCHAR(100) NOT NULL,
  realm_name          VARCHAR(100) DEFAULT NULL,
  level               TINYINT UNSIGNED DEFAULT NULL,
  class               VARCHAR(50)  DEFAULT NULL,
  race                VARCHAR(50)  DEFAULT NULL,
  spec                VARCHAR(50)  DEFAULT NULL,
  guild_rank          TINYINT UNSIGNED DEFAULT 0,
  previous_guild_rank INT DEFAULT NULL,
  guild_rank_name     VARCHAR(100) DEFAULT NULL,
  linked_user_id      INT UNSIGNED DEFAULT NULL,
  linked_character_id INT UNSIGNED DEFAULT NULL,
  is_banned           TINYINT(1)   NOT NULL DEFAULT 0,
  ban_reason          TEXT         NULL DEFAULT NULL,
  banned_at           TIMESTAMP    NULL DEFAULT NULL,
  banned_by           INT UNSIGNED NULL DEFAULT NULL,
  last_synced_at      TIMESTAMP    NULL DEFAULT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gm_guild_char (guild_id, character_name, realm_slug),
  INDEX idx_gm_guild (guild_id),
  INDEX idx_gm_class (class),
  INDEX idx_gm_rank (guild_rank),
  INDEX idx_gm_linked_user (linked_user_id),
  FOREIGN KEY (guild_id)            REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_user_id)      REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_character_id) REFERENCES user_characters(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guild achievements
CREATE TABLE IF NOT EXISTS guild_achievements (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id         INT UNSIGNED NOT NULL,
  achievement_id   INT UNSIGNED NOT NULL,
  achievement_name VARCHAR(255) NOT NULL,
  description      TEXT,
  completed_at     TIMESTAMP NULL DEFAULT NULL,
  criteria_amount  INT UNSIGNED DEFAULT NULL,
  icon_url         VARCHAR(500) DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga_guild_ach (guild_id, achievement_id),
  INDEX idx_ga_completed (completed_at DESC),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guild activity feed
CREATE TABLE IF NOT EXISTS guild_activity (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id        INT UNSIGNED NOT NULL,
  activity_type   VARCHAR(50)  NOT NULL,
  character_name  VARCHAR(100) DEFAULT NULL,
  description     VARCHAR(500) NOT NULL,
  activity_data   JSON         DEFAULT NULL,
  occurred_at     TIMESTAMP    NULL DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gact_guild_time (guild_id, occurred_at DESC),
  INDEX idx_gact_type (activity_type),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guild member stats (for guild-wide leaderboards)
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
  INDEX idx_gms_solo_shuffle (solo_shuffle DESC),
  INDEX idx_gms_achievement (achievement_points DESC),
  FOREIGN KEY (guild_member_id) REFERENCES guild_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carousel images (admin-managed homepage carousel)
CREATE TABLE IF NOT EXISTS carousel_images (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  image_url  VARCHAR(500) NOT NULL,
  alt_text   VARCHAR(255) DEFAULT '',
  sort_order INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Game rank to Discord role mappings
CREATE TABLE IF NOT EXISTS game_rank_mappings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id        INT UNSIGNED NOT NULL,
  game_rank       INT NOT NULL COMMENT 'WoW guild rank index (0=GM, higher=lower rank)',
  game_rank_name  VARCHAR(100) DEFAULT NULL,
  discord_role_id VARCHAR(20)  DEFAULT NULL COMMENT 'Discord role to assign for this game rank',
  site_rank       ENUM('recruit','member','veteran','officer','guildmaster') DEFAULT NULL,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guild_game_rank (guild_id, game_rank),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Addon events (real-time data from WoW addon companion app)
CREATE TABLE IF NOT EXISTS addon_events (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id        VARCHAR(100) NOT NULL COMMENT 'Addon-generated unique event ID',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================
-- SEED DATA
-- ================================================

-- Default permissions
INSERT IGNORE INTO permissions (key_name, display_name, category) VALUES
  ('forum.create_posts', 'Create forum posts', 'Forum'),
  ('forum.create_comments', 'Reply to posts', 'Forum'),
  ('forum.vote', 'Vote on posts', 'Forum'),
  ('forum.pin_posts', 'Pin/unpin posts', 'Forum'),
  ('forum.lock_posts', 'Lock/unlock posts', 'Forum'),
  ('forum.delete_any_post', 'Delete any post', 'Forum'),
  ('forum.delete_any_comment', 'Delete any comment', 'Forum'),
  ('forum.access_officer_categories', 'Access officer-only categories', 'Forum'),
  ('forum.manage_categories', 'Create/edit categories', 'Forum'),
  ('events.manage', 'Create/edit/delete events', 'Events'),
  ('admin.view_panel', 'View admin panel', 'Admin'),
  ('admin.manage_applications', 'Review applications', 'Admin'),
  ('admin.manage_users', 'Change user ranks', 'Admin'),
  ('admin.manage_roles', 'Create/edit/delete roles', 'Admin'),
  ('leaderboard.bulk_refresh', 'Refresh all stats', 'Leaderboard'),
  ('guild.manage', 'Manage guild sync and roster', 'Guild'),
  ('guild.view_roster', 'View full guild roster', 'Guild');

-- Default roles
INSERT IGNORE INTO roles (name, display_name, color, description, is_default) VALUES
  ('member', 'Member', '#5865F2', 'Default role for guild members', TRUE),
  ('moderator', 'Moderator', '#8B5CF6', 'Forum moderation privileges', FALSE),
  ('event_manager', 'Event Manager', '#22C55E', 'Can create and manage events', FALSE),
  ('officer', 'Officer', '#D4A017', 'Full officer access', FALSE),
  ('guild_master', 'Guild Master', '#B91C1C', 'All permissions', FALSE);

-- Member role permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'member' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote', 'guild.view_roster'
);

-- Moderator role permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote',
  'forum.pin_posts', 'forum.lock_posts', 'forum.delete_any_post',
  'forum.delete_any_comment', 'forum.access_officer_categories'
);

-- Event Manager role permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'event_manager' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote',
  'events.manage'
);

-- Officer role permissions (all except admin.manage_roles)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'officer' AND p.key_name != 'admin.manage_roles';

-- Guild Master role permissions (all)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'guild_master';

-- Primary guild
INSERT INTO guilds (name, realm_slug, name_slug, faction, is_primary)
VALUES ('Make Durotar Great Again', 'tichondrius', 'make-durotar-great-again', 'HORDE', TRUE)
ON DUPLICATE KEY UPDATE is_primary = TRUE;

-- Default Home background image
INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('home_background_image_url', '/images/Screenshot_2026-02-06_18-21-39.png');

-- Default carousel images
INSERT INTO carousel_images (image_url, alt_text, sort_order)
SELECT t.image_url, t.alt_text, t.sort_order
FROM (
  SELECT '/images/image1.png' AS image_url, 'MDGA forces gathered at sunset' AS alt_text, 1 AS sort_order
  UNION ALL SELECT '/images/image.png', 'MDGA in battle formation', 2
  UNION ALL SELECT '/images/Screenshot_2026-02-06_18-22-48.png', 'MDGA assembled in Durotar', 3
  UNION ALL SELECT '/images/image-140.png', 'Battleground victory', 4
  UNION ALL SELECT '/images/5E45147D-7595-4207-B029-FD9F8DCE46C8.png', 'MDGA raid group on the move', 5
  UNION ALL SELECT '/images/Screenshot_2026-02-06_at_8.28.02_PM.png', 'MDGA members on mounts in Durotar', 6
  UNION ALL SELECT '/images/Screenshot_2025-05-27_214251.png', 'MDGA guild members gathered in Durotar', 7
  UNION ALL SELECT '/images/highest_shuff_ratig.png', 'Solo Arena 3102 Rating', 8
  UNION ALL SELECT '/images/image3.png', 'PvP Season Ratings', 9
) AS t
WHERE NOT EXISTS (SELECT 1 FROM carousel_images LIMIT 1);

-- Default events (legacy day/time format — new events use starts_at/ends_at)
INSERT INTO events (title, day, time, category, description)
SELECT t.title, t.day, t.time, t.category, t.description
FROM (
  SELECT 'Durotar Patrol' AS title, 'Tuesday' AS day, '8:00 PM – 10:00 PM EST' AS time, 'defense' AS category, 'Organized patrol of Durotar zones. Defend leveling Horde players, clear Alliance intruders. Minimum 20-man squad required.' AS description
  UNION ALL SELECT 'PvP War Night', 'Thursday', '9:00 PM – 11:00 PM EST', 'pvp', 'Full-scale PvP operations. Battlegrounds premades, world PvP raids on Alliance territories. Bring your consumables.'
  UNION ALL SELECT 'War Council', 'Sunday', '7:00 PM – 8:00 PM EST', 'social', 'Weekly guild meeting in Discord voice. Strategy review, promotions, announcements. All members expected to attend.'
  UNION ALL SELECT 'Arena Night', 'Saturday', '8:00 PM – 11:00 PM EST', 'pvp', '2v2 and 3v3 arena sessions. Push rating, practice comps, help guildies gear up. All skill levels welcome.'
  UNION ALL SELECT 'Emergency Defense', 'On Call', 'Ping in Discord', 'defense', 'When Alliance raids hit Orgrimmar or Durotar, the war horn sounds. Drop everything and defend.'
  UNION ALL SELECT 'Raid Night', 'Friday', '8:30 PM – 11:30 PM EST', 'raid', 'PvE progression raids. Gear up the warband. A well-geared army is a dominant army on the battlefield.'
) AS t
WHERE NOT EXISTS (SELECT 1 FROM events LIMIT 1);
