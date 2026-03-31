USE `mdga_core-xTa5dfGz`;

-- Content reports for moderation workflow (posts/comments)
CREATE TABLE IF NOT EXISTS forum_reports (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_user_id    INT UNSIGNED NOT NULL,
  target_type         ENUM('post', 'comment') NOT NULL,
  target_post_id      INT UNSIGNED NULL,
  target_comment_id   INT UNSIGNED NULL,
  target_user_id      INT UNSIGNED NULL,
  reason              VARCHAR(500) NOT NULL DEFAULT '',
  status              ENUM('open', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  reviewed_by_user_id INT UNSIGNED NULL,
  reviewed_note       VARCHAR(500) NULL,
  reviewed_at         TIMESTAMP NULL DEFAULT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_post_id) REFERENCES forum_posts(id) ON DELETE SET NULL,
  FOREIGN KEY (target_comment_id) REFERENCES forum_comments(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_forum_reports_status (status),
  INDEX idx_forum_reports_target_post (target_post_id),
  INDEX idx_forum_reports_target_comment (target_comment_id),
  INDEX idx_forum_reports_reporter (reporter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
