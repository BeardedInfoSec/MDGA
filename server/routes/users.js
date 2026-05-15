const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { sendOfficerAlert, sendUnbanRequest } = require('../bot');
const { sendApprovalEmail } = require('../services/email');

const router = express.Router();
const RANK_ORDER = { recruit: 0, member: 1, veteran: 2, officer: 3, guildmaster: 4 };

// GET /api/users — paginated + searchable. Returns { users, total, page, page_size }.
// Search matches username / display_name / email (case-insensitive). Filter by rank
// via ?rank=<value>. The legacy "return everything" behavior is preserved when
// page_size=all (used by tools like the audit script and any old client code).
router.get('/', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const rank = String(req.query.rank || '').trim();
    const wantAll = String(req.query.page_size || '') === 'all';
    const pageSize = wantAll ? null : Math.min(200, Math.max(1, parseInt(req.query.page_size, 10) || 50));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const where = [];
    const params = [];
    if (search) {
      const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      where.push('(username LIKE ? OR display_name LIKE ? OR email LIKE ?)');
      params.push(like, like, like);
    }
    if (rank && RANK_ORDER.hasOwnProperty(rank)) {
      where.push('`rank` = ?');
      params.push(rank);
    }
    // ?locked_only=1 — surfaces just users with a manual rank override.
    // Used by the Member Overrides admin page to show "currently overridden"
    // without making the admin search for them by name.
    if (req.query.locked_only === '1' || req.query.locked_only === 'true') {
      where.push('rank_locked = 1');
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users ${whereClause}`,
      params
    );

    const limitClause = wantAll
      ? ''
      : `LIMIT ${parseInt(pageSize, 10)} OFFSET ${parseInt((page - 1) * pageSize, 10)}`;

    const [rows] = await pool.execute(
      `SELECT id, username, email, display_name, \`rank\`, rank_locked, avatar_url, created_at
       FROM users
       ${whereClause}
       ORDER BY FIELD(\`rank\`, "guildmaster","officer","veteran","member","recruit"), created_at ASC
       ${limitClause}`,
      params
    );

    // Opt-in: ?include=roles attaches each user's RBAC permission roles. Used
    // by the Member Overrides page so admins can see + edit ranks AND roles
    // in one place (the dual-system confusion otherwise hides Website Guru,
    // Event Manager, etc. behind the rank dropdown's recruit/.../guildmaster
    // ENUM).
    const include = String(req.query.include || '').split(',').map(s => s.trim());
    if (include.includes('roles') && rows.length > 0) {
      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const [roleRows] = await pool.execute(
        `SELECT ur.user_id, r.id, r.name, r.display_name, r.color
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id IN (${placeholders})
         ORDER BY r.display_name ASC`,
        ids
      );
      const byUser = new Map();
      for (const rr of roleRows) {
        const arr = byUser.get(rr.user_id) || [];
        arr.push({ id: rr.id, name: rr.name, display_name: rr.display_name, color: rr.color });
        byUser.set(rr.user_id, arr);
      }
      for (const u of rows) {
        u.roles = byUser.get(u.id) || [];
      }
    }

    res.json({
      users: rows,
      total: countRow.total,
      page,
      page_size: wantAll ? rows.length : pageSize,
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/banned — list all banned users
router.get('/banned', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.display_name, u.email, u.discord_username, u.avatar_url,
              u.ban_reason, u.banned_at, u.banned_by,
              b.display_name AS banned_by_name
       FROM users u
       LEFT JOIN users b ON b.id = u.banned_by
       WHERE u.status = 'banned'
       ORDER BY u.banned_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('Get banned users error:', err);
    res.status(500).json({ error: 'Failed to fetch banned users' });
  }
});

// PUT /api/users/:id/rank
router.put('/:id/rank', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const { rank } = req.body;
    if (!RANK_ORDER.hasOwnProperty(rank)) {
      return res.status(400).json({ error: 'Invalid rank' });
    }

    if (['officer', 'guildmaster'].includes(rank) && req.user.rank !== 'guildmaster') {
      return res.status(403).json({ error: 'Only the Guild Master can promote to officer or above' });
    }

    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own rank' });
    }

    const [targetRows] = await pool.execute('SELECT `rank` FROM users WHERE id = ?', [req.params.id]);
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (RANK_ORDER[targetRows[0].rank] >= RANK_ORDER[req.user.rank] && req.user.rank !== 'guildmaster') {
      return res.status(403).json({ error: 'Cannot modify a user of equal or higher rank' });
    }

    // Manual rank change auto-locks the user. Otherwise the next
    // discord-role-sync cycle (which can fire seconds later when Discord pushes
    // a guildMemberUpdate event) recomputes rank from the user's Discord roles
    // and silently overwrites the change. The admin can later unlock from the
    // User Roles tab if they want auto-sync resumed.
    await pool.execute(
      'UPDATE users SET `rank` = ?, rank_locked = TRUE WHERE id = ?',
      [rank, req.params.id]
    );
    res.json({ message: `User rank updated to ${rank} (auto-locked from Discord sync — unlock from User Roles if you want sync resumed)` });
  } catch (err) {
    console.error('Update rank error:', err);
    res.status(500).json({ error: 'Failed to update rank' });
  }
});

