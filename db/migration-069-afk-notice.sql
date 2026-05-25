-- migration-069: user-settable AFK notice (forum #61 idea 3).
--
-- Members can declare an upcoming absence so officers running roster
-- audits/prunes have context before kicking. NOT a guarantee against
-- removal — the UI surfaces a warning saying so.
--
-- Columns are inline on `users` rather than a separate `user_afk_notices`
-- table because the scope is "one active notice per user at a time" and
-- there's no requirement to keep history. Clearing the notice sets all
-- three back to NULL.

ALTER TABLE users
  ADD COLUMN afk_until DATE DEFAULT NULL,
  ADD COLUMN afk_reason VARCHAR(255) DEFAULT NULL,
  ADD COLUMN afk_set_at TIMESTAMP NULL DEFAULT NULL;

-- Index so officer roster queries can `WHERE afk_until >= CURDATE()`
-- without a full scan.
CREATE INDEX idx_users_afk_until ON users(afk_until);
