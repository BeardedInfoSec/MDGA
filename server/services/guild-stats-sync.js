const pool = require('../db');
const {
  fetchPvpStats,
  fetchCharacterProfile,
  fetchCharacterStats,
  fetchMythicKeystoneProfile,
  fetchRaidProgression,
} = require('../blizzard');

const MIN_LEVEL = 70;
const BATCH_SIZE = 5;
const BATCH_DELAY = 500; // ms between batches
const STALE_HOURS = 4;   // skip members synced within this window

async function resolveOrNull(promiseFactory, label, member) {
  try {
    return await promiseFactory();
  } catch (err) {
    console.warn(
      `[Guild stats sync] ${label} failed for ${member.character_name}-${member.realm_slug}: ${err.message}`
    );
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sync detailed stats for a single guild member
async function syncMemberStats(member) {
  const [profile, pvp, charStats, mplus, raidProg] = await Promise.all([
    resolveOrNull(
      () => fetchCharacterProfile(member.realm_slug, member.character_name),
      'profile', member
    ),
    resolveOrNull(
      () => fetchPvpStats(member.realm_slug, member.character_name),
      'pvp', member
    ),
    resolveOrNull(
      () => fetchCharacterStats(member.realm_slug, member.character_name),
      'char stats', member
    ),
    resolveOrNull(
      () => fetchMythicKeystoneProfile(member.realm_slug, member.character_name),
      'mythic+', member
    ),
    resolveOrNull(
      () => fetchRaidProgression(member.realm_slug, member.character_name),
      'raid prog', member
    ),
  ]);

  // If nothing came back at all, skip this member
  if (!profile && !pvp && !charStats && !mplus && !raidProg) return false;

  const p = pvp || {};
  const a = charStats || {};
  const m = mplus || {};
  const r = raidProg || {};
  const spec = profile?.spec || null;

  await pool.execute(
    `INSERT INTO guild_member_stats
      (guild_member_id, arena_2v2, arena_3v3, solo_shuffle, rbg_rating, honorable_kills,
       killing_blows, arenas_played, arenas_won, arenas_lost, bgs_played, bgs_won,
       total_deaths, creatures_killed, dungeons_entered, raids_entered,
       quests_completed, achievement_points, mythic_plus_rating,
       item_level, highest_mplus_key, mythic_bosses_killed, spec, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       arena_2v2 = VALUES(arena_2v2), arena_3v3 = VALUES(arena_3v3),
       solo_shuffle = VALUES(solo_shuffle), rbg_rating = VALUES(rbg_rating),
       honorable_kills = VALUES(honorable_kills),
       killing_blows = VALUES(killing_blows),
       arenas_played = VALUES(arenas_played), arenas_won = VALUES(arenas_won),
       arenas_lost = VALUES(arenas_lost),
       bgs_played = VALUES(bgs_played), bgs_won = VALUES(bgs_won),
       total_deaths = VALUES(total_deaths), creatures_killed = VALUES(creatures_killed),
       dungeons_entered = VALUES(dungeons_entered), raids_entered = VALUES(raids_entered),
       quests_completed = VALUES(quests_completed),
       achievement_points = VALUES(achievement_points),
       mythic_plus_rating = VALUES(mythic_plus_rating),
       item_level = VALUES(item_level),
       highest_mplus_key = VALUES(highest_mplus_key),
       mythic_bosses_killed = VALUES(mythic_bosses_killed),
       spec = VALUES(spec),
       fetched_at = NOW()`,
    [
      member.id,
      p.arena_2v2 || 0,
      p.arena_3v3 || 0,
      p.solo_shuffle || 0,
      p.rbg_rating || 0,
      p.honorable_kills || 0,
      a.killing_blows || 0,
      a.arenas_played || 0,
      a.arenas_won || 0,
      a.arenas_lost || 0,
      a.bgs_played || 0,
      a.bgs_won || 0,
      a.total_deaths || 0,
      a.creatures_killed || 0,
      a.dungeons_entered || 0,
      a.raids_entered || 0,
      a.quests_completed || 0,
      profile?.achievement_points || 0,
      m.mythic_plus_rating || 0,
      profile?.item_level || 0,
      m.highest_mplus_key || 0,
      r.mythic_bosses_killed || 0,
      spec,
    ]
  );

  // Update spec on guild_members too
  if (spec) {
    await pool.execute(
      'UPDATE guild_members SET spec = ? WHERE id = ?',
      [spec, member.id]
    );
  }

  return true;
}

// Sync stats for all eligible members in a guild
async function syncGuildMemberStats(guildId) {
  const [members] = await pool.execute(
    `SELECT gm.id, gm.character_name, gm.realm_slug
     FROM guild_members gm
     LEFT JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
     WHERE gm.guild_id = ?
       AND gm.level >= ?
       AND (gms.fetched_at IS NULL OR gms.fetched_at < DATE_SUB(NOW(), INTERVAL ? HOUR))`,
    [guildId, MIN_LEVEL, STALE_HOURS]
  );

  if (members.length === 0) {
    console.log(`[Guild stats sync] No eligible members to sync for guild ${guildId}`);
    return { synced: 0, total: 0 };
  }

  console.log(`[Guild stats sync] Syncing ${members.length} members for guild ${guildId}`);
  let synced = 0;

  // Process in batches
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (member) => {
        try {
          return await syncMemberStats(member);
        } catch (err) {
          console.error(`[Guild stats sync] Failed ${member.character_name}:`, err.message);
          return false;
        }
      })
    );

    synced += results.filter(Boolean).length;

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < members.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`[Guild stats sync] Complete: ${synced}/${members.length} members updated for guild ${guildId}`);
  return { synced, total: members.length };
}

// Sync stats for all tracked guilds
async function syncAllGuildStats() {
  const [guilds] = await pool.execute('SELECT id, name_slug FROM guilds');
  const results = [];

  for (const guild of guilds) {
    try {
      const result = await syncGuildMemberStats(guild.id);
      results.push({ guild: guild.name_slug, ...result });
    } catch (err) {
      console.error(`[Guild stats sync] Failed guild ${guild.name_slug}:`, err.message);
      results.push({ guild: guild.name_slug, synced: 0, total: 0, error: err.message });
    }
  }

  return results;
}

// ─── AUTO-SYNC: every 3 hours (offset 5 min from roster sync) ───
const STATS_SYNC_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours
const STATS_SYNC_INITIAL_DELAY = 5 * 60 * 1000;  // 5 min after boot

setTimeout(() => {
  (async () => {
    try {
      console.log('[Guild stats auto-sync] Starting initial cycle...');
      const results = await syncAllGuildStats();
      console.log('[Guild stats auto-sync] Initial cycle complete:', results);
    } catch (err) {
      console.error('[Guild stats auto-sync] Initial cycle error:', err);
    }
  })();

  setInterval(async () => {
    try {
      console.log('[Guild stats auto-sync] Starting cycle...');
      const results = await syncAllGuildStats();
      console.log('[Guild stats auto-sync] Cycle complete:', results);
    } catch (err) {
      console.error('[Guild stats auto-sync] Cycle error:', err);
    }
  }, STATS_SYNC_INTERVAL);
}, STATS_SYNC_INITIAL_DELAY);

module.exports = { syncMemberStats, syncGuildMemberStats, syncAllGuildStats };
