// ================================================
// DISCORD ROLE SYNC — Shared logic for syncing Discord roles to website rank/permissions
// Used by: OAuth callback, guildMemberUpdate event, guild roster rank change detection
// ================================================
const pool = require('../db');

const RANK_PRIORITY = ['recruit', 'member', 'veteran', 'officer', 'guildmaster'];

/**
 * Sync a user's website rank and RBAC roles based on their Discord member roles.
 * @param {number} userId - Site user ID
 * @param {import('discord.js').GuildMember} discordMember - Discord.js GuildMember object
 * @returns {{ rank: string, rolesAdded: number, rolesRemoved: number, changed: boolean }}
 */
async function syncUserRolesFromDiscord(userId, discordMember) {
  // Load current user data
  const [userRows] = await pool.execute(
    'SELECT id, `rank`, display_rank, status, rank_locked FROM users WHERE id = ?',
    [userId]
  );
  if (userRows.length === 0) return { rank: null, rolesAdded: 0, rolesRemoved: 0, changed: false };
  const user = userRows[0];

  // Only sync active users
  if (user.status !== 'active') return { rank: user.rank, rolesAdded: 0, rolesRemoved: 0, changed: false };

  // Honor the manual-override flag: if an admin has locked this user's rank,
  // skip the rank-recompute path entirely. RBAC role syncing below still
  // runs so Discord role-driven RBAC stays current. Ban/leave still triggers
  // suspension via bot.js's guildMemberRemove handler regardless of the lock.
  const rankLocked = !!user.rank_locked;

  // Load all discord_role_mappings
  const [roleMappings] = await pool.execute(
    'SELECT discord_role_id, discord_role_name, site_rank, site_role_id FROM discord_role_mappings'
  );

  let newRank = 'member';
  let highestPriority = RANK_PRIORITY.indexOf('member');
  let rankMappingMatched = false;
  // Track the discord_role_name of the highest-priority match — used as the
  // display_rank so the badge shows the authentic guild rank label
  // (Honorbound, Champion, etc.) instead of the generic 5-tier value.
  let newDisplayRank = null;
  const autoRoleIds = new Set();

  for (const mapping of roleMappings) {
    if (discordMember.roles.cache.has(mapping.discord_role_id)) {
      if (mapping.site_rank) {
        rankMappingMatched = true;
        const priority = RANK_PRIORITY.indexOf(mapping.site_rank);
        if (priority > highestPriority) {
          highestPriority = priority;
          newRank = mapping.site_rank;
          newDisplayRank = mapping.discord_role_name || null;
        }
      }
      if (mapping.site_role_id) {
        autoRoleIds.add(mapping.site_role_id);
      }
    }
  }

  // If no role mapping matched, keep existing rank
  if (!rankMappingMatched) {
    newRank = user.rank || 'member';
    newDisplayRank = user.display_rank || null;
  }

  // Also check roles table for direct discord_role_id links
  const [directRoles] = await pool.execute(
    'SELECT id, discord_role_id FROM roles WHERE discord_role_id IS NOT NULL'
  );
  for (const role of directRoles) {
    if (discordMember.roles.cache.has(role.discord_role_id)) {
      autoRoleIds.add(role.id);
    }
  }

  // Update rank if changed (unless this user's rank is locked).
  const rankChanged = newRank !== user.rank;
  const displayRankChanged = newDisplayRank !== user.display_rank;
  if ((rankChanged || displayRankChanged) && !rankLocked) {
    await pool.execute(
      'UPDATE users SET `rank` = ?, display_rank = ? WHERE id = ?',
      [newRank, newDisplayRank, userId]
    );
  }
  if (rankChanged && rankLocked) {
    console.log(`[discord-role-sync] Skipping rank change for user ${userId}: locked (would have been ${user.rank} → ${newRank})`);
  }

  // Sync RBAC roles
  const [existingRoles] = await pool.execute('SELECT role_id FROM user_roles WHERE user_id = ?', [userId]);
  const currentIds = new Set(existingRoles.map(r => r.role_id));

  // Collect all Discord-syncable role IDs
  const discordSyncableIds = new Set();
  for (const mapping of roleMappings) {
    if (mapping.site_role_id) discordSyncableIds.add(mapping.site_role_id);
  }
  for (const role of directRoles) {
    discordSyncableIds.add(role.id);
  }

  let rolesAdded = 0;
  let rolesRemoved = 0;

  // Add newly matched roles
  for (const roleId of autoRoleIds) {
    if (!currentIds.has(roleId)) {
      await pool.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
      rolesAdded++;
    }
  }

  // Remove roles that are Discord-syncable but no longer matched
  for (const roleId of currentIds) {
    if (discordSyncableIds.has(roleId) && !autoRoleIds.has(roleId)) {
      await pool.execute('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [userId, roleId]);
      rolesRemoved++;
    }
  }

  // Assign default roles if user has no roles at all after sync
  const [postSyncRoles] = await pool.execute('SELECT role_id FROM user_roles WHERE user_id = ?', [userId]);
  if (postSyncRoles.length === 0) {
    const [defaultRoles] = await pool.execute('SELECT id FROM roles WHERE is_default = TRUE');
    for (const dr of defaultRoles) {
      await pool.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, dr.id]);
    }
  }

  return {
    rank: rankLocked ? user.rank : newRank,
    displayRank: rankLocked ? user.display_rank : newDisplayRank,
    previousRank: user.rank,
    rolesAdded,
    rolesRemoved,
    changed: (rankChanged && !rankLocked) || displayRankChanged || rolesAdded > 0 || rolesRemoved > 0,
  };
}

module.exports = { syncUserRolesFromDiscord, RANK_PRIORITY };
