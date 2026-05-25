const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { uploadSingleImage, saveValidatedImage } = require('../middleware/upload');
const { broadcastNotification } = require('../services/notifications');
const { sendDiscordAnnouncement } = require('../bot');

const router = express.Router();
const VALID_EVENT_CATEGORIES = new Set(['pvp', 'defense', 'social', 'raid']);
const VALID_RECURRENCE_TYPES = new Set(['weekly', 'biweekly', 'custom']);

// Channels for event Discord fanout (forum #61 follow-up):
//   General — every member sees the drop in the main channel
//   Events  — dedicated channel where the event roster lives
// Both pinged with @here so online members get a notification once per channel.
const EVENT_DISCORD_CHANNELS = ['1323847886248738888', '1483266989647724758'];

function buildEventDiscordDescription({ startsAtUtc, timezone, category, description, prize }) {
  // Render the start time in the event's authoring timezone so it matches
  // what the creator saw in the form. Members in other zones can hover the
  // /events page for their own conversion — Discord embeds don't get
  // per-viewer localization.
  //
  // startsAtUtc is the SQL string `yyyy-MM-dd HH:mm:ss` (already in UTC,
  // built by localToUtc above). Parse via fromSQL with zone:'utc' rather
  // than the Date constructor, which is environment-dependent for this
  // format and silently treats it as local time on some Node versions.
  const whenLocal = DateTime.fromSQL(String(startsAtUtc), { zone: 'utc' })
    .setZone(timezone)
    .toFormat('cccc, LLL d • h:mm a ZZZZ');
  const lines = [
    `**When:** ${whenLocal}`,
    `**Category:** ${String(category || '').toUpperCase()}`,
  ];
  if (prize) lines.push(`**Prize:** ${String(prize).slice(0, 200)}`);
  if (description) {
    const trimmed = String(description).trim().slice(0, 1200);
    if (trimmed) lines.push('', trimmed);
  }
  lines.push('', 'https://mdga.gg/events');
  return lines.join('\n');
}

async function announceEventToDiscord({ title, startsAtUtc, timezone, category, description, prize }) {
  const desc = buildEventDiscordDescription({ startsAtUtc, timezone, category, description, prize });
  for (const channelId of EVENT_DISCORD_CHANNELS) {
    try {
      await sendDiscordAnnouncement(channelId, `New event: ${title}`, desc, 0x4F46E5, { ping: 'here' });
    } catch (err) {
      console.error(`[events] discord fanout failed (channel ${channelId}):`, err.message);
    }
  }
}

function isValidTimezone(tz) {
  try {
    const dt = DateTime.now().setZone(tz);
    return dt.isValid;
  } catch {
    return false;
  }
}

function localToUtc(localIso, tz) {
  const dt = DateTime.fromISO(localIso, { zone: tz });
  if (!dt.isValid) return null;
  return dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
}

function normalizeEventPayload(payload) {
  return {
    title: (payload.title || '').trim(),
    startsAt: (payload.startsAt || '').trim(),
    endsAt: (payload.endsAt || '').trim(),
    timezone: (payload.timezone || '').trim(),
    category: (payload.category || '').trim().toLowerCase(),
    description: (payload.description || '').trim(),
    prize: (payload.prize || '').trim().slice(0, 255),
  };
}

