-- migration-075: strike counter for the character auto-removal sweep.
--
-- The character scheduler used to hard-delete a user's character (and its
-- pvp_stats) the FIRST time a sync cycle couldn't confirm it — and because
-- fetchCharacterProfile collapsed every non-200 (404, 429 rate-limit, 5xx)
-- into `null`, a single Blizzard hiccup permanently destroyed real characters.
-- Patchiu-tichondrius (a live level-90 MDGA member) was wiped twice this way,
-- along with ~15 other members' characters.
--
-- This column tracks CONSECUTIVE failed confirmations. The scheduler now only
-- removes a character after MAX_SYNC_FAILURES cycles in a row (~6h), and resets
-- the counter to 0 on any successful confirmation. Transient API errors no
-- longer count at all (they throw and are skipped).

ALTER TABLE user_characters
  ADD COLUMN sync_failures TINYINT UNSIGNED NOT NULL DEFAULT 0;