// PUT /api/users/:id/rank-lock — toggle the manual-override flag.
// Locked users are skipped by discord-role-sync (rank stays whatever it
// was last set to manually). Ban/leave still suspends them via bot.js.
// Gated by users.manage_overrides — granted to Guild Master by default
// via migration 046, but any role with that permission can use it.
router.put('/:id/rank-lock', requireAuth, requirePermission('users.manage_overrides'), async (req, res) => {
  try {
    const { locked } = req.body;
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: '`locked` must be true or false' });
    }
    const [targetRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not found' });

    await pool.execute('UPDATE users SET rank_locked = ? WHERE id = ?', [locked ? 1 : 0, req.params.id]);
    res.json({ message: locked ? 'Rank locked — Discord sync will skip this user.' : 'Rank unlocked — Discord sync will resume.' });
  } catch (err) {
    console.error('Update rank lock error:', err);
    res.status(500).json({ error: 'Failed to update rank lock' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const [targetRows] = await pool.execute('SELECT `rank` FROM users WHERE id = ?', [req.params.id]);
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (RANK_ORDER[targetRows[0].rank] >= RANK_ORDER[req.user.rank]) {
      return res.status(403).json({ error: 'Cannot delete a user of equal or higher rank' });
    }

    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// PUT /api/users/:id/ban — ban a user
router.put('/:id/ban', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Ban reason is required' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot ban yourself' });
    }

    const [targetRows] = await pool.execute('SELECT `rank`, status, display_name, username FROM users WHERE id = ?', [userId]);
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not found' });

    const target = targetRows[0];
    if (RANK_ORDER[target.rank] >= RANK_ORDER[req.user.rank] && req.user.rank !== 'guildmaster') {
      return res.status(403).json({ error: 'Cannot ban a user of equal or higher rank' });
    }

    await pool.execute(
      'UPDATE users SET status = ?, ban_reason = ?, banned_at = NOW(), banned_by = ? WHERE id = ?',
      ['banned', reason.trim(), req.user.id, userId]
    );

    const name = target.display_name || target.username;
    sendOfficerAlert(
      'User Banned',
      `**${name}** has been banned by **${req.user.display_name || req.user.username}**.\n\n` +
      `**Reason:** ${reason.trim()}`,
      0x000000
    );

    res.json({ message: `${name} has been banned` });
  } catch (err) {
    console.error('Ban user error:', err);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// PUT /api/users/:id/unban-request — request unban (goes to Discord for second officer approval)
router.put('/:id/unban-request', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { reason } = req.body;

    const [targetRows] = await pool.execute(
      'SELECT id, username, display_name, discord_username, ban_reason, banned_at FROM users WHERE id = ? AND status = ?',
      [userId, 'banned']
    );
    if (targetRows.length === 0) return res.status(404).json({ error: 'Banned user not found' });

    const target = targetRows[0];
    const requestedBy = req.user.display_name || req.user.username;

    // Send to Discord officer channel for second approval
    await sendUnbanRequest(target, requestedBy, reason || '');

    res.json({ message: 'Unban request sent to officer channel for approval' });
  } catch (err) {
    console.error('Unban request error:', err);
    res.status(500).json({ error: 'Failed to submit unban request' });
  }
});

// POST /api/users/:id/resend-invite — resend approval email with Discord invite
router.post('/:id/resend-invite', requireAuth, requirePermission('admin.manage_users'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT email, display_name, username, status FROM users WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    if (user.status !== 'active') {
      return res.status(400).json({ error: 'Can only resend invite to active users' });
    }
    if (!user.email) {
      return res.status(400).json({ error: 'User has no email address on file' });
    }

    const sent = await sendApprovalEmail(user.email, user.display_name || user.username);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send email — check SMTP configuration' });
    }

    res.json({ message: 'Invite email sent' });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

module.exports = router;
