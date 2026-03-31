-- Migration 020: Add PvE leaderboard columns to pvp_stats
-- item_level: equipped item level (copied from profile on refresh)
-- highest_mplus_key: highest M+ keystone level completed this season
-- mythic_bosses_killed: number of bosses killed on Mythic in the current raid tier

ALTER TABLE pvp_stats ADD COLUMN item_level INT DEFAULT 0 AFTER mythic_plus_rating;
ALTER TABLE pvp_stats ADD COLUMN highest_mplus_key INT DEFAULT 0 AFTER item_level;
ALTER TABLE pvp_stats ADD COLUMN mythic_bosses_killed INT DEFAULT 0 AFTER highest_mplus_key;
