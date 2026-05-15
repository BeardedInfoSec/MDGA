-- migration-048: admin action audit log + post-edit history + account lock fields.
-- Bundled together because the same migration ships the admin block: the
-- audit log records who did what, post_revisions captures pre-edit content
-- so admins can diff, and the account_locked_* columns enable timed locks.
-- Soft-delete columns added on forum_posts/forum_comments for the recycle bin.

CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id INT UNSIGNED NOT NULL,
  action_type VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id BIGINT UNSIGNED NULL,
  summary VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_actions_admin (admin_user_id, created_at),
  KEY idx_admin_actions_type (action_type, created_at),
  KEY idx_admin_actions_target (target_type, target_id, created_at),
  CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS forum_post_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id INT UNSIGNED NOT NULL,
  edited_by INT UNSIGNED NOT NULL,
  previous_title VARCHAR(255) NULL,
  previous_content MEDIUMTEXT NULL,
  edited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_post_revisions_post (post_id, edited_at),
  CONSTRAINT fk_post_revisions_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_revisions_user FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Soft-delete on forum content. NULL = live; non-NULL = in recycle bin.
ALTER TABLE forum_posts
  ADD COLUMN deleted_at DATETIME NULL AFTER updated_at,
  ADD COLUMN deleted_by INT UNSIGNED NULL AFTER deleted_at,
  ADD KEY idx_forum_posts_deleted (deleted_at);

ALTER TABLE forum_comments
  ADD COLUMN deleted_at DATETIME NULL AFTER updated_at,
  ADD COLUMN deleted_by INT UNSIGNED NULL AFTER deleted_at,
  ADD KEY idx_forum_comments_deleted (deleted_at);

-- Account lock. lock_expires_at NULL = indefinite when lock is active.
ALTER TABLE users
  ADD COLUMN account_locked_at DATETIME NULL,
  ADD COLUMN account_locked_until DATETIME NULL,
  ADD COLUMN account_locked_reason VARCHAR(500) NULL,
  ADD COLUMN account_locked_by INT UNSIGNED NULL;

-- Permission for viewing the audit log + managing locks. Officers/GMs already
-- bypass perm checks via requirePermission(), but this row keeps the admin
-- panel's nav gate honest.
INSERT IGNORE INTO permissions (key_name, description) VALUES
  ('admin.view_audit_log', 'View the admin action audit log'),
  ('admin.manage_account_lock', 'Lock or unlock member accounts'),
  ('admin.manage_recycle_bin', 'View and restore soft-deleted forum content'),
  ('users.manage_characters', 'Edit any member''s linked characters');

-- Grant the new perms to the guildmaster role.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key_name IN (
  'admin.view_audit_log', 'admin.manage_account_lock',
  'admin.manage_recycle_bin', 'users.manage_characters'
)
WHERE r.name = 'guildmaster';
