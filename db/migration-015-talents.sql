-- Migration 015: Add talents columns to user_characters
ALTER TABLE user_characters ADD COLUMN talents_json TEXT DEFAULT NULL;
ALTER TABLE user_characters ADD COLUMN talents_updated_at TIMESTAMP NULL DEFAULT NULL;
