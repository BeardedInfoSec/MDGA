// ================================================
// DISCORD ROLE MAPPINGS — Map Discord roles to site ranks + RBAC roles
// Managed via Admin Panel → Discord Roles tab
// ================================================
const express = require('express');
const pool = require('../db');
const { requireAuth, requireGuildMaster } = require('../middleware/auth');
const { getGuildRoles } = require('../bot');

const router = express.Router();

// GET /api/discord-roles/guild-roles — live Discord roles from bot cache (GM only)
router.get('/guild-roles', requireAuth, requireGuildMaster, (req, res) => {
  const roles = getGuildRoles();
  res.json({ roles });
});

// GET /api/discord-roles/mappings — saved mappings from DB (GM only)
router.get('/mappings', requireAuth, requireGuildMaster, async (req, res) => {
  try {
    const [mappings] = await pool.execute(
      'SELECT m.*, m.site_rank AS `rank`, m.site_role_id AS role_id, r.display_name AS site_role_name FROM discord_role_mappings m LEFT JOIN roles r ON r.id = m.site_role_id ORDER BY m.id ASC'
    );
    res.json({ mappings });
  } catch (err) {
    console.error('Get discord role mappings error:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// PUT /api/discord-roles/mappings — batch-replace all mappings (GM only)
router.put('/mappings', requireAuth, requireGuildMaster, async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'mappings must be an array' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Clear existing mappings
    await conn.execute('DELETE FROM discord_role_mappings');

    // Insert new mappings (only those with a rank or role selected)
    for (const m of mappings) {
      const discordRoleId = m.discordRoleId || m.discord_role_id || null;
      const discordRoleName = m.discordRoleName || m.discord_role_name || '';
      const siteRank = m.siteRank || m.site_rank || m.rank || null;
      const siteRoleId = m.siteRoleId || m.site_role_id || m.role_id || null;

      if (!discordRoleId) continue;

      // Skip if neither rank nor role is set
      if (!siteRank && !siteRoleId) continue;

      await conn.execute(
        'INSERT INTO discord_role_mappings (discord_role_id, discord_role_name, site_rank, site_role_id) VALUES (?, ?, ?, ?)',
        [discordRoleId, discordRoleName, siteRank, siteRoleId]
      );
    }

    await conn.commit();
    res.json({ message: 'Mappings saved' });
  } catch (err) {
    await conn.rollback();
    console.error('Save discord role mappings error:', err);
    res.status(500).json({ error: 'Failed to save mappings' });
  } finally {
    conn.release();
  }
});

module.exports = router;
