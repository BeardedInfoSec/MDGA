const pool = require('../db');
const { fetchAllGuildMembers } = require('../bot');

const CYCLE_INTERVAL = 30 * 60 * 1000;    // 30 minutes
const INITIAL_DELAY = 90 * 1000;          // 90s after boot (after bot clientReady)

let running = false;

async function syncDiscordMembers() {
  if (running) {
    console.log('[Discord member sync] Previous cycle still running — skipping');
    return { skipped: true };
  }
  running = true;
  const syncStart = new Date();

  try {
    const members = await fetchAllGuildMembers();
    if (!members) {
      console.warn('[Discord member sync] Bot not ready or guild not cached — skipping cycle');
      return { skipped: true, reason: 'bot_not_ready' };
    }

    const seenIds = new Set();
    for (const m of members) {
      seenIds.add(m.discord_id);
      await pool.execute(
        `INSERT INTO discord_members
          (discord_id, username, display_name, nickname, joined_at, is_in_guild, roles_json, last_synced_at, left_at)
         VALUES (?, ?, ?, ?, ?, TRUE, ?, NOW(), NULL)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           display_name = VALUES(display_name),
           nickname = VALUES(nickname),
           joined_at = VALUES(joined_at),
           is_in_guild = TRUE,
           roles_json = VALUES(roles_json),
           last_synced_at = NOW(),
           left_at = NULL`,
        [
          m.discord_id,
          m.username || null,
          m.display_name || null,
          m.nickname || null,
          m.joined_at || null,
          JSON.stringify(m.roles || []),
        ]
      );
    }

    // Mark anyone not in this pass as having left.
    // Only flip rows that were previously in guild and we haven't marked left yet.
    const [stale] = await pool.execute(
      'SELECT id, discord_id FROM discord_members WHERE is_in_guild = TRUE'
    );
    let markedLeft = 0;
    for (const row of stale) {
      if (!seenIds.has(row.discord_id)) {
        await pool.execute(
          'UPDATE discord_members SET is_in_guild = FALSE, left_at = NOW(), last_synced_at = NOW() WHERE id = ?',
          [row.id]
        );
        markedLeft++;
      }
    }

    console.log(
      `[Discord member sync] Cycle complete in ${Math.round((Date.now() - syncStart.getTime()) / 1000)}s — ` +
      `upserted ${members.length}, marked ${markedLeft} as left`
    );
    return { upserted: members.length, markedLeft };
  } finally {
    running = false;
  }
}

// Triggered by startBot() via clientReady so we don't run before the bot is online.
function start() {
  setTimeout(() => {
    (async () => {
      try {
        console.log('[Discord member sync] Starting initial cycle...');
        await syncDiscordMembers();
      } catch (err) {
        console.error('[Discord member sync] Initial cycle error:', err.message);
      }
    })();

    setInterval(async () => {
      try {
        await syncDiscordMembers();
      } catch (err) {
        console.error('[Discord member sync] Cycle error:', err.message);
      }
    }, CYCLE_INTERVAL);
  }, INITIAL_DELAY);

  console.log(
    `[Discord member sync] Scheduled — first cycle in ${INITIAL_DELAY / 1000}s, then every ${CYCLE_INTERVAL / 60000}m`
  );
}

module.exports = { syncDiscordMembers, start };
