-- migration-058: per-post giveaway config so officers can automate the
-- "first / Nth comment wins" pattern (the mousepad drop being the first
-- such use). One row per giveaway-enabled forum post. Anything not
-- configured here is just a normal post.

CREATE TABLE IF NOT EXISTS giveaway_configs (
  post_id INT UNSIGNED NOT NULL PRIMARY KEY,
  target_positions JSON NOT NULL,
    -- e.g. [1, 100] for "first + 100th valid comment wins".
  valid_pattern VARCHAR(200) NOT NULL DEFAULT '^(MDGA|MEGA)!$',
    -- Regex (JS-style) the comment content must match to count toward
    -- the position counter. Default catches the standard reply chant.
  rate_limit_seconds INT UNSIGNED NOT NULL DEFAULT 300,
    -- Per-user cooldown between consecutive comments on this post.
    -- 0 disables the cooldown.
  winners JSON NOT NULL DEFAULT (JSON_OBJECT()),
    -- Map of position -> comment_id once the slot is filled.
    -- { "1": 123, "100": 456 }
  announced JSON NOT NULL DEFAULT (JSON_OBJECT()),
    -- Map of position -> 1 once the Discord bot has posted the winner,
    -- so a restart-after-crash doesn't double-announce.
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gc_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_gc_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
