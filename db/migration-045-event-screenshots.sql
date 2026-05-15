-- Migration 045: per-event screenshot uploads.
-- Lets officers attach screenshots to a past event so the public Events
-- page can show recap galleries. Files live in /uploads (handled by the
-- existing upload middleware which compresses to WebP).

CREATE TABLE IF NOT EXISTS event_screenshots (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id     INT UNSIGNED NOT NULL,
  url          VARCHAR(500) NOT NULL COMMENT 'Public path, e.g. /uploads/<filename>.webp',
  caption      VARCHAR(255) NULL DEFAULT NULL,
  uploaded_by  INT UNSIGNED NULL DEFAULT NULL,
  uploaded_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_event_id (event_id),
  CONSTRAINT fk_evt_screenshots_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_evt_screenshots_user  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
