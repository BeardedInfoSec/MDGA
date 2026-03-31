const pool = require('../db');
const { fetchCharacterProfile } = require('../blizzard');
const { refreshCharacter } = require('./character-sync');

const REQUIRED_GUILD_NAME = 'MAKE DUROTAR GREAT AGAIN';
const CYCLE_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
const INITIAL_DELAY = 3 * 60 * 1000;        // 3 min after boot

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processCharacter(char) {
  let profile;
  try {
    profile = await fetchCharacterProfile(char.realm_slug, char.character_name);
  } catch (err) {
    console.warn(
      `[Character scheduler] Profile fetch failed for ${char.character_name}-${char.realm_slug}: ${err.message}`
    );
    return { action: 'error', name: char.character_name };
  }

  // If profile came back but guild doesn't match, remove the character
  const charGuild = (profile?.guild_name || '').toUpperCase().trim();
  if (!profile || charGuild !== REQUIRED_GUILD_NAME) {
    const reason = profile
      ? `guild is "${profile.guild_name || 'none'}"`
      : 'profile not found';

    // Delete pvp_stats first (FK), then the character
    await pool.execute('DELETE FROM pvp_stats WHERE character_id = ?', [char.id]);
    await pool.execute('DELETE FROM user_characters WHERE id = ?', [char.id]);

    console.log(
      `[Character scheduler] Removed ${char.character_name}-${char.realm_slug} (user ${char.user_id}) — ${reason}`
    );
    return { action: 'removed', name: char.character_name, reason };
  }

  // Guild matches — full refresh
  try {
    const sync = await refreshCharacter(char, { profile });
    console.log(
      `[Character scheduler] Refreshed ${char.character_name}-${char.realm_slug} — ` +
      `profile=${sync.profileSynced} talents=${sync.talentsSynced} stats=${sync.statsSynced}`
    );
    return { action: 'refreshed', name: char.character_name };
  } catch (err) {
    console.error(
      `[Character scheduler] Refresh failed for ${char.character_name}-${char.realm_slug}:`,
      err.message
    );
    return { action: 'error', name: char.character_name };
  }
}

async function runCycle() {
  const [characters] = await pool.execute(
    'SELECT id, user_id, character_name, realm_slug FROM user_characters ORDER BY updated_at ASC'
  );

  if (characters.length === 0) {
    console.log('[Character scheduler] No characters to process');
    return;
  }

  const delayBetween = Math.floor(CYCLE_INTERVAL / characters.length);
  console.log(
    `[Character scheduler] Starting cycle: ${characters.length} characters, ` +
    `~${Math.round(delayBetween / 1000)}s between each`
  );

  let refreshed = 0;
  let removed = 0;
  let errors = 0;

  for (let i = 0; i < characters.length; i++) {
    const result = await processCharacter(characters[i]);

    if (result.action === 'refreshed') refreshed++;
    else if (result.action === 'removed') removed++;
    else errors++;

    // Wait between characters (skip delay after the last one)
    if (i < characters.length - 1) {
      await sleep(delayBetween);
    }
  }

  console.log(
    `[Character scheduler] Cycle complete: ${refreshed} refreshed, ${removed} removed, ${errors} errors`
  );
}

// ─── AUTO-SYNC: every 2 hours (offset 3 min from other sync services) ───
setTimeout(() => {
  (async () => {
    try {
      console.log('[Character scheduler] Starting initial cycle...');
      await runCycle();
    } catch (err) {
      console.error('[Character scheduler] Initial cycle error:', err);
    }
  })();

  setInterval(async () => {
    try {
      console.log('[Character scheduler] Starting cycle...');
      await runCycle();
    } catch (err) {
      console.error('[Character scheduler] Cycle error:', err);
    }
  }, CYCLE_INTERVAL);
}, INITIAL_DELAY);

console.log(
  `[Character scheduler] Started — first cycle in ${INITIAL_DELAY / 1000}s, then every ${CYCLE_INTERVAL / 3600000}h`
);

module.exports = { processCharacter, runCycle };
