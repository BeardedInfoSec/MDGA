USE `mdga_core-xTa5dfGz`;

CREATE TABLE IF NOT EXISTS user_characters (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  character_name VARCHAR(100) NOT NULL,
  realm          VARCHAR(100) NOT NULL,
  realm_slug     VARCHAR(100) NOT NULL,
  class          VARCHAR(50)  DEFAULT NULL,
  spec           VARCHAR(50)  DEFAULT NULL,
  is_main        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_char_user (user_id),
  INDEX idx_char_main (user_id, is_main)
) ENGINE=InnoDB;