// GET /api/events — public, optionally includes user RSVP status if authenticated
router.get('/', async (req, res) => {
  try {
    // Try to extract user ID + rank from token (optional — no 401 if
    // missing/invalid). Rank determines whether scheduled (future
    // publish_at) events are visible.
    let userId = null;
    let viewerRank = null;
    let viewerPerms = [];
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        userId = decoded.id;
        viewerRank = decoded.rank || null;
        viewerPerms = Array.isArray(decoded.permissions) ? decoded.permissions : [];
      } catch { /* ignore invalid token */ }
    }
    const canSeeScheduled = ['officer', 'guildmaster'].includes(viewerRank) || viewerPerms.includes('events.manage');
    const publishGate = canSeeScheduled ? '' : 'AND (e.publish_at IS NULL OR e.publish_at <= NOW())';

    const [rows] = await pool.execute(`
      SELECT e.id, e.title, e.publish_at,
             DATE_FORMAT(e.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
             DATE_FORMAT(e.ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
             e.timezone, e.category, e.description, e.prize,
             DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
             e.series_id, e.series_index, e.series_total,
             e.created_by AS created_by_id,
             creator.display_name AS created_by_name,
             creator.username AS created_by_username,
             creator.display_rank AS created_by_display_rank,
             creator.\`rank\` AS created_by_rank,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS rsvp_going,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe') AS rsvp_maybe,
        (SELECT COUNT(*) FROM event_screenshots s WHERE s.event_id = e.id) AS screenshot_count
      FROM events e
      LEFT JOIN users creator ON creator.id = e.created_by
      WHERE e.starts_at IS NOT NULL ${publishGate}
      ORDER BY e.starts_at ASC
    `);

    // Attach the first 8 going-RSVP users per event for the avatar stack on
    // the event card. Single batched query to avoid N+1 over large lists.
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const [going] = await pool.execute(
        `SELECT er.event_id, u.id, u.username, u.display_name, u.discord_username, u.avatar_url,
                uc_main.character_name AS main_character_name
         FROM event_rsvps er
         JOIN users u ON u.id = er.user_id
         LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
         WHERE er.event_id IN (${placeholders}) AND er.status = 'going'
         ORDER BY er.created_at ASC`,
        ids
      );
      const goingByEvent = new Map();
      for (const g of going) {
        const arr = goingByEvent.get(g.event_id) || [];
        if (arr.length < 8) {
          arr.push({
            id: g.id, username: g.username, display_name: g.display_name,
            discord_username: g.discord_username, avatar_url: g.avatar_url,
            main_character_name: g.main_character_name,
          });
        }
        goingByEvent.set(g.event_id, arr);
      }
      for (const event of rows) {
        event.going_users = goingByEvent.get(event.id) || [];
      }
    }

    // If authenticated, fetch user's RSVPs and attach to events
    if (userId) {
      const [rsvps] = await pool.execute(
        'SELECT event_id, status FROM event_rsvps WHERE user_id = ?',
        [userId]
      );
      const rsvpMap = Object.fromEntries(rsvps.map(r => [r.event_id, r.status]));
      for (const event of rows) {
        event.user_rsvp_status = rsvpMap[event.id] || null;
      }
    }

    res.json({ events: rows });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/addon-export — compact string for WoW addon import
