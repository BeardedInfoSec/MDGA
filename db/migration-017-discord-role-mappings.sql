-- Migration 017: Discord role mappings
-- Maps Discord server roles to site ranks and RBAC roles

CREATE TABLE IF NOT EXISTS discord_role_mappings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_role_id VARCHAR(20) NOT NULL UNIQUE,
  discord_role_name VARCHAR(100) NOT NULL DEFAULT '',
  site_rank ENUM('recruit','member','veteran','officer','guildmaster') DEFAULT NULL,
  site_role_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_role_id) REFERENCES roles(id) ON DELETE SET NULL
);
