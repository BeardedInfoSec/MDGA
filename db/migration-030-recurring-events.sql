-- Migration 030: Add recurring event series columns
ALTER TABLE events
  ADD COLUMN series_id CHAR(36) NULL AFTER created_by,
  ADD COLUMN series_index SMALLINT NULL AFTER series_id,
  ADD COLUMN series_total SMALLINT NULL AFTER series_index,
  ADD INDEX idx_events_series_id (series_id);
