-- Migration 019: Add mythic_plus_rating column to pvp_stats table
-- Stores the character's overall Mythic+ rating from the Blizzard Keystone Profile API

ALTER TABLE pvp_stats ADD COLUMN mythic_plus_rating INT DEFAULT 0 AFTER achievement_points;
