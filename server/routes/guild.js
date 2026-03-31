const express = require('express');
const pool = require('../db');
const { requireAuth, requireOfficer, requirePermission } = require('../middleware/auth');
const { syncGuild, syncAllGuilds } = require('../services/guild-sync');
const { sendOfficerAlert } = require('../bot');

const router = express.Router();

// ─── MEMBER ENDPOINTS ───

// GET /api/guild/summary — primary guild profile + recent activity + achievements (for home page)
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [guilds] = await pool.execute('SELECT * FROM guilds WHERE is_primary = TRUE LIMIT 1');
    if (guilds.length === 0) return res.json({ guild: null, recentActivity: [], recentAchievements: [] });
    const guild = guilds[0];

    const [[recentActivity], [recentAchievements]] = await Promise.all([
      pool.execute(
        `SELECT activity_type, character_name, description, occurred_at
         FROM guild_activity WHERE guild_id = ? ORDER BY occurred_at DESC LIMIT 10`,
        [guild.id]
      ),
      pool.execute(
        `SELECT achievement_name, description, completed_at
         FROM guild_achievements WHERE guild_id = ? ORDER BY completed_at DESC LIMIT 5`,
        [guild.id]
      ),
    ]);

    res.json({
      guild: {
        id: guild.id,
        name: guild.name,
        faction: guild.faction,
        member_count: guild.member_count,
        achievement_points: guild.achievement_points,
        last_synced_at: guild.last_synced_at,
      },
      recentActivity,
      recentAchievements,
    });
  } catch (err) {
    console.error('Guild summary error:', err);
    res.status(500).json({ error: 'Failed to fetch guild summary' });
  }
});

// GET /api/guild/roster — full roster with search/filter/sort/pagination
router.get('/roster', requireAuth, requirePermission('guild.view_roster'), async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const classFilter = (req.query.class || '').trim();
    const rankFilter = req.query.rank;
    const bannedOnly = req.query.banned === '1';
    const sort = req.query.sort || 'guild_rank';
    const order = (req.query.order || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const guildId = req.query.guild_id || null;
    const pageSize = req.query.page_size === 'all' ? null : Math.min(200, parseInt(req.query.page_size, 10) || 20);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const params = [];
    let guildClause = '';
    if (guildId) {
      guildClause = 'AND gm.guild_id = ?';
      params.push(parseInt(guildId, 10));
    } else {
      guildClause = 'AND g.is_primary = TRUE';
    }

    let searchClause = '';
    if (search) {
      searchClause = 'AND gm.character_name LIKE ?';
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      params.push(`%${escapedSearch}%`);
    }

    let classClause = '';
    if (classFilter) {
      classClause = 'AND gm.class = ?';
      params.push(classFilter);
    }

    let rankClause = '';
    if (rankFilter !== undefined && rankFilter !== '') {
      rankClause = 'AND gm.guild_rank = ?';
      params.push(parseInt(rankFilter, 10));
    }

    let bannedClause = '';
    if (bannedOnly) {
      bannedClause = 'AND gm.is_banned = 1';
    }

    // Validate sort column to prevent SQL injection
    const sortMap = {
      character_name: 'gm.character_name',
      level: 'gm.level',
      class: 'gm.class',
      guild_rank: 'gm.guild_rank',
      race: 'gm.race',
      site_display_name: 'u.display_name',
      discord_username: 'u.discord_username',
    };
    const sortExpr = sortMap[sort] || 'gm.guild_rank';

    // Count total matching rows
    const countParams = [...params];
    const [[countRow]] = await pool.execute(`
      SELECT COUNT(*) AS total FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      LEFT JOIN user_characters uc
        ON gm.linked_user_id IS NULL
        AND gm.character_name = uc.character_name
        AND gm.realm_slug = uc.realm_slug
      LEFT JOIN users u ON u.id = COALESCE(gm.linked_user_id, uc.user_id)
      WHERE 1=1 ${guildClause} ${searchClause} ${classClause} ${rankClause} ${bannedClause}
    `, countParams);

    // Fetch page of members (inline LIMIT/OFFSET — pool.execute() can't handle them as placeholders)
    const limitClause = pageSize
      ? `LIMIT ${parseInt(pageSize, 10)} OFFSET ${parseInt((page - 1) * pageSize, 10)}`
      : '';

    const [members] = await pool.execute(`
      SELECT gm.*, g.name AS guild_name,
             u.display_name AS site_display_name, u.avatar_url AS site_avatar,
             u.id AS site_user_id, u.\`rank\` AS site_rank,
             u.discord_username AS site_discord, u.status AS site_status,
             banner.display_name AS banned_by_name
      FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      LEFT JOIN user_characters uc
        ON gm.linked_user_id IS NULL
        AND gm.character_name = uc.character_name
        AND gm.realm_slug = uc.realm_slug
      LEFT JOIN users u ON u.id = COALESCE(gm.linked_user_id, uc.user_id)
      LEFT JOIN users banner ON banner.id = gm.banned_by
      WHERE 1=1 ${guildClause} ${searchClause} ${classClause} ${rankClause} ${bannedClause}
      ORDER BY ${sortExpr} ${order}, gm.character_name ASC
      ${limitClause}
    `, [...params]);

    // Class distribution for filter sidebar
    const classParams = guildId ? [parseInt(guildId, 10)] : [];
    const classGuildClause = guildId ? 'AND gm.guild_id = ?' : 'AND g.is_primary = TRUE';
    const [classCounts] = await pool.execute(`
      SELECT gm.class, COUNT(*) as count FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      WHERE gm.class IS NOT NULL ${classGuildClause}
      GROUP BY gm.class ORDER BY count DESC
    `, classParams);

    res.json({
      members,
      classCounts,
      total: countRow.total,
      page,
      pageSize: pageSize || 'all',
    });
  } catch (err) {
    console.error('Guild roster error:', err);
    res.status(500).json({ error: 'Failed to fetch guild roster' });
  }
});

