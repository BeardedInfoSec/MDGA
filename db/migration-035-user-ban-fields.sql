-- migration-035: Add 'banned' status and ban tracking columns
-- Adds banned to the user status enum, plus ban_reason, banned_at, banned_by

ALTER TABLE users
  MODIFY COLUMN status ENUM('pending_discord','pending_approval','active','suspended','rejected','banned') NOT NULL DEFAULT 'pending_discord';

ALTER TABLE users
  ADD COLUMN ban_reason TEXT NULL DEFAULT NULL AFTER status,
  ADD COLUMN banned_at TIMESTAMP NULL DEFAULT NULL AFTER ban_reason,
  ADD COLUMN banned_by INT UNSIGNED NULL DEFAULT NULL AFTER banned_at;
