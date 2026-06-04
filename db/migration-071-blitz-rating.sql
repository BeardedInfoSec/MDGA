-- migration-071: blitz_rating column on pvp_stats + guild_member_stats
-- (rapazzini forum #77).
--
-- Battleground Blitz is a separate ranked PvP bracket from RBG and Solo
-- Shuffle that wasn't being captured. Adding the column + plumbing it
-- through the Blizzard API fetch (bracket href containing "blitz"), the
-- Home page's "Your Best PvP Rating" max, the per-character profile
-- display, and the leaderboards (which read from guild_member_stats).

ALTER TABLE pvp_stats
  ADD COLUMN blitz_rating INT UNSIGNED DEFAULT 0;

ALTER TABLE guild_member_stats
  ADD COLUMN blitz_rating INT UNSIGNED DEFAULT 0;
