USE `mdga_core-xTa5dfGz`;

-- Users table for all guild members (replaces admin_users for auth)
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(50)  NOT NULL UNIQUE,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url   VARCHAR(500) DEFAULT NULL,
  realm        VARCHAR(100) DEFAULT NULL,
  character_name VARCHAR(100) DEFAULT NULL,
  `rank`       ENUM('recruit','member','veteran','officer','guildmaster') NOT NULL DEFAULT 'recruit',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_rank (`rank`),
  INDEX idx_users_username (username)
) ENGINE=InnoDB;
