-- ============================================
-- migration-076: purge phantom guild membership events
--
-- Background: services/guild-sync.js diffed the roster by comparing character
-- names in JS with ===, while guild_members.character_name is
-- utf8mb4_unicode_ci, so the database considered accent- and case-variant
-- names to be the same row (Flaspër == Flaspèr). Any character whose stored
-- spelling differed from the spelling the Blizzard API returned therefore
-- never matched the diff, and the sync re-emitted the SAME event on every
-- 3-hour pass. On prod that left 25,845 of 42,076 rows as repeats from 70
-- characters — Warchiêf-tichondrius logged "joined" 2,844 times. The site's
-- guild activity feed and the 1d/7d joined/left counters read straight off
-- this table, so both were reporting fiction.
--
-- The code fix stops new phantoms being written; this clears the backlog.
--
-- Rule: within one (guild, character, realm), collapse each CONSECUTIVE RUN of
-- the same event_type down to its earliest row. A genuine join → left → join
-- cycle alternates, so it survives untouched; only a repeat of what the
-- character was already recorded as having done is removed.
--
-- character_name is compared with utf8mb4_bin here on purpose. Deltâ and Deltà
-- are different characters and each repeats its own event type; grouping them
-- accent-insensitively would interleave their two runs into what looks like
-- one alternating — and therefore legitimate — sequence, and the phantoms
-- would survive the purge.
--
-- Idempotent: a second run finds no remaining consecutive duplicates.
-- ============================================

CREATE TEMPORARY TABLE _phantom_event_ids AS
SELECT id FROM (
  SELECT
    id,
    event_type,
    LAG(event_type) OVER (
      PARTITION BY guild_id, character_name COLLATE utf8mb4_bin, realm_slug
      ORDER BY occurred_at, id
    ) AS prev_event_type
  FROM guild_membership_events
) runs
WHERE prev_event_type = event_type;

DELETE e FROM guild_membership_events e
  JOIN _phantom_event_ids p ON p.id = e.id;

DROP TEMPORARY TABLE _phantom_event_ids;
