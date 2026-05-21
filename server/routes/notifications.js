const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const stream = require('../services/notification-stream');

const router = express.Router();

const DEFAULT_PREFS = Object.freeze({
  mention: true, reply: true, event: true, giveaway_kickoff: true,
});

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

// GET /api/notifications/prefs — current user's notification preferences
// (merged with defaults). Used by the Profile settings panel.
router.get('/prefs', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT notification_prefs FROM users WHERE id = ?',
      [req.user.id]
    );
    const raw = rows[0]?.notification_prefs;
    const stored = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    res.json({ prefs: { ...DEFAULT_PREFS, ...stored } });
  } catch (err) {
    console.error('[notifications/prefs GET]', err);
    res.status(500).json({ error: 'Failed to fetch prefs' });
  }
});

// PUT /api/notifications/prefs — replace the JSON. Body: { prefs: {...} }
// Unknown keys are dropped to keep the column tidy; bool values only.
router.put('/prefs', requireAuth, async (req, res) => {
  try {
    const input = req.body?.prefs || {};
    const sanitized = {};
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (typeof input[key] === 'boolean') sanitized[key] = input[key];
    }
    await pool.execute(
      'UPDATE users SET notification_prefs = ? WHERE id = ?',
      [JSON.stringify(sanitized), req.user.id]
    );
    res.json({ prefs: { ...DEFAULT_PREFS, ...sanitized } });
  } catch (err) {
    console.error('[notifications/prefs PUT]', err);
    res.status(500).json({ error: 'Failed to update prefs' });
  }
});

// GET /api/notifications/stream — Server-Sent Events stream of new
// notifications for the current user. EventSource doesn't let us send
// custom headers, so we accept the JWT via ?token=<jwt> on this one
// endpoint. (Same secret/decode path the auth middleware uses; we just
// can't share the middleware because middleware reads the Authorization
// header.) Emits one `notification` event per row inserted.
router.get('/stream', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) { res.status(401).end('Missing token'); return; }
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { res.status(401).end('Invalid token'); return; }
  const userId = Number(payload.id);
  if (!userId) { res.status(401).end('Invalid token'); return; }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // nginx hint: don't buffer
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const unsub = stream.subscribe(userId, res);
  req.on('close', () => {
    unsub();
    try { res.end(); } catch { /* already closed */ }
  });
});

module.exports = router;
