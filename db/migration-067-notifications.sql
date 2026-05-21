-- migration-067: in-app notifications (bell icon in the nav).
--
-- Types covered in v1:
--   mention          — someone @mentioned the user in a post or comment
--   reply            — someone replied to a post the user authored
--   event            — officer created a new event (broadcast to active members)
--   giveaway_kickoff — scheduled giveaway publish_at landed (broadcast)
--
-- Design notes:
--   - Fanout-on-write: one row per (recipient, event). Cheap at our scale
--     (hundreds of active users * tens of events per month).
--   - source_type/source_id let the client deep-link without us baking the
--     URL into the row (URLs change; ids don't).
--   - actor_id is the user who triggered the notification (nullable for
--     system-fired ones like giveaway_kickoff).
--   - read_at NULL = unread, timestamp = when the user dismissed/viewed it.

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  type          ENUM('mention', 'reply', 'event', 'giveaway_kickoff') NOT NULL,
  actor_id      INT UNSIGNED DEFAULT NULL,
  source_type   ENUM('post', 'comment', 'event', 'giveaway') DEFAULT NULL,
  source_id     INT UNSIGNED DEFAULT NULL,
  title         VARCHAR(200) NOT NULL,
  link_url      VARCHAR(500) NOT NULL,
  read_at       TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_unread (user_id, read_at, created_at),
  INDEX idx_user_recent (user_id, created_at DESC),
  CONSTRAINT fk_notif_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
