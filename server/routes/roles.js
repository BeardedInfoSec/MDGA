const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission, requireGuildMaster } = require('../middleware/auth');

const router = express.Router();

// GET /api/roles — list all roles with permissions
router.get('/', requireAuth, requirePermission('admin.manage_roles'), async (req, res) => {
  try {
    const [roles] = await pool.execute('SELECT * FROM roles ORDER BY id ASC');
    const [rp] = await pool.execute(`
      SELECT rp.role_id, p.id AS permission_id, p.key_name, p.display_name, p.category
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      ORDER BY p.category, p.display_name
    `);

    const rolesWithPerms = roles.map(role => ({
      ...role,
      permissions: rp.filter(p => p.role_id === role.id).map(p => ({
        id: p.permission_id,
        key_name: p.key_name,
        display_name: p.display_name,
        category: p.category,
      })),
    }));

    res.json({ roles: rolesWithPerms });
  } catch (err) {
    console.error('Get roles error:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// GET /api/roles/permissions — list all available permissions
router.get('/permissions', requireAuth, requirePermission('admin.manage_roles'), async (req, res) => {
  try {
    const [permissions] = await pool.execute('SELECT * FROM permissions ORDER BY category, display_name');
    res.json({ permissions });
  } catch (err) {
    console.error('Get permissions error:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// POST /api/roles — create a new role
router.post('/', requireAuth, requirePermission('admin.manage_roles'), async (req, res) => {
  try {
    const { name, displayName, color, description, permissionIds, discordRoleId } = req.body;
    if (!name || !displayName) return res.status(400).json({ error: 'Name and display name are required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const [existing] = await pool.execute('SELECT id FROM roles WHERE name = ?', [slug]);
    if (existing.length > 0) return res.status(409).json({ error: 'A role with that name already exists' });

    // Officers can only assign permissions they have
    if (req.user.rank !== 'guildmaster' && permissionIds && permissionIds.length > 0) {
      const userPerms = req.user.permissions || [];
      const placeholders = permissionIds.map(() => '?').join(',');
      const [perms] = await pool.execute(`SELECT id, key_name FROM permissions WHERE id IN (${placeholders})`, permissionIds);
      const unauthorized = perms.filter(p => !userPerms.includes(p.key_name));
      if (unauthorized.length > 0) {
        return res.status(403).json({ error: 'You can only assign permissions you have' });
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO roles (name, display_name, color, description, discord_role_id) VALUES (?, ?, ?, ?, ?)',
      [slug, displayName, color || '#6B7280', description || '', discordRoleId || null]
    );
    const roleId = result.insertId;

    // Assign permissions
    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map(pid => [roleId, pid]);
      for (const [rid, pid] of values) {
        await pool.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [rid, pid]);
      }
    }

    res.status(201).json({ id: roleId, message: 'Role created' });
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// PUT /api/roles/:id — update role
router.put('/:id', requireAuth, requirePermission('admin.manage_roles'), async (req, res) => {
  try {
    const { displayName, color, description, permissionIds, discordRoleId } = req.body;
    const roleId = req.params.id;

    // Officers can only assign permissions they have
    if (req.user.rank !== 'guildmaster' && permissionIds && permissionIds.length > 0) {
      const userPerms = req.user.permissions || [];
      const placeholders = permissionIds.map(() => '?').join(',');
      const [perms] = await pool.execute(`SELECT id, key_name FROM permissions WHERE id IN (${placeholders})`, permissionIds);
      const unauthorized = perms.filter(p => !userPerms.includes(p.key_name));
      if (unauthorized.length > 0) {
        return res.status(403).json({ error: 'You can only assign permissions you have' });
      }
    }

    if (discordRoleId !== undefined) {
      await pool.execute(
        'UPDATE roles SET display_name = COALESCE(?, display_name), color = COALESCE(?, color), description = COALESCE(?, description), discord_role_id = ? WHERE id = ?',
        [displayName, color, description, discordRoleId || null, roleId]
      );
    } else {
      await pool.execute(
        'UPDATE roles SET display_name = COALESCE(?, display_name), color = COALESCE(?, color), description = COALESCE(?, description) WHERE id = ?',
        [displayName, color, description, roleId]
      );
    }

    // Replace permissions if provided
    if (permissionIds !== undefined) {
      await pool.execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      if (permissionIds.length > 0) {
        for (const pid of permissionIds) {
          await pool.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
        }
      }
    }

    res.json({ message: 'Role updated' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/roles/:id — delete role
router.delete('/:id', requireAuth, requirePermission('admin.manage_roles'), async (req, res) => {
  try {
    const [role] = await pool.execute('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (role.length === 0) return res.status(404).json({ error: 'Role not found' });
    if (role[0].is_default) return res.status(400).json({ error: 'Cannot delete the default role' });

    await pool.execute('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Role deleted' });
  } catch (err) {
    console.error('Delete role error:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// GET /api/roles/users/:userId — get user's assigned roles (GM only)
router.get('/users/:userId', requireAuth, requireGuildMaster, async (req, res) => {
  try {
    const [roles] = await pool.execute(`
      SELECT r.* FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.id
    `, [req.params.userId]);
    res.json({ roles });
  } catch (err) {
    console.error('Get user roles error:', err);
    res.status(500).json({ error: 'Failed to fetch user roles' });
  }
});

// PUT /api/roles/users/:userId — set user's roles (replace all, GM only)
router.put('/users/:userId', requireAuth, requireGuildMaster, async (req, res) => {
  try {
    const { roleIds } = req.body;
    const userId = req.params.userId;

    // Verify user exists
    const [user] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    // Replace roles
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    if (roleIds && roleIds.length > 0) {
      for (const rid of roleIds) {
        await pool.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, rid]);
      }
    }

    res.json({ message: 'User roles updated' });
  } catch (err) {
    console.error('Set user roles error:', err);
    res.status(500).json({ error: 'Failed to update user roles' });
  }
});

module.exports = router;
