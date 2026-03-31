USE `mdga_core-xTa5dfGz`;

-- View count on posts
ALTER TABLE forum_posts
  ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0;

-- Upvote / downvote system
CREATE TABLE IF NOT EXISTS forum_votes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  vote       TINYINT NOT NULL,  -- 1 = upvote, -1 = downvote
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_post_vote (user_id, post_id),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
