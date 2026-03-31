USE `mdga_core-xTa5dfGz`;

-- Add Discord identity fields to users table
ALTER TABLE users
  ADD COLUMN discord_id VARCHAR(20) UNIQUE AFTER id,
  ADD COLUMN discord_username VARCHAR(100) AFTER email,
  ADD COLUMN discord_avatar VARCHAR(255) AFTER discord_username;

-- Add account status column
-- rank = role-based permissions (recruit/member/etc.)
-- status = whether the user can log in at all
ALTER TABLE users
  ADD COLUMN status ENUM('pending_discord','pending_approval','active','suspended','rejected')
    NOT NULL DEFAULT 'pending_discord' AFTER `rank`;

-- Index for status lookups
CREATE INDEX idx_users_status ON users (status);
