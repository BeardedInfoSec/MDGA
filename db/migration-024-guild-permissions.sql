-- Guild management permissions

INSERT IGNORE INTO permissions (key_name, display_name, category) VALUES
  ('guild.manage', 'Manage guild sync and roster', 'Guild'),
  ('guild.view_roster', 'View full guild roster', 'Guild');

-- Give both to Officer and Guild Master roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'officer' AND p.key_name IN ('guild.manage', 'guild.view_roster');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'guild_master' AND p.key_name IN ('guild.manage', 'guild.view_roster');

-- Give view_roster to member role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'member' AND p.key_name = 'guild.view_roster';