// Format: !MDGA-EVT1!title\tstarts_unix\tends_unix\tcategory\tdescription\n...!END!
router.get('/addon-export', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT title,
             UNIX_TIMESTAMP(starts_at) AS starts_unix,
             UNIX_TIMESTAMP(ends_at) AS ends_unix,
             category, description
      FROM events
      WHERE starts_at IS NOT NULL AND starts_at >= NOW()
      ORDER BY starts_at ASC
      LIMIT 50
    `);

    if (rows.length === 0) {
      return res.type('text/plain').send('!MDGA-EVT1!!END!');
    }

    const lines = rows.map(e => {
      const title = (e.title || '').replace(/[\t\n]/g, ' ');
      const desc = (e.description || '').replace(/[\t\n]/g, ' ');
      return `${title}\t${e.starts_unix || 0}\t${e.ends_unix || 0}\t${e.category || ''}\t${desc}`;
    });

    const exportStr = '!MDGA-EVT1!' + lines.join('\n') + '!END!';
    res.type('text/plain').send(exportStr);
  } catch (err) {
    console.error('Addon export error:', err);
    res.status(500).json({ error: 'Failed to export events' });
  }
});

// POST /api/events
router.post('/', requireAuth, requirePermission('events.manage'), async (req, res) => {
  try {
    const { title, startsAt, endsAt, timezone, category, description, prize } = normalizeEventPayload(req.body || {});
    if (!title || !startsAt || !timezone || !category) {
      return res.status(400).json({ error: 'Title, start date/time, timezone, and category are required' });
    }
    if (!VALID_EVENT_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid event category' });
    }
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }

    const startsAtUtc = localToUtc(startsAt, timezone);
    if (!startsAtUtc) {
      return res.status(400).json({ error: 'Invalid start date/time format' });
    }

    let endsAtUtc = null;
    if (endsAt) {
      endsAtUtc = localToUtc(endsAt, timezone);
      if (!endsAtUtc) {
        return res.status(400).json({ error: 'Invalid end date/time format' });
      }
      if (new Date(endsAtUtc) <= new Date(startsAtUtc)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }

    const prizeValue = prize || null;

    // Compute duration offset (for recurring: shift end by same amount as start)
    const startDt = DateTime.fromISO(startsAt, { zone: timezone });
    const endDt = endsAt ? DateTime.fromISO(endsAt, { zone: timezone }) : null;
    const durationMs = endDt ? endDt.toMillis() - startDt.toMillis() : 0;

    // Check for recurrence
    const recurrence = req.body.recurrence;
    if (recurrence && recurrence.enabled) {
      const { type, count, customDays } = recurrence;
      if (!VALID_RECURRENCE_TYPES.has(type)) {
        return res.status(400).json({ error: 'Invalid recurrence type' });
      }
      const numCount = Number(count);
      if (!Number.isFinite(numCount) || numCount < 2 || numCount > 52) {
        return res.status(400).json({ error: 'Recurrence count must be between 2 and 52' });
      }
      let dayInterval;
      if (type === 'weekly') dayInterval = 7;
      else if (type === 'biweekly') dayInterval = 14;
      else {
        dayInterval = Number(customDays);
        if (!Number.isFinite(dayInterval) || dayInterval < 1 || dayInterval > 365) {
          return res.status(400).json({ error: 'Custom interval must be between 1 and 365 days' });
        }
      }

      const seriesId = crypto.randomUUID();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (let i = 0; i < numCount; i++) {
          const offsetDays = dayInterval * i;
          const instanceStart = startDt.plus({ days: offsetDays });
          const instanceStartUtc = instanceStart.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
          let instanceEndUtc = null;
          if (endDt) {
            const instanceEnd = instanceStart.plus({ milliseconds: durationMs });
            instanceEndUtc = instanceEnd.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
          }
          await conn.execute(
            'INSERT INTO events (title, starts_at, ends_at, timezone, category, description, prize, created_by, series_id, series_index, series_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [title, instanceStartUtc, instanceEndUtc, timezone, category, description || '', prizeValue, req.user.id, seriesId, i + 1, numCount]
          );
        }
        await conn.commit();
        res.status(201).json({ seriesId, count: numCount, message: `Created ${numCount} recurring events` });
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        conn.release();
      }
    } else {
      // Single event (no recurrence). publish_at is optional (forum #39):
      // future timestamp hides the event from non-managers until then.
      // Only events.manage already gates this route, so any value here is
      // implicitly authorized. ISO normalization keeps mysql2 happy.
      let publishAtValue = null;
      if (req.body.publishAt) {
        const parsed = new Date(req.body.publishAt);
        if (!Number.isNaN(parsed.getTime())) {
          publishAtValue = parsed.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
      const [result] = await pool.execute(
        'INSERT INTO events (title, starts_at, ends_at, timezone, category, description, prize, created_by, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, startsAtUtc, endsAtUtc, timezone, category, description || '', prizeValue, req.user.id, publishAtValue]
      );
      // Broadcast new-event notification to active members (skipping the
      // creator). Skip if the event is scheduled-publish-in-the-future —
      // notif fires when the post becomes visible, not when it's drafted.
      const isPublishedNow = !publishAtValue || new Date(publishAtValue) <= new Date();
      if (isPublishedNow) {
        broadcastNotification({
          type: 'event',
          actorId: req.user.id,
          sourceType: 'event',
          sourceId: result.insertId,
          title: `${req.user.username} added a new event: ${String(title).slice(0, 100)}`,
          linkUrl: '/events',
        }).catch((err) => console.error('[notifications] event broadcast failed:', err));
        // Discord fanout to General + Events channels with @here.
        // setImmediate so the HTTP response isn't blocked by the bot send.
        setImmediate(() => {
          announceEventToDiscord({ title, startsAtUtc, timezone, category, description, prize: prizeValue })
            .catch((err) => console.error('[events] discord fanout error:', err.message));
        });
      }
      res.status(201).json({ id: result.insertId, message: 'Event created' });
    }
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id
router.put('/:id', requireAuth, requirePermission('events.manage'), async (req, res) => {
  try {
    const { title, startsAt, endsAt, timezone, category, description, prize } = normalizeEventPayload(req.body || {});
    if (!title || !startsAt || !timezone || !category) {
      return res.status(400).json({ error: 'Title, start date/time, timezone, and category are required' });
    }
    if (!VALID_EVENT_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid event category' });
    }
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }

    const startsAtUtc = localToUtc(startsAt, timezone);
    if (!startsAtUtc) {
      return res.status(400).json({ error: 'Invalid start date/time format' });
    }

    let endsAtUtc = null;
    if (endsAt) {
      endsAtUtc = localToUtc(endsAt, timezone);
      if (!endsAtUtc) {
        return res.status(400).json({ error: 'Invalid end date/time format' });
      }
      if (new Date(endsAtUtc) <= new Date(startsAtUtc)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }

    const [result] = await pool.execute(
      'UPDATE events SET title = ?, starts_at = ?, ends_at = ?, timezone = ?, category = ?, description = ?, prize = ? WHERE id = ?',
      [title, startsAtUtc, endsAtUtc, timezone, category, description || '', prize || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event updated' });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', requireAuth, requirePermission('events.manage'), async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// DELETE /api/events/series/:seriesId
router.delete('/series/:seriesId', requireAuth, requirePermission('events.manage'), async (req, res) => {
  try {
    const { seriesId } = req.params;
    if (!seriesId || seriesId.length !== 36) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }
    const [result] = await pool.execute(
      'DELETE FROM events WHERE series_id = ? AND starts_at >= NOW()',
      [seriesId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'No future events found for this series' });
    }
    res.json({ deleted: result.affectedRows, message: `Deleted ${result.affectedRows} future event(s) in series` });
  } catch (err) {
    console.error('Delete event series error:', err);
    res.status(500).json({ error: 'Failed to delete event series' });
  }
});

// POST /api/events/:id/rsvp
router.post('/:id/rsvp', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'Status must be going, maybe, or not_going' });
    }

    await pool.execute(
      'INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
      [req.params.id, req.user.id, status, status]
    );

    // Return updated counts
    const [counts] = await pool.execute(`
      SELECT
        SUM(CASE WHEN status = 'going' THEN 1 ELSE 0 END) AS going_count,
        SUM(CASE WHEN status = 'maybe' THEN 1 ELSE 0 END) AS maybe_count
      FROM event_rsvps WHERE event_id = ?
    `, [req.params.id]);

    res.json({
      rsvp_going: counts[0].going_count || 0,
      rsvp_maybe: counts[0].maybe_count || 0,
      userStatus: status,
    });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ error: 'Failed to RSVP' });
  }
});

// GET /api/events/:id/rsvps
router.get('/:id/rsvps', requireAuth, async (req, res) => {
  try {
    const [rsvps] = await pool.execute(`
      SELECT r.status, u.id AS user_id, u.username, u.display_name, u.avatar_url
      FROM event_rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = ?
      ORDER BY r.status ASC, r.created_at ASC
    `, [req.params.id]);
    res.json({ rsvps });
  } catch (err) {
    console.error('Get RSVPs error:', err);
    res.status(500).json({ error: 'Failed to fetch RSVPs' });
  }
});

// ── Event screenshots ───────────────────────────────────────────────
// Per-event recap galleries. Officers (or anyone with events.manage)
// upload screenshots after an event ends; the public Events page renders
// them as a thumbnail strip + lightbox under the past-events section.

// GET /api/events/:id/screenshots — public list
router.get('/:id/screenshots', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: 'Invalid event id' });
    }
    const [rows] = await pool.execute(
      `SELECT s.id, s.url, s.caption,
              DATE_FORMAT(s.uploaded_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at,
              s.uploaded_by, u.username AS uploaded_by_username, u.display_name AS uploaded_by_name
       FROM event_screenshots s
       LEFT JOIN users u ON u.id = s.uploaded_by
       WHERE s.event_id = ?
       ORDER BY s.uploaded_at ASC`,
      [eventId]
    );
    res.json({ screenshots: rows });
  } catch (err) {
    console.error('Get screenshots error:', err);
    res.status(500).json({ error: 'Failed to fetch screenshots' });
  }
});

// POST /api/events/:id/screenshots — upload one screenshot (multipart)
// Field name: "image". Optional caption in the form body.
router.post(
  '/:id/screenshots',
  requireAuth,
  requirePermission('events.manage'),
  uploadSingleImage.single('image'),
  async (req, res) => {
    try {
      const eventId = parseInt(req.params.id, 10);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({ error: 'Invalid event id' });
      }
      const [eventRow] = await pool.execute('SELECT id FROM events WHERE id = ?', [eventId]);
      if (eventRow.length === 0) return res.status(404).json({ error: 'Event not found' });

      if (!req.file) return res.status(400).json({ error: 'No image file provided' });

      const filename = await saveValidatedImage(req.file);
      const url = `/uploads/${filename}`;
      const caption = (req.body?.caption || '').trim().slice(0, 255) || null;

      const [result] = await pool.execute(
        'INSERT INTO event_screenshots (event_id, url, caption, uploaded_by) VALUES (?, ?, ?, ?)',
        [eventId, url, caption, req.user.id]
      );
      res.status(201).json({ id: result.insertId, url, caption, uploaded_by: req.user.id });
    } catch (err) {
      console.error('Upload screenshot error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload screenshot' });
    }
  }
);

// DELETE /api/events/:id/screenshots/:sid
router.delete(
  '/:id/screenshots/:sid',
  requireAuth,
  requirePermission('events.manage'),
  async (req, res) => {
    try {
      const eventId = parseInt(req.params.id, 10);
      const sid = parseInt(req.params.sid, 10);
      if (!Number.isInteger(eventId) || !Number.isInteger(sid)) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      const [result] = await pool.execute(
        'DELETE FROM event_screenshots WHERE id = ? AND event_id = ?',
        [sid, eventId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Screenshot not found' });
      // Note: we don't currently delete the file from disk — fine for now,
      // if storage fills up we'll add a sweeper. Same pattern as carousel.
      res.json({ message: 'Screenshot deleted' });
    } catch (err) {
      console.error('Delete screenshot error:', err);
      res.status(500).json({ error: 'Failed to delete screenshot' });
    }
  }
);

module.exports = router;
