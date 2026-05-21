// ================================================
// Scheduled-event publish notifier.
//
// Events created with a future publish_at don't broadcast a notification
// at create time — that would alert members before the event is visible
// to them. This scheduler fires the broadcast once publish_at has
// landed, exactly once per event.
//
// Dedup is done by checking the notifications table for any existing
// 'event' notification with source_id = event.id. No new column needed
// on events; the absence of a notification row is the source of truth.
// ================================================
const pool = require('../db');
const { broadcastNotification } = require('./notifications');

const CYCLE_INTERVAL = 60 * 1000;      // 1 minute
const INITIAL_DELAY = 90 * 1000;       // 90s after boot (give the bot time to connect)

async function runCycle() {
  try {
    // Events that JUST became visible (publish_at landed within last hour)
    // and have no prior 'event' notification yet. Window-limit prevents us
    // from spamming every legacy past event on first deploy.
    const [rows] = await pool.execute(`
      SELECT e.id, e.title, e.created_by
        FROM events e
       WHERE e.publish_at IS NOT NULL
         AND e.publish_at <= NOW()
         AND e.publish_at >= NOW() - INTERVAL 1 HOUR
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
            WHERE n.source_type = 'event' AND n.source_id = e.id AND n.type = 'event'
         )
       ORDER BY e.publish_at ASC
       LIMIT 50`);

    if (rows.length === 0) return;

    for (const ev of rows) {
      const [[creator]] = await pool.execute(
        'SELECT username FROM users WHERE id = ? LIMIT 1', [ev.created_by]
      );
      const actorName = creator?.username || 'An officer';
      await broadcastNotification({
        type: 'event',
        actorId: ev.created_by || null,
        sourceType: 'event',
        sourceId: ev.id,
        title: `${actorName} added a new event: ${String(ev.title || '').slice(0, 100)}`,
        linkUrl: '/events',
      });
      console.log(`[Event publish scheduler] broadcast for event ${ev.id} "${ev.title}"`);
    }
  } catch (err) {
    console.error('[Event publish scheduler] cycle error:', err.message);
  }
}

setTimeout(() => {
  (async () => { try { await runCycle(); } catch (e) { console.error('[Event publish scheduler] initial:', e); } })();
  setInterval(() => {
    (async () => { try { await runCycle(); } catch (e) { console.error('[Event publish scheduler] tick:', e); } })();
  }, CYCLE_INTERVAL).unref?.();
}, INITIAL_DELAY).unref?.();

console.log(`[Event publish scheduler] Started — first cycle in ${INITIAL_DELAY / 1000}s, then every ${CYCLE_INTERVAL / 1000}s`);

module.exports = { runCycle };
