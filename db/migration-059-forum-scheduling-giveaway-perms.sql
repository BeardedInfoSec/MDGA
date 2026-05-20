-- migration-059: register two new permissions in the RBAC table:
--   forum.schedule_posts   — set a future publish_at on a post (forum #39)
--   forum.manage_giveaway  — configure giveaway settings on a post (forum
--                            "first / Nth comment wins" automation)
-- Both are pre-mapped to the Website Guru role so the website operator
-- can use both features without being an officer. The /auth/me payload
-- already includes role permissions, so the React UI picks them up on
-- the next login without a code change.

INSERT IGNORE INTO permissions (key_name, display_name, category) VALUES
  ('forum.schedule_posts', 'Schedule forum posts to publish at a future time', 'forum'),
  ('forum.manage_giveaway', 'Configure giveaway automation on forum posts', 'forum');

-- Grant both to the Website Guru role.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'website_guru'
  AND p.key_name IN ('forum.schedule_posts', 'forum.manage_giveaway');
