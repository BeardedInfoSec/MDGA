const pool = require('../db');
const { fetchCharacterProfile, scrapeArmoryProfile } = require('../blizzard');
const { refreshCharacter } = require('./character-sync');
const guildRegistry = require('./guild-registry');

const CYCLE_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
const INITIAL_DELAY = 3 * 60 * 1000;        // 3 min after boot

// A character is only removed after this many CONSECUTIVE cycles where we
// positively failed to confirm it (~6h at a 2h cycle). Anything transient
// (API throw) doesn't count at all. This exists because a single bad response
// used to permanently delete real members' characters.
const MAX_SYNC_FAILURES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resetFailures(char) {
  if (char.sync_failures > 0) {
    await pool.execute('UPDATE user_characters SET sync_failures = 0 WHERE id = ?', [char.id]);
  }
}

// Record a failed confirmation. Deletes only once the strike limit is hit.
async function strikeCharacter(char, reason) {
  const strikes = (char.sync_failures || 0) + 1;

  if (strikes < MAX_SYNC_FAILURES) {
    await pool.execute('UPDATE user_characters SET sync_failures = ? WHERE id = ?', [strikes, char.id]);
    console.warn(
      `[Character scheduler] ${char.character_name}-${char.realm_slug} (user ${char.user_id}) ` +
      `failed confirmation ${strikes}/${MAX_SYNC_FAILURES} — ${reason} (keeping for now)`
    );
    return { action: 'strike', name: char.character_name, strikes, reason };
  }

  // Delete pvp_stats first (FK), then the character
  await pool.execute('DELETE FROM pvp_stats WHERE character_id = ?', [char.id]);
  await pool.execute('DELETE FROM user_characters WHERE id = ?', [char.id]);
  console.log(
    `[Character scheduler] Removed ${char.character_name}-${char.realm_slug} (user ${char.user_id}) ` +
    `after ${strikes} consecutive failures — ${reason}`
  );
  return { action: 'removed', name: char.character_name, reason };
}

async function processCharacter(char) {
  let profile;
  try {
    profile = await fetchCharacterProfile(char.realm_slug, char.character_name);
  } catch (err) {
    // Transient upstream failure (429/5xx/network/timeout). NEVER counts as a
    // strike and never deletes — we simply don't know anything this cycle.
    console.warn(
      `[Character scheduler] Profile fetch failed for ${char.character_name}-${char.realm_slug}: ${err.message}`
    );
    return { action: 'error', name: char.character_name };
  }

  // API 404 doesn't prove the character is gone: players with the "Community
  // Sites and Apps" privacy opt-out 404 on the API while the web armory still
  // renders them. Fall back to the scraper before counting this against them
  // (same fallback the application form already uses).
  if (!profile) {
    try {
      const scraped = await scrapeArmoryProfile(char.realm_slug, char.character_name);
      if (scraped && scraped.profile) {
        profile = scraped.profile;
        console.log(
          `[Character scheduler] ${char.character_name}-${char.realm_slug} not in API (404) but found via armory — keeping`
        );
      }
    } catch (err) {
      // Scraper is best-effort; a failure here is also transient, so bail out
      // rather than risk striking a character we couldn't check.
      console.warn(`[Character scheduler] Armory fallback failed for ${char.character_name}: ${err.message}`);
      return { action: 'error', name: char.character_name };
    }
  }

  // Federation membership check. Use ensureGuildRegistered so the
  // (guild_name, character's realm) tuple is auto-registered when the
  // guild's NAME matches a federation guild we know about but we don't
  // yet have a row on that specific realm. Without this, a member like
  // Alanazalzin (MDGA on moon-guard, while we'd only registered MDGA on
  // illidan/tichondrius/etc.) gets deleted every cycle and has to keep
  // re-adding their character. The from-roster ADD path already uses
  // name-only matching — this aligns the scheduler with that semantic.
  const matchedGuild = profile
    ? await guildRegistry.ensureGuildRegistered({
        guildName: profile.guild_name,
        realmSlug: profile.realm_slug || char.realm_slug,
      })
    : null;
  if (!profile || !matchedGuild) {
    const reason = profile
      ? `guild is "${profile.guild_name || 'none'}" on "${profile.realm_slug || char.realm_slug}" — not in federation`
      : 'profile not found';
    // Strike rather than delete outright — a single unconfirmed cycle is not
    // proof. Removal happens only after MAX_SYNC_FAILURES in a row.
    return await strikeCharacter(char, reason);
  }

  // Guild matches — full refresh. Confirmed alive, so clear any strikes.
  try {
    const sync = await refreshCharacter(char, { profile });
    await resetFailures(char);
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
    'SELECT id, user_id, character_name, realm_slug, sync_failures FROM user_characters ORDER BY updated_at ASC'
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
  let struck = 0;
  let errors = 0;

  for (let i = 0; i < characters.length; i++) {
    const result = await processCharacter(characters[i]);

    if (result.action === 'refreshed') refreshed++;
    else if (result.action === 'removed') removed++;
    else if (result.action === 'strike') struck++;
    else errors++;

    // Wait between characters (skip delay after the last one)
    if (i < characters.length - 1) {
      await sleep(delayBetween);
    }
  }

  console.log(
    `[Character scheduler] Cycle complete: ${refreshed} refreshed, ${struck} unconfirmed (strike), ` +
    `${removed} removed, ${errors} errors`
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
