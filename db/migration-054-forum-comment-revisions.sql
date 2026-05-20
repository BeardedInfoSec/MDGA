-- migration-054: track comment edits the same way post edits are tracked.
-- Each PUT /api/forum/comments/:id snapshots the previous content into this
-- table so officers can audit moderation rewrites and surface an "edited"
-- indicator in the UI.

CREATE TABLE IF NOT EXISTS forum_comment_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  comment_id INT UNSIGNED NOT NULL,
  edited_by INT UNSIGNED NOT NULL,
  previous_content MEDIUMTEXT,
  edited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY comment_id (comment_id),
  KEY edited_by (edited_by),
  CONSTRAINT fk_fcr_comment FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_fcr_editor FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
