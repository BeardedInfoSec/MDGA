-- migration-053: missing applications table. The legacy "Apply to join"
-- form uses this; without it, the admin panel's Applications tab errors
-- with ER_NO_SUCH_TABLE. Drops the admin_users FK from the original
-- schema.sql definition because admin_users isn't on prod (we use the
-- regular users table for officer review now).

CREATE TABLE IF NOT EXISTS applications (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_name  VARCHAR(100) NOT NULL,
  server          VARCHAR(50)  NOT NULL,
  class_spec      VARCHAR(100) NOT NULL,
  discord_tag     VARCHAR(100) NOT NULL,
  experience      TEXT,
  why_join        TEXT,
  status          ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  reviewed_by     INT UNSIGNED NULL,
  user_id         INT UNSIGNED NULL,
  submitted_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP    NULL,
  INDEX idx_app_status (status),
  INDEX idx_app_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
