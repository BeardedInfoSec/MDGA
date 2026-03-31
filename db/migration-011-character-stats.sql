USE `mdga_core-xTa5dfGz`;

-- Extended character stats from Blizzard achievements/statistics API
ALTER TABLE pvp_stats
  ADD COLUMN killing_blows      INT UNSIGNED DEFAULT 0,
  ADD COLUMN arenas_played      INT UNSIGNED DEFAULT 0,
  ADD COLUMN arenas_won         INT UNSIGNED DEFAULT 0,
  ADD COLUMN arenas_lost        INT UNSIGNED DEFAULT 0,
  ADD COLUMN bgs_played         INT UNSIGNED DEFAULT 0,
  ADD COLUMN bgs_won            INT UNSIGNED DEFAULT 0,
  ADD COLUMN total_deaths       INT UNSIGNED DEFAULT 0,
  ADD COLUMN creatures_killed   INT UNSIGNED DEFAULT 0,
  ADD COLUMN dungeons_entered   INT UNSIGNED DEFAULT 0,
  ADD COLUMN raids_entered      INT UNSIGNED DEFAULT 0,
  ADD COLUMN quests_completed   INT UNSIGNED DEFAULT 0,
  ADD COLUMN achievement_points INT UNSIGNED DEFAULT 0;
