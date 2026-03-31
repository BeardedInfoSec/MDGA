-- Migration 029: Calendar-based events with timezone support
-- Replaces day-of-week + free-text time with actual UTC datetimes

-- 1. Add calendar columns to events table
ALTER TABLE events
  ADD COLUMN starts_at DATETIME NULL AFTER description,
  ADD COLUMN ends_at DATETIME NULL AFTER starts_at,
  ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York' AFTER ends_at,
  ADD INDEX idx_events_starts_at (starts_at);

-- 2. Add timezone preference to users table
ALTER TABLE users
  ADD COLUMN timezone VARCHAR(50) DEFAULT NULL AFTER character_name;
