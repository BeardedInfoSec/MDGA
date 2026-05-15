-- One-off: create events + event_rsvps tables on a server that's missing them.
-- Definitions copied verbatim from db/schema.sql (lines 94 + 216).
-- Idempotent — IF NOT EXISTS makes re-running a no-op.
CREATE TABLE IF NOT EXISTS events (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(150) NOT NULL,
  day           VARCHAR(20)  NULL DEFAULT NULL,
  time          VARCHAR(60)  NULL DEFAULT NULL,
  category      ENUM('pvp','defense','social','raid') NOT NULL,
  description   TEXT,
  starts_at     DATETIME     NULL DEFAULT NULL,
  ends_at       DATETIME     NULL DEFAULT NULL,
  timezone      VARCHAR(50)  NOT NULL DEFAULT 'America/New_York',
  created_by    INT UNSIGNED,
  series_id     CHAR(36)     NULL DEFAULT NULL,
  series_index  SMALLINT     NULL DEFAULT NULL,
  series_total  SMALLINT     NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_events_starts_at (starts_at),
  INDEX idx_events_series_id (series_id),
  CONSTRAINT fk_events_created_by_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_rsvps (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  status     ENUM('going','maybe','not_going') NOT NULL DEFAULT 'going',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_user (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
