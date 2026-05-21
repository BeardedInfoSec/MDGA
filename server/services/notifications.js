// ================================================
// Notification service — fanout-on-write inserts into `notifications`
// (migration-067) plus the @mention parser shared by post + comment
// create paths. Read endpoints live in routes/notifications.js.
// ================================================
const pool = require('../db');

// Matches @<name> tokens — must be at start-of-string OR preceded by
// whitespace, must be followed by a word boundary. Name char class:
// [A-Za-z0-9_] up to 30 chars (matches mention-search query cap).
const MENTION_RE = /(?:^|\s)@(\w{1,30})\b/g;

// Look up users by name across the four fields the mention-search
// endpoint exposes. Returns the first active-account match per query
// (case-insensitive exact match preferred). Used by the @mention
// parser — we don't bombard the DB with one SELECT per token; we
// dedupe + batch into a single IN query.
async function resolveMentionedUsers(names) {
  if (!names || names.length === 0) return [];
  const uniq = [...new Set(names.map((n) => String(n).toLowerCase()))];
  if (uniq.length === 0) return [];
  const placeholders = uniq.map(() => '?').join(',');
  // For each candidate name, we want to find any active user whose
  // username / display_name / discord_username / main character matches
  // case-insensitively. Build a wide OR query, then narrow in JS.
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.username, u.display_name, u.discord_username,
            uc_main.character_name AS main_character_name
       FROM users u
       LEFT JOIN user_characters uc_main
         ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      WHERE u.status = 'active'
        AND (LOWER(u.username) IN (${placeholders})
          OR LOWER(u.display_name) IN (${placeholders})
          OR LOWER(u.discord_username) IN (${placeholders})
          OR LOWER(uc_main.character_name) IN (${placeholders}))`,
    [...uniq, ...uniq, ...uniq, ...uniq]
  );
  // Map each input name → first matching user (preferring main-character
  // matches since that's what the dropdown inserts).
  const byName = new Map();
  for (const r of rows) {
    const candidates = [
      r.main_character_name, r.username, r.display_name, r.discord_username,
    ].filter(Boolean).map((s) => s.toLowerCase());
    for (const c of candidates) {
      if (uniq.includes(c) && !byName.has(c)) {
        byName.set(c, r);
      }
    }
  }
  return [...byName.values()];
}

function extractMentionedNames(text) {
  if (!text) return [];
  const out = [];
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Create a single notification row. Idempotent dedupe by
// (user_id, type, source_type, source_id, actor_id) within the last
// 30 minutes — prevents a re-edited post from spamming the mention
// target a second time, and lets the giveaway scheduler retry safely.
async function createNotification({ userId, type, actorId = null, sourceType = null, sourceId = null, title, linkUrl }) {
  if (!userId || !type || !title || !linkUrl) return null;
  if (actorId && Number(actorId) === Number(userId)) return null; // don't notify yourself
  try {
    const [dupe] = await pool.execute(
      `SELECT id FROM notifications
        WHERE user_id = ? AND type = ?
          AND (source_type <=> ?) AND (source_id <=> ?)
          AND (actor_id <=> ?)
          AND created_at >= NOW() - INTERVAL 30 MINUTE
        LIMIT 1`,
      [userId, type, sourceType, sourceId, actorId]
    );
    if (dupe.length > 0) return dupe[0].id;
    const [result] = await pool.execute(
      `INSERT INTO notifications (user_id, type, actor_id, source_type, source_id, title, link_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, actorId, sourceType, sourceId, title.slice(0, 200), linkUrl.slice(0, 500)]
    );
    return result.insertId;
  } catch (err) {
    console.error('[notifications] createNotification failed:', err.message);
    return null;
  }
}

// Broadcast a notification to all active members. Used by event-create
// and giveaway-kickoff. Skips the actor themselves, and skips users with
// no Discord link (likely orphan accounts). Returns the count inserted.
async function broadcastNotification({ type, actorId = null, sourceType = null, sourceId = null, title, linkUrl }) {
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM users WHERE status = 'active' AND discord_id IS NOT NULL
        ${actorId ? 'AND id != ?' : ''}`,
      actorId ? [actorId] : []
    );
    if (rows.length === 0) return 0;
    // Bulk insert — single statement, much cheaper than N round-trips.
    const valuesSql = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    for (const r of rows) {
      params.push(r.id, type, actorId, sourceType, sourceId, title.slice(0, 200), linkUrl.slice(0, 500));
    }
    await pool.execute(
      `INSERT INTO notifications (user_id, type, actor_id, source_type, source_id, title, link_url)
       VALUES ${valuesSql}`,
      params
    );
    return rows.length;
  } catch (err) {
    console.error('[notifications] broadcastNotification failed:', err.message);
    return 0;
  }
}

// Parse @mentions out of `text`, resolve to users, and create mention
// notifications. Returns the list of notified user ids. Safe to call
// fire-and-forget — failures log without throwing.
async function notifyMentions({ text, actorId, sourceType, sourceId, title, linkUrl }) {
  const names = extractMentionedNames(text);
  if (names.length === 0) return [];
  const users = await resolveMentionedUsers(names);
  const ids = [];
  for (const u of users) {
    const id = await createNotification({
      userId: u.id,
      type: 'mention',
      actorId,
      sourceType,
      sourceId,
      title,
      linkUrl,
    });
    if (id) ids.push(u.id);
  }
  return ids;
}

module.exports = {
  createNotification,
  broadcastNotification,
  notifyMentions,
  extractMentionedNames,
  resolveMentionedUsers,
};