// GET /api/guild/achievements — paginated achievements
router.get('/achievements', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) as total FROM guild_achievements ga
       JOIN guilds g ON g.id = ga.guild_id WHERE g.is_primary = TRUE`
    );

    const [achievements] = await pool.execute(
      `SELECT ga.* FROM guild_achievements ga
       JOIN guilds g ON g.id = ga.guild_id
       WHERE g.is_primary = TRUE
       ORDER BY ga.completed_at DESC
       LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`
    );

    res.json({ achievements, total: countRow.total, page, limit });
  } catch (err) {
    console.error('Guild achievements error:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// GET /api/guild/activity — activity feed
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const typeFilter = (req.query.type || '').trim();

    const params = [];
    let typeClause = '';
    if (typeFilter) {
      typeClause = 'AND ga.activity_type = ?';
      params.push(typeFilter);
    }

    const [activities] = await pool.execute(`
      SELECT ga.id, ga.activity_type, ga.character_name, ga.description, ga.occurred_at
      FROM guild_activity ga
      JOIN guilds g ON g.id = ga.guild_id
      WHERE g.is_primary = TRUE ${typeClause}
      ORDER BY ga.occurred_at DESC
      LIMIT ${parseInt(limit, 10)}
    `, [...params]);

    res.json({ activities });
  } catch (err) {
    console.error('Guild activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ─── OFFICER ENDPOINTS ───

// GET /api/guild/guilds — list all tracked guilds
router.get('/guilds', requireAuth, requireOfficer, async (req, res) => {
  try {
    const [guilds] = await pool.execute('SELECT * FROM guilds ORDER BY is_primary DESC, name ASC');
    res.json({ guilds });
  } catch (err) {
    console.error('List guilds error:', err);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// POST /api/guild/guilds — add a guild to track
router.post('/guilds', requireAuth, requirePermission('guild.manage'), async (req, res) => {
  try {
    const { realmSlug, nameSlug, isPrimary } = req.body;
    if (!realmSlug || !nameSlug) {
      return res.status(400).json({ error: 'realmSlug and nameSlug are required' });
    }

    const displayName = nameSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    await pool.execute(
      `INSERT INTO guilds (name, realm_slug, name_slug, is_primary)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
      [displayName, realmSlug.toLowerCase(), nameSlug.toLowerCase(), isPrimary ? 1 : 0]
    );

    res.json({ message: 'Guild added. Run a sync to populate data.' });
  } catch (err) {
    console.error('Add guild error:', err);
    res.status(500).json({ error: 'Failed to add guild' });
  }
});

// DELETE /api/guild/guilds/:id — remove a tracked guild
router.delete('/guilds/:id', requireAuth, requirePermission('guild.manage'), async (req, res) => {
  try {
    await pool.execute('DELETE FROM guilds WHERE id = ?', [req.params.id]);
    res.json({ message: 'Guild removed' });
  } catch (err) {
    console.error('Delete guild error:', err);
    res.status(500).json({ error: 'Failed to remove guild' });
  }
});

