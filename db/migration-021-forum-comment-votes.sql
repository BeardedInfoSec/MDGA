USE `mdga_core-xTa5dfGz`;

-- Upvote / downvote system for comments
CREATE TABLE IF NOT EXISTS forum_comment_votes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  vote       TINYINT NOT NULL, -- 1 = upvote, -1 = downvote
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_comment_vote (user_id, comment_id),
  FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
