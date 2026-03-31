USE `mdga_core-xTa5dfGz`;

CREATE TABLE IF NOT EXISTS pvp_stats (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id     INT UNSIGNED NOT NULL,
  arena_2v2        INT UNSIGNED DEFAULT 0,
  arena_3v3        INT UNSIGNED DEFAULT 0,
  solo_shuffle     INT UNSIGNED DEFAULT 0,
  rbg_rating       INT UNSIGNED DEFAULT 0,
  honorable_kills  INT UNSIGNED DEFAULT 0,
  fetched_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (character_id) REFERENCES user_characters(id) ON DELETE CASCADE,
  UNIQUE INDEX uq_pvp_char (character_id),
  INDEX idx_pvp_solo_shuffle (solo_shuffle DESC),
  INDEX idx_pvp_3v3 (arena_3v3 DESC)
) ENGINE=InnoDB;
