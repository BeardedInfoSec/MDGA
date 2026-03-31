-- Migration 014: Role-Based Access Control (RBAC)
-- Creates roles, permissions, role_permissions, user_roles tables
-- Seeds default permissions and roles

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280',
  description VARCHAR(255) DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permission definitions
CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role <-> Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User <-> Role mapping
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed permissions
INSERT INTO permissions (key_name, display_name, category) VALUES
  ('forum.create_posts', 'Create forum posts', 'Forum'),
  ('forum.create_comments', 'Reply to posts', 'Forum'),
  ('forum.vote', 'Vote on posts', 'Forum'),
  ('forum.pin_posts', 'Pin/unpin posts', 'Forum'),
  ('forum.lock_posts', 'Lock/unlock posts', 'Forum'),
  ('forum.delete_any_post', 'Delete any post', 'Forum'),
  ('forum.delete_any_comment', 'Delete any comment', 'Forum'),
  ('forum.access_officer_categories', 'Access officer-only categories', 'Forum'),
  ('forum.manage_categories', 'Create/edit categories', 'Forum'),
  ('events.manage', 'Create/edit/delete events', 'Events'),
  ('admin.view_panel', 'View admin panel', 'Admin'),
  ('admin.manage_applications', 'Review applications', 'Admin'),
  ('admin.manage_users', 'Change user ranks', 'Admin'),
  ('admin.manage_roles', 'Create/edit/delete roles', 'Admin'),
  ('leaderboard.bulk_refresh', 'Refresh all stats', 'Leaderboard');

-- Seed default roles
INSERT INTO roles (name, display_name, color, description, is_default) VALUES
  ('member', 'Member', '#5865F2', 'Default role for guild members', TRUE),
  ('moderator', 'Moderator', '#8B5CF6', 'Forum moderation privileges', FALSE),
  ('event_manager', 'Event Manager', '#22C55E', 'Can create and manage events', FALSE),
  ('officer', 'Officer', '#D4A017', 'Full officer access', FALSE),
  ('guild_master', 'Guild Master', '#B91C1C', 'All permissions', FALSE);

-- Assign permissions to Member role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'member' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote'
);

-- Assign permissions to Moderator role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote',
  'forum.pin_posts', 'forum.lock_posts', 'forum.delete_any_post',
  'forum.delete_any_comment', 'forum.access_officer_categories'
);

-- Assign permissions to Event Manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'event_manager' AND p.key_name IN (
  'forum.create_posts', 'forum.create_comments', 'forum.vote',
  'events.manage'
);

-- Assign permissions to Officer role (all except admin.manage_roles)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'officer' AND p.key_name != 'admin.manage_roles';

-- Assign ALL permissions to Guild Master role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'guild_master';

-- Auto-assign Member role to all existing active users
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.status = 'active' AND r.name = 'member';

-- Auto-assign Officer role to existing officers
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.`rank` = 'officer' AND r.name = 'officer';

-- Auto-assign Guild Master role to existing guildmaster
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.`rank` = 'guildmaster' AND r.name = 'guild_master';
