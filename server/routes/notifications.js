const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — last 30 for the current user, newest first.
// Includes the actor's display_name + avatar for the dropdown line.
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const [rows] = await pool.execute(
      `SELECT n.id, n.type, n.title, n.link_url, n.source_type, n.source_id,
              n.read_at, n.created_at,
              a.id   AS actor_id,
              a.display_name AS actor_display_name,
              a.username     AS actor_username,
              a.avatar_url   AS actor_avatar_url
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
        LIMIT ?`,
      [req.user.id, limit]
    );
    res.json({ notifications: rows });
  } catch (err) {
    console.error('[notifications/list]', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count — cheap polling endpoint for the
// bell icon's red badge. Polled every 30s from the navbar.
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ unread: row.n });
  } catch (err) {
    console.error('[notifications/unread-count]', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// POST /api/notifications/:id/read — mark a single notification read.
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad id' });
    await pool.execute(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/read]', err);
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

// POST /api/notifications/read-all — clear the badge in one shot.
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/read-all]', err);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

module.exports = router;
