// Admin-only endpoints that don't fit cleanly into a per-resource route file:
// audit log viewer, recycle bin (soft-deleted forum content), account lock
// management. Each individual mutating action also writes to admin_actions
// via the audit-log helper at the call site, so this file is mostly reads
// over the bookkeeping tables.
const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { logAdminAction } = require('../services/audit-log');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats — site-wide telemetry roll-up. DB-driven (no
// pageview tracking yet); covers accounts, logins, forum, events, and
// guild membership counts.
// ─────────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const [
      [accounts], [accountsByStatus], [signupsToday], [signups7d],
      [loginsToday], [logins7d], [activeUsers7d],
      [forumPosts], [forumComments], [forumPostsToday],
      [topPosters],
      [events], [upcomingEvents], [rsvpsGoing], [rsvpsMaybe],
      [characters], [linkedCharacters],
      [discordMembers],
      [recentSignups], [recentLogins], [recentPosts],
    ] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS n FROM users'),
      pool.execute("SELECT status, COUNT(*) AS n FROM users GROUP BY status"),
      pool.execute("SELECT COUNT(*) AS n FROM users WHERE created_at >= NOW() - INTERVAL 24 HOUR"),
      pool.execute("SELECT COUNT(*) AS n FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY"),
      pool.execute("SELECT COUNT(*) AS n FROM users WHERE last_login_at >= CURDATE()"),
      pool.execute("SELECT COUNT(*) AS n FROM users WHERE last_login_at >= NOW() - INTERVAL 7 DAY"),
      pool.execute("SELECT COUNT(*) AS n FROM users WHERE last_login_at >= NOW() - INTERVAL 7 DAY AND status='active'"),
      pool.execute('SELECT COUNT(*) AS n FROM forum_posts WHERE deleted_at IS NULL'),
      pool.execute('SELECT COUNT(*) AS n FROM forum_comments WHERE deleted_at IS NULL'),
      pool.execute("SELECT COUNT(*) AS n FROM forum_posts WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 24 HOUR"),
      pool.execute(`
        SELECT u.id, u.username, u.display_name, u.display_rank, u.\`rank\`,
               COUNT(fp.id) AS post_count
        FROM users u
        LEFT JOIN forum_posts fp ON fp.user_id = u.id AND fp.deleted_at IS NULL
        GROUP BY u.id HAVING post_count > 0
        ORDER BY post_count DESC LIMIT 5`),
      pool.execute('SELECT COUNT(*) AS n FROM events'),
      pool.execute('SELECT COUNT(*) AS n FROM events WHERE starts_at >= NOW()'),
      pool.execute("SELECT COUNT(*) AS n FROM event_rsvps WHERE status='going'"),
      pool.execute("SELECT COUNT(*) AS n FROM event_rsvps WHERE status='maybe'"),
      pool.execute('SELECT COUNT(*) AS n FROM user_characters'),
      pool.execute('SELECT COUNT(DISTINCT user_id) AS n FROM user_characters'),
      pool.execute('SELECT COUNT(*) AS n FROM discord_members WHERE is_in_guild = 1'),
      pool.execute(`
        SELECT id, username, display_name, status, created_at
        FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY
        ORDER BY created_at DESC LIMIT 10`),
      pool.execute(`
        SELECT id, username, display_name, last_login_at
        FROM users WHERE last_login_at IS NOT NULL
        ORDER BY last_login_at DESC LIMIT 10`),
      pool.execute(`
        SELECT fp.id, fp.title, fp.created_at,
               u.username, u.display_name, u.display_rank, u.\`rank\`,
               fc.name AS category_name
        FROM forum_posts fp
        JOIN users u ON u.id = fp.user_id
        JOIN forum_categories fc ON fc.id = fp.category_id
        WHERE fp.deleted_at IS NULL
        ORDER BY fp.created_at DESC LIMIT 10`),
    ]);

    res.json({
      accounts: {
        total: accounts[0].n,
        byStatus: Object.fromEntries(accountsByStatus.map(r => [r.status, r.n])),
        signupsToday: signupsToday[0].n,
        signups7d: signups7d[0].n,
      },
      logins: {
        today: loginsToday[0].n,
        last7d: logins7d[0].n,
        activeUsers7d: activeUsers7d[0].n,
      },
      forum: {
        posts: forumPosts[0].n,
        comments: forumComments[0].n,
        postsToday: forumPostsToday[0].n,
        topPosters,
      },
      events: {
        total: events[0].n,
        upcoming: upcomingEvents[0].n,
        rsvpsGoing: rsvpsGoing[0].n,
        rsvpsMaybe: rsvpsMaybe[0].n,
      },
      characters: {
        total: characters[0].n,
        linkedUsers: linkedCharacters[0].n,
      },
      discord: {
        membersInGuild: discordMembers[0].n,
      },
      recent: {
        signups: recentSignups,
        logins: recentLogins,
        posts: recentPosts,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/admin/audit-log — paginated list of recorded admin actions.
// Filters: ?admin=<userId>&type=<action_type prefix>&since=<ISO>
// ─────────────────────────────────────────────────────────────────────────
router.get('/audit-log', requireAuth, requirePermission('admin.view_audit_log'), async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * limit;

    const filters = [];
    const params = [];
    if (req.query.admin) {
      const adminId = parseInt(req.query.admin, 10);
      if (Number.isInteger(adminId)) { filters.push('a.admin_user_id = ?'); params.push(adminId); }
    }
    if (req.query.type) {
      filters.push('a.action_type LIKE ?');
      params.push(`${String(req.query.type).slice(0, 60)}%`);
    }
    if (req.query.since) {
      filters.push('a.created_at >= ?');
      params.push(new Date(req.query.since));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM admin_actions a ${where}`,
      params
    );
    const [rows] = await pool.execute(
      `SELECT a.id, a.admin_user_id, a.action_type, a.target_type, a.target_id,
              a.summary, a.metadata, a.created_at,
              u.display_name AS admin_display_name, u.username AS admin_username
       FROM admin_actions a
       LEFT JOIN users u ON u.id = a.admin_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    res.json({ entries: rows, total: countRow.total, page, limit });
  } catch (err) {
    console.error('[admin/audit-log]', err);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Recycle bin — soft-deleted posts & comments.
// ─────────────────────────────────────────────────────────────────────────
router.get('/recycle-bin', requireAuth, requirePermission('admin.manage_recycle_bin'), async (req, res) => {
  try {
    const [posts] = await pool.execute(`
      SELECT fp.id, fp.title, fp.content, fp.category_id, fp.user_id,
             fp.created_at, fp.deleted_at, fp.deleted_by,
             u.username, u.display_name,
             du.username AS deleted_by_username, du.display_name AS deleted_by_display_name,
             fc.name AS category_name
      FROM forum_posts fp
      LEFT JOIN users u ON u.id = fp.user_id
      LEFT JOIN users du ON du.id = fp.deleted_by
      LEFT JOIN forum_categories fc ON fc.id = fp.category_id
      WHERE fp.deleted_at IS NOT NULL
      ORDER BY fp.deleted_at DESC
      LIMIT 200
    `);
    const [comments] = await pool.execute(`
      SELECT fc.id, fc.post_id, fc.content, fc.user_id,
             fc.created_at, fc.deleted_at, fc.deleted_by,
             u.username, u.display_name,
             du.username AS deleted_by_username, du.display_name AS deleted_by_display_name,
             fp.title AS post_title
      FROM forum_comments fc
      LEFT JOIN users u ON u.id = fc.user_id
      LEFT JOIN users du ON du.id = fc.deleted_by
      LEFT JOIN forum_posts fp ON fp.id = fc.post_id
      WHERE fc.deleted_at IS NOT NULL
      ORDER BY fc.deleted_at DESC
      LIMIT 200
    `);
    res.json({ posts, comments });
  } catch (err) {
    console.error('[admin/recycle-bin]', err);
    res.status(500).json({ error: 'Failed to load recycle bin' });
  }
});

router.post('/recycle-bin/posts/:id/restore', requireAuth, requirePermission('admin.manage_recycle_bin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const [result] = await pool.execute(
      'UPDATE forum_posts SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Post not found in recycle bin' });
    logAdminAction({
      adminUserId: req.user.id, actionType: 'post.restore', targetType: 'forum_post', targetId: id,
      summary: `Restored post #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/recycle-bin/restore post]', err);
    res.status(500).json({ error: 'Failed to restore post' });
  }
});

router.post('/recycle-bin/comments/:id/restore', requireAuth, requirePermission('admin.manage_recycle_bin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const [result] = await pool.execute(
      'UPDATE forum_comments SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Comment not found in recycle bin' });
    logAdminAction({
      adminUserId: req.user.id, actionType: 'comment.restore', targetType: 'forum_comment', targetId: id,
      summary: `Restored comment #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/recycle-bin/restore comment]', err);
    res.status(500).json({ error: 'Failed to restore comment' });
  }
});

router.delete('/recycle-bin/posts/:id', requireAuth, requirePermission('admin.manage_recycle_bin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    // Hard delete only allowed for already soft-deleted rows.
    const [result] = await pool.execute(
      'DELETE FROM forum_posts WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Post not in recycle bin' });
    logAdminAction({
      adminUserId: req.user.id, actionType: 'post.purge', targetType: 'forum_post', targetId: id,
      summary: `Permanently purged post #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/recycle-bin/purge post]', err);
    res.status(500).json({ error: 'Failed to purge post' });
  }
});

router.delete('/recycle-bin/comments/:id', requireAuth, requirePermission('admin.manage_recycle_bin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const [result] = await pool.execute(
      'DELETE FROM forum_comments WHERE id = ? AND deleted_at IS NOT NULL',
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Comment not in recycle bin' });
    logAdminAction({
      adminUserId: req.user.id, actionType: 'comment.purge', targetType: 'forum_comment', targetId: id,
      summary: `Permanently purged comment #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/recycle-bin/purge comment]', err);
    res.status(500).json({ error: 'Failed to purge comment' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Account lock — adds an enforceable layer beyond status='banned'. Active
// when account_locked_at is set AND (account_locked_until IS NULL OR > NOW()).
// requireAuth elsewhere checks status='active' but not lock state — that
// gate lives in the auth middleware (added separately).
// ─────────────────────────────────────────────────────────────────────────
router.post('/users/:id/lock', requireAuth, requirePermission('admin.manage_account_lock'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot lock your own account' });

    const reason = String(req.body.reason || '').trim().slice(0, 500) || null;
    let untilDate = null;
    if (req.body.until) {
      const d = new Date(req.body.until);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid until date' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ error: 'until must be in the future' });
      untilDate = d;
    }
    // Block locking other guildmasters unless requester is also guildmaster.
    const [[target]] = await pool.execute('SELECT id, `rank` FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.rank === 'guildmaster' && req.user.rank !== 'guildmaster') {
      return res.status(403).json({ error: 'Only a guildmaster may lock another guildmaster' });
    }

    await pool.execute(
      `UPDATE users
         SET account_locked_at = NOW(),
             account_locked_until = ?,
             account_locked_reason = ?,
             account_locked_by = ?
       WHERE id = ?`,
      [untilDate, reason, req.user.id, id]
    );
    logAdminAction({
      adminUserId: req.user.id, actionType: 'user.lock', targetType: 'user', targetId: id,
      summary: untilDate ? `Locked user #${id} until ${untilDate.toISOString()}` : `Locked user #${id} indefinitely`,
      metadata: { reason, until: untilDate ? untilDate.toISOString() : null },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/lock]', err);
    res.status(500).json({ error: 'Failed to lock account' });
  }
});

router.post('/users/:id/unlock', requireAuth, requirePermission('admin.manage_account_lock'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
    await pool.execute(
      `UPDATE users
         SET account_locked_at = NULL,
             account_locked_until = NULL,
             account_locked_reason = NULL,
             account_locked_by = NULL
       WHERE id = ?`,
      [id]
    );
    logAdminAction({
      adminUserId: req.user.id, actionType: 'user.unlock', targetType: 'user', targetId: id,
      summary: `Unlocked user #${id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/unlock]', err);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Post edit history — list previous revisions of a forum post.
// ─────────────────────────────────────────────────────────────────────────
router.get('/posts/:id/revisions', requireAuth, requirePermission('admin.view_audit_log'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid post id' });
    const [rows] = await pool.execute(`
      SELECT r.id, r.post_id, r.previous_title, r.previous_content, r.edited_at, r.edited_by,
             u.username, u.display_name
      FROM forum_post_revisions r
      LEFT JOIN users u ON u.id = r.edited_by
      WHERE r.post_id = ?
      ORDER BY r.edited_at DESC
      LIMIT 50
    `, [id]);
    res.json({ revisions: rows });
  } catch (err) {
    console.error('[admin/posts/revisions]', err);
    res.status(500).json({ error: 'Failed to load revisions' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Edit a member's linked WoW characters (and choose which is main).
// ─────────────────────────────────────────────────────────────────────────
router.get('/users/:id/characters', requireAuth, requirePermission('users.manage_characters'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });
    const [rows] = await pool.execute(`
      SELECT id, user_id, character_name, realm_slug, realm, class, spec, race, level,
             faction, guild_name, is_main, created_at
      FROM user_characters
      WHERE user_id = ?
      ORDER BY is_main DESC, character_name ASC
    `, [id]);
    res.json({ characters: rows });
  } catch (err) {
    console.error('[admin/users/characters]', err);
    res.status(500).json({ error: 'Failed to load characters' });
  }
});

router.post('/users/:userId/characters/:charId/main', requireAuth, requirePermission('users.manage_characters'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = parseInt(req.params.userId, 10);
    const charId = parseInt(req.params.charId, 10);
    if (!Number.isInteger(userId) || !Number.isInteger(charId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    await conn.beginTransaction();
    const [[char]] = await conn.execute(
      'SELECT id, character_name FROM user_characters WHERE id = ? AND user_id = ?',
      [charId, userId]
    );
    if (!char) {
      await conn.rollback();
      return res.status(404).json({ error: 'Character not found for this user' });
    }
    await conn.execute('UPDATE user_characters SET is_main = FALSE WHERE user_id = ?', [userId]);
    await conn.execute('UPDATE user_characters SET is_main = TRUE WHERE id = ?', [charId]);
    await conn.commit();
    logAdminAction({
      adminUserId: req.user.id, actionType: 'user.set_main_character',
      targetType: 'user', targetId: userId,
      summary: `Set main character for user #${userId} to ${char.character_name}`,
      metadata: { character_id: charId, character_name: char.character_name },
    });
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[admin/users/characters/main]', err);
    res.status(500).json({ error: 'Failed to set main character' });
  } finally {
    conn.release();
  }
});

router.delete('/users/:userId/characters/:charId', requireAuth, requirePermission('users.manage_characters'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const charId = parseInt(req.params.charId, 10);
    if (!Number.isInteger(userId) || !Number.isInteger(charId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const [[char]] = await pool.execute(
      'SELECT id, character_name FROM user_characters WHERE id = ? AND user_id = ?',
      [charId, userId]
    );
    if (!char) return res.status(404).json({ error: 'Character not found for this user' });
    await pool.execute('DELETE FROM user_characters WHERE id = ?', [charId]);
    logAdminAction({
      adminUserId: req.user.id, actionType: 'user.remove_character',
      targetType: 'user', targetId: userId,
      summary: `Removed character ${char.character_name} from user #${userId}`,
      metadata: { character_id: charId, character_name: char.character_name },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/characters/delete]', err);
    res.status(500).json({ error: 'Failed to remove character' });
  }
});

module.exports = router;
