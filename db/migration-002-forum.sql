USE `mdga_core-xTa5dfGz`;

CREATE TABLE IF NOT EXISTS forum_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_posts (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  image_url   VARCHAR(500) DEFAULT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  locked      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post_category (category_id),
  INDEX idx_post_pinned (pinned)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forum_comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  content     TEXT NOT NULL,
  image_url   VARCHAR(500) DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_comment_post (post_id)
) ENGINE=InnoDB;

-- Seed default forum categories (only if table is empty — prevents duplicates on re-runs)
INSERT INTO forum_categories (name, description, sort_order)
SELECT t.name, t.description, t.sort_order
FROM (
  SELECT 'General Discussion' AS name, 'Talk about anything guild-related' AS description, 1 AS sort_order
  UNION ALL SELECT 'PvP Strategy', 'Tactics, comps, and battlefield strategy', 2
  UNION ALL SELECT 'Recruitment', 'Looking for members or groups', 3
  UNION ALL SELECT 'Off-Topic', 'Non-WoW discussion', 4
  UNION ALL SELECT 'Guild Announcements', 'Official announcements from officers', 5
) AS t
WHERE NOT EXISTS (SELECT 1 FROM forum_categories LIMIT 1);