// POST /api/guild/sync — trigger manual sync (fire-and-forget)
router.post('/sync', requireAuth, requirePermission('guild.manage'), async (req, res) => {
  const guildId = req.body.guild_id || null;
  res.json({ message: 'Guild sync started' });

  // Run async in background
  (async () => {
    try {
      if (guildId) {
        const [guilds] = await pool.execute('SELECT * FROM guilds WHERE id = ?', [guildId]);
        if (guilds.length > 0) {
          const result = await syncGuild(guilds[0]);
          console.log(`[Guild sync] Manual sync for ${guilds[0].name_slug}:`, result);
        }
      } else {
        const results = await syncAllGuilds();
        console.log('[Guild sync] Manual sync complete:', results);
      }
    } catch (err) {
      console.error('[Guild sync] Manual sync error:', err);
    }
  })();
});

// ─── GAME RANK MAPPINGS ─── (officer+)

// GET /api/guild/game-rank-mappings/:guildId — list mappings + distinct ranks from roster
router.get('/game-rank-mappings/:guildId', requireAuth, requireOfficer, async (req, res) => {
  try {
    const guildId = parseInt(req.params.guildId, 10);
    if (!Number.isFinite(guildId)) return res.status(400).json({ error: 'Invalid guild ID' });

    // Get existing mappings
    const [mappings] = await pool.execute(
      'SELECT * FROM game_rank_mappings WHERE guild_id = ? ORDER BY game_rank ASC',
      [guildId]
    );

    // Get distinct ranks from the roster for this guild
    const [rosterRanks] = await pool.execute(
      `SELECT DISTINCT guild_rank AS \`rank\`, COUNT(*) AS count
       FROM guild_members WHERE guild_id = ?
       GROUP BY guild_rank ORDER BY guild_rank ASC`,
      [guildId]
    );

    res.json({ mappings, rosterRanks });
  } catch (err) {
    console.error('Get game rank mappings error:', err);
    res.status(500).json({ error: 'Failed to fetch game rank mappings' });
  }
});

