-- migration-065: track where a character's last stat sync came from.
-- 'api'    = Blizzard Game Data profile API (normal path, all fields populated)
-- 'scrape' = web armory page fallback (used when API 404s for the character;
--            only partial data — lifetime statistics endpoints stay 404 too,
--            so killing blows / dungeons / raids / quests / arenas-played /
--            bgs-played / deaths / mythic+ stay zero. The card surfaces a
--            tooltip/footer explaining why)
-- NULL     = pre-migration rows; treated as 'api' by the UI for back-compat.

ALTER TABLE user_characters
  ADD COLUMN stats_source VARCHAR(16) DEFAULT NULL AFTER talents_updated_at;
