// ================================================
// Event-goes-live Discord notifier (rapazzini forum #65 item 3).
//
// When an event's starts_at lands, post an embed to the events Discord
// channel with @here so members get pinged that it's happening now. Runs
// every 60s; idempotency comes from events.live_announced_at (set the
// moment the Discord send succeeds, so a same-tick double-fire or a pm2
// restart can't re-announce).
//
// Catch-up window: only announce events whose starts_at is within the
// last hour. If pm2 was down longer than that, the event silently rolls
// past unannounced — a stale "live now" ping for an event that started
// three hours ago is more confusing than helpful.
// ================================================
const { DateTime } = require('luxon');
const pool = require('../db');
const { sendDiscordAnnouncement } = require('../bot');

const EVENTS_CHANNEL_ID = '1483266989647724758';
const CYCLE_INTERVAL = 60 * 1000;
const INITIAL_DELAY = 90 * 1000;

const CATEGORY_LABELS = {
  pvp: 'PvP',
  defense: 'Defense',
  social: 'Social',
  raid: 'Raid',
};

function buildDescription(ev) {
  const lines = [];
  if (ev.category) lines.push(`**Category:** ${CATEGORY_LABELS[ev.category] || ev.category.toUpperCase()}`);
  if (ev.ends_at) {
    // Show the end time in the event's authoring timezone so members
    // know when it wraps. fromSQL with zone:'utc' is the safe parser
    // for the 'yyyy-MM-dd HH:mm:ss' SQL string.
    const endLocal = DateTime.fromSQL(String(ev.ends_at), { zone: 'utc' })
      .setZone(ev.timezone || 'UTC')
      .toFormat('h:mm a ZZZZ');
    lines.push(`**Ends:** ${endLocal}`);
  }
  if (ev.prize) lines.push(`**Prize:** ${String(ev.prize).slice(0, 200)}`);
  if (ev.description) {
    const trimmed = String(ev.description).trim().slice(0, 1200);
    if (trimmed) lines.push('', trimmed);
  }
  lines.push('', 'https://mdga.gg/events');
  return lines.join('\n');
}

async function runCycle() {
  try {
    const [rows] = await pool.execute(`
      SELECT e.id, e.title, e.starts_at, e.ends_at, e.timezone, e.category,
             e.description, e.prize
        FROM events e
       WHERE e.starts_at IS NOT NULL
         AND e.starts_at <= NOW()
         AND e.starts_at >= NOW() - INTERVAL 1 HOUR
         AND e.live_announced_at IS NULL
         AND (e.publish_at IS NULL OR e.publish_at <= NOW())
       ORDER BY e.starts_at ASC
       LIMIT 20`);

    if (rows.length === 0) return;

    for (const ev of rows) {
      try {
        const sent = await sendDiscordAnnouncement(
          EVENTS_CHANNEL_ID,
          `Now live: ${ev.title}`,
          buildDescription(ev),
          0xDC2626,
          { ping: 'here' }
        );
        if (sent) {
          await pool.execute(
            'UPDATE events SET live_announced_at = NOW() WHERE id = ? AND live_announced_at IS NULL',
            [ev.id]
          );
          console.log(`[Event live scheduler] announced event ${ev.id} "${ev.title}"`);
        } else {
          // Bot couldn't post (Missing Access etc.). Leave live_announced_at
          // NULL so we retry next tick — eventually either the perms get
          // granted or the 1-hour catch-up window closes and it rolls past.
          console.warn(`[Event live scheduler] send failed for event ${ev.id} — will retry`);
        }
      } catch (err) {
        console.error(`[Event live scheduler] event ${ev.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Event live scheduler] cycle error:', err.message);
  }
}

setTimeout(() => {
  (async () => { try { await runCycle(); } catch (e) { console.error('[Event live scheduler] initial:', e); } })();
  setInterval(() => {
    (async () => { try { await runCycle(); } catch (e) { console.error('[Event live scheduler] tick:', e); } })();
  }, CYCLE_INTERVAL).unref?.();
}, INITIAL_DELAY).unref?.();

console.log(`[Event live scheduler] Started — first cycle in ${INITIAL_DELAY / 1000}s, then every ${CYCLE_INTERVAL / 1000}s`);

module.exports = { runCycle };