// PUT /api/guild/game-rank-mappings/:guildId — batch save mappings
router.put('/game-rank-mappings/:guildId', requireAuth, requirePermission('guild.manage'), async (req, res) => {
  const guildId = parseInt(req.params.guildId, 10);
  if (!Number.isFinite(guildId)) return res.status(400).json({ error: 'Invalid guild ID' });

  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'mappings must be an array' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Clear existing mappings for this guild
    await conn.execute('DELETE FROM game_rank_mappings WHERE guild_id = ?', [guildId]);

    // Insert new mappings
    for (const m of mappings) {
      if (m.game_rank === undefined || m.game_rank === null) continue;
      const discordRoleId = m.discord_role_id || null;
      const siteRank = m.site_rank || null;
      const gameRankName = m.game_rank_name || null;

      // Skip if nothing is mapped
      if (!discordRoleId && !siteRank) continue;

      await conn.execute(
        `INSERT INTO game_rank_mappings (guild_id, game_rank, game_rank_name, discord_role_id, site_rank)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, m.game_rank, gameRankName, discordRoleId, siteRank]
      );
    }

    await conn.commit();
    res.json({ message: 'Game rank mappings saved' });
  } catch (err) {
    await conn.rollback();
    console.error('Save game rank mappings error:', err);
    res.status(500).json({ error: 'Failed to save game rank mappings' });
  } finally {
    conn.release();
  }
});

// ─── AUTO-SYNC: every 3 hours ───
const GUILD_SYNC_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

async function autoGuildSync() {
  try {
    console.log('[Guild auto-sync] Starting cycle...');
    const results = await syncAllGuilds();
    const summary = results.map(r => `${r.guild}: ${r.updated ? 'ok' : 'skip'}`).join(', ');
    console.log(`[Guild auto-sync] Complete: ${summary}`);
  } catch (err) {
    console.error('[Guild auto-sync] Cycle error:', err);
  }
}

// PUT /api/guild/members/:id/ban — ban a guild member
router.put('/members/:id/ban', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Ban reason is required' });
    }

    const [rows] = await pool.execute('SELECT id, character_name, realm_slug, linked_user_id FROM guild_members WHERE id = ?', [memberId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Guild member not found' });

    const member = rows[0];
    const trimmedReason = reason.trim();

    // Resolve the owning user: direct link or via user_characters match
    let userId = member.linked_user_id;
    if (!userId) {
      const [ucRows] = await pool.execute(
        `SELECT user_id FROM user_characters
         WHERE character_name = ?
           AND realm_slug = ?
         LIMIT 1`,
        [member.character_name, member.realm_slug]
      );
      if (ucRows.length > 0) userId = ucRows[0].user_id;
    }

    // Ban the guild member record
    await pool.execute(
      'UPDATE guild_members SET is_banned = 1, ban_reason = ?, banned_at = NOW(), banned_by = ? WHERE id = ?',
      [trimmedReason, req.user.id, memberId]
    );

    const bannedCharNames = [member.character_name];

    // If we found a user, ban ALL their guild characters + their site account
    if (userId) {
      // Find all other guild_members belonging to this user (via linked_user_id or user_characters)
      const [otherMembers] = await pool.execute(
        `SELECT gm.id, gm.character_name FROM guild_members gm
         LEFT JOIN user_characters uc
           ON gm.character_name = uc.character_name
           AND gm.realm_slug = uc.realm_slug
         WHERE gm.id != ? AND gm.is_banned = 0
           AND (gm.linked_user_id = ? OR uc.user_id = ?)`,
        [memberId, userId, userId]
      );

      // Ban each related guild member
      for (const om of otherMembers) {
        await pool.execute(
          'UPDATE guild_members SET is_banned = 1, ban_reason = ?, banned_at = NOW(), banned_by = ? WHERE id = ?',
          [trimmedReason, req.user.id, om.id]
        );
        bannedCharNames.push(om.character_name);
      }

      // Ban the site account
      await pool.execute(
        'UPDATE users SET status = ?, ban_reason = ?, banned_at = NOW(), banned_by = ? WHERE id = ? AND status != ?',
        ['banned', trimmedReason, req.user.id, userId, 'banned']
      );
    }

    const bannedBy = req.user.display_name || req.user.username;
    const charList = bannedCharNames.join(', ');
    sendOfficerAlert(
      'Guild Member Banned',
      `**${charList}** banned by **${bannedBy}**.\n\n**Reason:** ${trimmedReason}${bannedCharNames.length > 1 ? `\n\n*${bannedCharNames.length} characters on this account were banned.*` : ''}`,
      0x000000
    );

    res.json({ message: `${member.character_name} has been banned${bannedCharNames.length > 1 ? ` (${bannedCharNames.length} characters total)` : ''}` });
  } catch (err) {
    console.error('Ban guild member error:', err);
    res.status(500).json({ error: 'Failed to ban guild member' });
  }
});

// PUT /api/guild/members/:id/unban — unban a guild member
router.put('/members/:id/unban', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const reason = (req.body.reason || '').trim();

    const [rows] = await pool.execute('SELECT id, character_name, linked_user_id, is_banned FROM guild_members WHERE id = ?', [memberId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Guild member not found' });

    const member = rows[0];
    if (!member.is_banned) return res.status(400).json({ error: 'This member is not banned' });

    // Unban the guild member record
    await pool.execute(
      'UPDATE guild_members SET is_banned = 0, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = ?',
      [memberId]
    );

    // If linked to a site account, unban that too (set to suspended so they can re-login)
    if (member.linked_user_id) {
      await pool.execute(
        'UPDATE users SET status = ?, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = ? AND status = ?',
        ['suspended', member.linked_user_id, 'banned']
      );
    }

    const unbannedBy = req.user.display_name || req.user.username;
    const reasonLine = reason ? `\n\n**Reason:** ${reason}` : '';
    sendOfficerAlert(
      'Guild Member Unbanned',
      `**${member.character_name}** has been unbanned by **${unbannedBy}**.${reasonLine}`,
      0x34D399
    );

    res.json({ message: `${member.character_name} has been unbanned` });
  } catch (err) {
    console.error('Unban guild member error:', err);
    res.status(500).json({ error: 'Failed to unban guild member' });
  }
});

// Start first sync 2 minutes after boot, then every 3 hours
setTimeout(() => {
  autoGuildSync();
  setInterval(autoGuildSync, GUILD_SYNC_INTERVAL);
}, 2 * 60 * 1000);

module.exports = router;
