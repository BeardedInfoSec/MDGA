-- migration-050: track last login timestamp for the launch-night giveaway.
-- Stamped on every successful Discord OAuth callback. Indexed so the
-- giveaway query (range scan over a 5-hour window) is cheap.

ALTER TABLE users
  ADD COLUMN last_login_at DATETIME NULL,
  ADD KEY idx_users_last_login (last_login_at);
