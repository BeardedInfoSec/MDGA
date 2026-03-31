const pool = require('../db');
const {
  fetchGuildProfile,
  fetchGuildRoster,
  fetchGuildAchievements,
  fetchGuildActivity,
} = require('../blizzard');
const { setMemberRoles, sendOfficerAlert } = require('../bot');

async function resolveOrNull(promiseFactory, label, guild) {
  try {
    return await promiseFactory();
  } catch (err) {
    console.warn(`[Guild sync] ${label} failed for ${guild.name_slug}: ${err.message}`);
    return null;
  }
}

async function syncGuild(guild) {
  if (!guild || !guild.id || !guild.realm_slug || !guild.name_slug) {
    throw new Error('syncGuild requires id, realm_slug, and name_slug');
  }

  const [profile, roster, achievements, activity] = await Promise.all([
    resolveOrNull(() => fetchGuildProfile(guild.realm_slug, guild.name_slug), 'profile', guild),
    resolveOrNull(() => fetchGuildRoster(guild.realm_slug, guild.name_slug), 'roster', guild),
    resolveOrNull(() => fetchGuildAchievements(guild.realm_slug, guild.name_slug), 'achievements', guild),
    resolveOrNull(() => fetchGuildActivity(guild.realm_slug, guild.name_slug), 'activity', guild),
  ]);

  let updated = false;

  // 1) Update guild profile
  if (profile) {
    await pool.execute(
      `UPDATE guilds SET
        name = ?, faction = ?, member_count = ?,
        achievement_points = ?, created_date = ?, last_synced_at = NOW()
      WHERE id = ?`,
      [profile.name, profile.faction, profile.member_count,
       profile.achievement_points, profile.created_timestamp, guild.id]
    );
    updated = true;
  }

  // 2) Upsert roster members (with rank change detection)
  // Guard: if Blizzard API returns a suspiciously small roster, skip to prevent accidental mass deletion
  if (roster && roster.length > 0 && roster.length < 10) {
    console.warn(`[Guild sync] ${guild.name_slug}: roster has only ${roster.length} members — skipping to prevent accidental deletion. Manual sync required.`);
  }
  if (roster && roster.length >= 10) {
    const rankChanges = [];

    for (const member of roster) {
      // Check for rank change before upsert
      const [existing] = await pool.execute(
        'SELECT id, guild_rank, linked_user_id FROM guild_members WHERE guild_id = ? AND character_name = ?',
        [guild.id, member.character_name]
      );

      const previousRank = existing.length > 0 ? existing[0].guild_rank : null;
      const newRank = member.rank;

      await pool.execute(
        `INSERT INTO guild_members
          (guild_id, character_name, realm_slug, realm_name, level, class, race, guild_rank, previous_guild_rank, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          realm_name = VALUES(realm_name), level = VALUES(level),
          class = VALUES(class), race = VALUES(race),
          previous_guild_rank = guild_rank, guild_rank = VALUES(guild_rank), last_synced_at = NOW()`,
        [guild.id, member.character_name, member.realm_slug, member.realm_name,
         member.level, member.class, member.race, newRank, previousRank]
      );

      // Track rank changes for Discord role sync
      if (previousRank !== null && previousRank !== newRank) {
        rankChanges.push({
          characterName: member.character_name,
          realmSlug: member.realm_slug,
          oldRank: previousRank,
          newRank,
          linkedUserId: existing[0]?.linked_user_id,
        });
      }
    }

    // Remove members no longer in the roster
    const placeholders = roster.map(() => '?').join(',');
    const rosterNames = roster.map(m => m.character_name);
    await pool.execute(
      `DELETE FROM guild_members WHERE guild_id = ? AND character_name NOT IN (${placeholders})`,
      [guild.id, ...rosterNames]
    );

    // Cross-reference guild members with site users
    await crossLinkMembers(guild.id);

    // Process rank changes: sync Discord roles via game_rank_mappings
    if (rankChanges.length > 0) {
      await processRankChanges(guild.id, rankChanges);
    }

    updated = true;
  }

  // 3) Upsert achievements
  if (achievements && achievements.length > 0) {
    for (const ach of achievements) {
      await pool.execute(
        `INSERT INTO guild_achievements
          (guild_id, achievement_id, achievement_name, description, completed_at, criteria_amount)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          achievement_name = VALUES(achievement_name),
          description = VALUES(description),
          criteria_amount = VALUES(criteria_amount)`,
        [guild.id, ach.achievement_id, ach.achievement_name,
         ach.description, ach.completed_at, ach.criteria_amount]
      );
    }
    updated = true;
  }

  // 4) Insert new activity (dedup by type + description + timestamp)
  if (activity && activity.length > 0) {
    for (const act of activity) {
      if (!act.description) continue;
      const [existing] = await pool.execute(
        `SELECT id FROM guild_activity
         WHERE guild_id = ? AND activity_type = ? AND description = ? AND occurred_at = ?
         LIMIT 1`,
        [guild.id, act.type, act.description, act.occurred_at]
      );
      if (existing.length === 0) {
        await pool.execute(
          `INSERT INTO guild_activity
            (guild_id, activity_type, character_name, description, activity_data, occurred_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [guild.id, act.type, act.character_name, act.description,
           JSON.stringify(act.raw), act.occurred_at]
        );
      }
    }

    // Keep only last 500 activity entries per guild
    await pool.execute(
      `DELETE FROM guild_activity WHERE guild_id = ? AND id NOT IN (
        SELECT id FROM (SELECT id FROM guild_activity WHERE guild_id = ? ORDER BY occurred_at DESC LIMIT 500) t
      )`, [guild.id, guild.id]
    );
    updated = true;
  }

  return {
    updated,
    profileSynced: !!profile,
    rosterCount: roster ? roster.length : 0,
    achievementsSynced: !!achievements,
    activitySynced: !!activity,
  };
}

// Cross-link guild_members with users/user_characters by character_name + realm_slug
async function crossLinkMembers(guildId) {
  // Clear existing links first (in case characters were removed/renamed)
  await pool.execute(
    'UPDATE guild_members SET linked_user_id = NULL, linked_character_id = NULL WHERE guild_id = ?',
    [guildId]
  );

  // Match on character_name (case-insensitive) + realm_slug
  await pool.execute(`
    UPDATE guild_members gm
    JOIN user_characters uc
      ON gm.character_name = uc.character_name
      AND gm.realm_slug = uc.realm_slug
    JOIN users u ON uc.user_id = u.id AND u.status = 'active'
    SET gm.linked_user_id = u.id, gm.linked_character_id = uc.id
    WHERE gm.guild_id = ?
  `, [guildId]);
}

// Sync all tracked guilds
async function syncAllGuilds() {
  const [guilds] = await pool.execute('SELECT * FROM guilds');
  const results = [];
  for (const guild of guilds) {
    try {
      const result = await syncGuild(guild);
      console.log(`[Guild sync] ${guild.name_slug}: roster=${result.rosterCount}, achievements=${result.achievementsSynced}, activity=${result.activitySynced}`);
      results.push({ guild: guild.name_slug, ...result });
    } catch (err) {
      console.error(`[Guild sync] Failed ${guild.name_slug}:`, err.message);
      results.push({ guild: guild.name_slug, updated: false, error: err.message });
    }
  }
  return results;
}

/**
 * Process in-game rank changes detected during roster sync.
 * For each rank change, look up game_rank_mappings to determine which Discord role
 * should be assigned, then use the bot to update Discord roles.
 * Priority rule: Main character rank wins when a user has multiple characters.
 */
async function processRankChanges(guildId, changes) {
  // Load game rank mappings for this guild
  const [mappings] = await pool.execute(
    'SELECT game_rank, discord_role_id, site_rank FROM game_rank_mappings WHERE guild_id = ?',
    [guildId]
  );
  if (mappings.length === 0) return; // No mappings configured yet

  const rankToMapping = new Map();
  for (const m of mappings) {
    rankToMapping.set(m.game_rank, m);
  }

  // All Discord role IDs managed by game_rank_mappings (for removal)
  const allMappedDiscordRoles = mappings.filter(m => m.discord_role_id).map(m => m.discord_role_id);

  for (const change of changes) {
    try {
      // Find the linked user (may have been just cross-linked)
      let userId = change.linkedUserId;
      if (!userId) {
        const [link] = await pool.execute(
          `SELECT gm.linked_user_id FROM guild_members gm
           WHERE gm.guild_id = ? AND gm.character_name = ? AND gm.linked_user_id IS NOT NULL`,
          [guildId, change.characterName]
        );
        if (link.length > 0) userId = link[0].linked_user_id;
      }
      if (!userId) continue; // No site account linked

      // Main character rank wins: only sync if this is the user's main character
      const [mainChar] = await pool.execute(
        'SELECT character_name, realm_slug FROM user_characters WHERE user_id = ? AND is_main = TRUE',
        [userId]
      );
      if (mainChar.length > 0) {
        const isMain = mainChar[0].character_name.toLowerCase() === change.characterName.toLowerCase()
          && mainChar[0].realm_slug.toLowerCase() === change.realmSlug.toLowerCase();
        if (!isMain) continue; // Skip rank changes on alt characters
      }

      // Get user's Discord ID
      const [userRow] = await pool.execute(
        'SELECT discord_id, username FROM users WHERE id = ? AND discord_id IS NOT NULL AND status = ?',
        [userId, 'active']
      );
      if (userRow.length === 0) continue;

      const { discord_id: discordId, username } = userRow[0];

      // Determine new Discord role from mapping
      const newMapping = rankToMapping.get(change.newRank);
      const oldMapping = rankToMapping.get(change.oldRank);

      const addRoles = [];
      const removeRoles = [];

      if (newMapping?.discord_role_id) {
        addRoles.push(newMapping.discord_role_id);
      }
      // Remove all other mapped game-rank Discord roles
      for (const roleId of allMappedDiscordRoles) {
        if (!addRoles.includes(roleId)) {
          removeRoles.push(roleId);
        }
      }

      if (addRoles.length > 0 || removeRoles.length > 0) {
        await setMemberRoles(discordId, addRoles, removeRoles);
        console.log(`[Game rank sync] ${change.characterName}: rank ${change.oldRank} → ${change.newRank}, Discord roles updated for ${username}`);
      }

      // Update site rank if mapping specifies one
      if (newMapping?.site_rank) {
        await pool.execute('UPDATE users SET `rank` = ? WHERE id = ?', [newMapping.site_rank, userId]);
        console.log(`[Game rank sync] ${username}: site rank updated to ${newMapping.site_rank}`);
      }

      sendOfficerAlert(
        'In-Game Rank Change Detected',
        `**${change.characterName}** rank changed: **${change.oldRank}** → **${change.newRank}**\n` +
        `Site user: **${username}**\n` +
        `Discord roles ${addRoles.length > 0 ? 'updated' : 'unchanged'}`,
        0x5865F2
      );
    } catch (err) {
      console.error(`[Game rank sync] Error processing ${change.characterName}:`, err.message);
    }
  }
}

module.exports = { syncGuild, syncAllGuilds, crossLinkMembers, processRankChanges };
