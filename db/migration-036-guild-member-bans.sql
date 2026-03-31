-- migration-036: Add ban tracking to guild_members
-- Allows banning any guild member, even without a linked site account

ALTER TABLE guild_members
  ADD COLUMN is_banned    TINYINT(1)   NOT NULL DEFAULT 0 AFTER linked_character_id,
  ADD COLUMN ban_reason   TEXT         NULL DEFAULT NULL AFTER is_banned,
  ADD COLUMN banned_at    TIMESTAMP    NULL DEFAULT NULL AFTER ban_reason,
  ADD COLUMN banned_by    INT UNSIGNED NULL DEFAULT NULL AFTER banned_at;
