-- Migration 046: dedicated permission for the Member Overrides page.
-- Replaces the hardcoded "guildmaster only" gate so any role can be
-- granted access via the Permissions tab.

-- 1) Register the new permission key (idempotent — safe to re-run).
INSERT IGNORE INTO permissions (key_name, display_name, category)
VALUES ('users.manage_overrides', 'Override Discord-synced ranks/roles', 'Admin');

-- 2) Grant it to whichever role(s) currently mean "Guildmaster" so the
--    existing GM workflow keeps working untouched.
--    We attach to:
--      a) the 'guild_master' RBAC role if it exists
--      b) any role flagged is_default for guildmaster rank (defensive)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key_name = 'users.manage_overrides'
 WHERE r.name IN ('guild_master', 'guildmaster');
