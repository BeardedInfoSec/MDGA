-- Migration 034: Make legacy day/time columns nullable
-- The calendar system (migration-029) uses starts_at/ends_at instead.
-- These old columns block new event inserts because they're NOT NULL.

ALTER TABLE events MODIFY COLUMN `day` VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE events MODIFY COLUMN `time` VARCHAR(60) NULL DEFAULT NULL;
