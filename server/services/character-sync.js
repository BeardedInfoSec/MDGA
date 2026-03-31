const pool = require('../db');
const {
  fetchPvpStats,
  fetchCharacterProfile,
  fetchCharacterStats,
  fetchCharacterTalents,
  fetchMythicKeystoneProfile,
  fetchRaidProgression,
} = require('../blizzard');

async function resolveOrNull(promiseFactory, label, char) {
  try {
    return await promiseFactory();
  } catch (err) {
    console.warn(
      `[Character sync] ${label} failed for ${char.character_name}-${char.realm_slug}: ${err.message}`
    );
    return null;
  }
}

async function refreshCharacter(char, options = {}) {
  if (!char || !char.id || !char.realm_slug || !char.character_name) {
    throw new Error('refreshCharacter requires id, realm_slug, and character_name');
  }

  const prefetchedProfile = options.profile || null;
  let updated = false;

  const [profile, pvp, achStats, talents, mplus, raidProg] = await Promise.all([
    prefetchedProfile ||
      resolveOrNull(
        () => fetchCharacterProfile(char.realm_slug, char.character_name),
        'profile fetch',
        char
      ),
    resolveOrNull(() => fetchPvpStats(char.realm_slug, char.character_name), 'pvp fetch', char),
    resolveOrNull(
      () => fetchCharacterStats(char.realm_slug, char.character_name),
      'character stats fetch',
      char
    ),
    resolveOrNull(
      () => fetchCharacterTalents(char.realm_slug, char.character_name),
      'talents fetch',
      char
    ),
    resolveOrNull(
      () => fetchMythicKeystoneProfile(char.realm_slug, char.character_name),
      'mythic+ fetch',
      char
    ),
    resolveOrNull(
      () => fetchRaidProgression(char.realm_slug, char.character_name),
      'raid progression fetch',
      char
    ),
  ]);

  if (profile) {
    await pool.execute(
      `UPDATE user_characters SET
        level = ?, race = ?, class = COALESCE(?, class), spec = COALESCE(?, spec),
        item_level = ?, media_url = ?, guild_name = COALESCE(?, guild_name),
        faction = COALESCE(?, faction), last_login = ?
      WHERE id = ?`,
      [
        profile.level,
        profile.race,
        profile.class,
        profile.spec,
        profile.item_level,
        profile.media_url,
        profile.guild_name,
        profile.faction,
        profile.last_login,
        char.id,
      ]
    );
    updated = true;
  }

  if (talents) {
    await pool.execute(
      'UPDATE user_characters SET talents_json = ?, talents_updated_at = NOW() WHERE id = ?',
      [JSON.stringify(talents), char.id]
    );
    updated = true;
  }

  if (pvp || achStats || mplus || raidProg) {
    const p = pvp || {};
    const a = achStats || {};
    const m = mplus || {};
    const r = raidProg || {};
    await pool.execute(
      `INSERT INTO pvp_stats (character_id, arena_2v2, arena_3v3, solo_shuffle, rbg_rating, honorable_kills,
         killing_blows, arenas_played, arenas_won, arenas_lost, bgs_played, bgs_won,
         total_deaths, creatures_killed, dungeons_entered, raids_entered,
         quests_completed, achievement_points, mythic_plus_rating,
         item_level, highest_mplus_key, mythic_bosses_killed, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         arena_2v2 = VALUES(arena_2v2), arena_3v3 = VALUES(arena_3v3),
         solo_shuffle = VALUES(solo_shuffle), rbg_rating = VALUES(rbg_rating),
         honorable_kills = VALUES(honorable_kills),
         killing_blows = VALUES(killing_blows),
         arenas_played = VALUES(arenas_played), arenas_won = VALUES(arenas_won), arenas_lost = VALUES(arenas_lost),
         bgs_played = VALUES(bgs_played), bgs_won = VALUES(bgs_won),
         total_deaths = VALUES(total_deaths), creatures_killed = VALUES(creatures_killed),
         dungeons_entered = VALUES(dungeons_entered), raids_entered = VALUES(raids_entered),
         quests_completed = VALUES(quests_completed),
         achievement_points = VALUES(achievement_points),
         mythic_plus_rating = VALUES(mythic_plus_rating),
         item_level = VALUES(item_level),
         highest_mplus_key = VALUES(highest_mplus_key),
         mythic_bosses_killed = VALUES(mythic_bosses_killed),
         fetched_at = NOW()`,
      [
        char.id,
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
      ]
    );
    updated = true;
  }

  return {
    updated,
    profileSynced: Boolean(profile),
    talentsSynced: Boolean(talents),
    statsSynced: Boolean(pvp || achStats || mplus || raidProg),
  };
}

module.exports = {
  refreshCharacter,
};
