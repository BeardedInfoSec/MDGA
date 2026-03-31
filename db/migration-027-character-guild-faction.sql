-- Add guild_name and faction to user_characters for guild verification
ALTER TABLE user_characters
  ADD COLUMN guild_name VARCHAR(100) DEFAULT NULL AFTER media_url,
  ADD COLUMN faction VARCHAR(20) DEFAULT NULL AFTER guild_name;
