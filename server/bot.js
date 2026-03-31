// ================================================
// DISCORD BOT — Guild verification, approval buttons, kick detection
// Runs inside the Express process via startBot()
// ================================================
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const pool = require('./db');
const { syncUserRolesFromDiscord } = require('./services/discord-role-sync');
const { sendApprovalEmail } = require('./services/email');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OFFICER_CHANNEL_ID = process.env.DISCORD_OFFICER_CHANNEL_ID;

let client = null;

// ================================================
// START BOT
// ================================================
function startBot() {
  if (!BOT_TOKEN) {
    console.warn('DISCORD_BOT_TOKEN not set — bot disabled');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once('clientReady', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  });

  // ================================================
  // BUTTON INTERACTIONS — Approve / Reject
  // ================================================
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, userIdStr] = interaction.customId.split(':');
    if (!['approve_user', 'reject_user', 'approve_unban', 'deny_unban'].includes(action)) return;

    const userId = parseInt(userIdStr);
    if (!userId) return;

    try {
      if (action === 'approve_user') {
        await pool.execute(
          'UPDATE users SET status = ? WHERE id = ? AND status = ?',
          ['active', userId, 'pending_approval']
        );

        const [rows] = await pool.execute('SELECT username, display_name, discord_id, email FROM users WHERE id = ?', [userId]);
        const name = rows[0]?.display_name || rows[0]?.username || 'Unknown';
        const discordId = rows[0]?.discord_id;
        const userEmail = rows[0]?.email;

        // Send approval email with Discord invite
        const emailSent = await sendApprovalEmail(userEmail, name);

        // DM the user a Discord invite link
        let dmStatus = emailSent ? ' | email sent' : '';
        if (discordId) {
          try {
            const guild = client.guilds.cache.get(GUILD_ID);
            // Check if user is already in the guild
            const existingMember = guild ? await guild.members.fetch(discordId).catch(() => null) : null;

            if (existingMember) {
              dmStatus = ' (already in server)';
            } else {
              // Create a one-time invite to the default channel
              let inviteUrl = null;
              if (guild) {
                const channel = guild.systemChannel
                  || guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
                if (channel) {
                  const invite = await channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
                  inviteUrl = invite.url;
                }
              }

              // DM the approved user
              const dmUser = await client.users.fetch(discordId).catch(() => null);
              if (dmUser && inviteUrl) {
                await dmUser.send(
                  `Your **MDGA** account has been approved! Welcome aboard.\n\n` +
                  `Join our Discord server: ${inviteUrl}\n\n` +
                  `Then log in at https://mdga.dev to get started.`
                ).catch(() => null);
                dmStatus = ' (invite DM sent)';
              } else if (dmUser) {
                await dmUser.send(
                  `Your **MDGA** account has been approved! Welcome aboard.\n\n` +
                  `Log in at https://mdga.dev to get started.`
                ).catch(() => null);
                dmStatus = ' (DM sent, no invite — check bot permissions)';
              } else {
                dmStatus = ' (could not DM user)';
              }
            }
          } catch (dmErr) {
            console.warn('Approve DM error:', dmErr.message);
            dmStatus = ' (DM failed)';
          }
        }

        // Update the message to show approval
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x34D399)
          .setFooter({ text: `Approved by ${interaction.user.tag}${dmStatus}` });

        await interaction.update({
          embeds: [embed],
          components: [], // Remove buttons
        });

        console.log(`User ${name} (ID: ${userId}) approved by ${interaction.user.tag}${dmStatus}`);

      } else if (action === 'reject_user') {
        await pool.execute(
          'UPDATE users SET status = ? WHERE id = ? AND status = ?',
          ['rejected', userId, 'pending_approval']
        );

        const [rows] = await pool.execute('SELECT username, display_name FROM users WHERE id = ?', [userId]);
        const name = rows[0]?.display_name || rows[0]?.username || 'Unknown';

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0xEF4444)
          .setFooter({ text: `Rejected by ${interaction.user.tag}` });

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        console.log(`User ${name} (ID: ${userId}) rejected by ${interaction.user.tag}`);

      } else if (action === 'approve_unban') {
        // Second officer approves the unban — reactivate user
        const [rows] = await pool.execute('SELECT username, display_name, status FROM users WHERE id = ?', [userId]);
        const name = rows[0]?.display_name || rows[0]?.username || 'Unknown';

        if (rows[0]?.status !== 'banned') {
          await interaction.reply({ content: `${name} is no longer banned.`, ephemeral: true });
          return;
        }

        await pool.execute(
          'UPDATE users SET status = ?, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = ?',
          ['suspended', userId]
        );

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x34D399)
          .setFooter({ text: `Unban approved by ${interaction.user.tag}` });

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        console.log(`User ${name} (ID: ${userId}) unbanned by ${interaction.user.tag}`);

      } else if (action === 'deny_unban') {
        const [rows] = await pool.execute('SELECT username, display_name FROM users WHERE id = ?', [userId]);
        const name = rows[0]?.display_name || rows[0]?.username || 'Unknown';

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0xEF4444)
          .setFooter({ text: `Unban denied by ${interaction.user.tag} — ban remains` });

        await interaction.update({
          embeds: [embed],
          components: [],
        });

        console.log(`Unban request for ${name} (ID: ${userId}) denied by ${interaction.user.tag}`);
      }
    } catch (err) {
      console.error('Button interaction error:', err);
      try {
        await interaction.reply({ content: 'Error processing this action.', ephemeral: true });
      } catch (_) {}
    }
  });

  // ================================================
  // KICK / LEAVE DETECTION
  // ================================================
  client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== GUILD_ID) return;

    try {
      const [rows] = await pool.execute(
        'SELECT id, username, status FROM users WHERE discord_id = ?',
        [member.id]
      );

      if (rows.length > 0 && rows[0].status === 'active') {
        await pool.execute(
          'UPDATE users SET status = ? WHERE id = ?',
          ['suspended', rows[0].id]
        );
        console.log(`User ${rows[0].username} (Discord: ${member.user.tag}) left/kicked — account suspended`);

        sendOfficerAlert(
          'Member Left / Kicked',
          `**${member.user.tag}** left or was kicked from the Discord server.\n\n` +
          `**Site username:** ${rows[0].username}\n` +
          `**Action taken:** Account suspended`,
          0xEF4444
        );
      }
    } catch (err) {
      console.error('guildMemberRemove handler error:', err);
    }
  });

  // ================================================
  // ROLE CHANGE DETECTION — Real-time Discord role → website sync
  // ================================================
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.guild.id !== GUILD_ID) return;

    // Only react to role changes — compare role caches
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());
    if (oldRoles.size === newRoles.size && [...oldRoles].every(r => newRoles.has(r))) return;

    try {
      const [rows] = await pool.execute(
        'SELECT id, username, `rank` FROM users WHERE discord_id = ? AND status = ?',
        [newMember.id, 'active']
      );
      if (rows.length === 0) return;

      const user = rows[0];
      const result = await syncUserRolesFromDiscord(user.id, newMember);

      if (result.changed) {
        console.log(`[Role sync] ${user.username}: rank ${result.previousRank} → ${result.rank} (roles +${result.rolesAdded} -${result.rolesRemoved})`);

        // Alert officers on significant rank changes
        if (result.previousRank !== result.rank) {
          sendOfficerAlert(
            'Role Sync — Rank Changed',
            `**${newMember.user.tag}** (${user.username})\n` +
            `Rank: **${result.previousRank}** → **${result.rank}**\n` +
            `Triggered by Discord role change`,
            0xF5C518
          );
        }
      }
    } catch (err) {
      console.error('guildMemberUpdate handler error:', err);
    }
  });

  client.login(BOT_TOKEN).catch(err => {
    console.error('Discord bot login failed:', err.message);
  });
}

// ================================================
// CHECK GUILD MEMBERSHIP
// Uses the bot client's REST to check if a Discord user is in the guild
// ================================================
async function checkGuildMember(discordId) {
  if (!client || !client.isReady()) return null;

  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return null;

    const member = await guild.members.fetch(discordId).catch(() => null);
    return member;
  } catch (err) {
    console.error('checkGuildMember error:', err);
    return null;
  }
}

// ================================================
// SEND APPROVAL REQUEST to officer channel
// ================================================
async function sendApprovalRequest(user) {
  if (!client || !client.isReady() || !OFFICER_CHANNEL_ID) {
    console.warn('Cannot send approval request — bot not ready or no officer channel configured');
    return;
  }

  try {
    const channel = await client.channels.fetch(OFFICER_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('New Account Approval Request')
      .setColor(0xB91C1C)
      .addFields(
        { name: 'Username', value: user.username || 'N/A', inline: true },
        { name: 'Display Name', value: user.display_name || user.displayName || 'N/A', inline: true },
        { name: 'Email', value: user.email || 'N/A', inline: true },
        { name: 'Discord', value: user.discord_username || user.discordUsername || 'N/A', inline: true },
        { name: 'Realm', value: user.realm || 'Not set', inline: true },
        { name: 'Character', value: user.character_name || user.characterName || 'Not set', inline: true },
      )
      .setFooter({ text: `User ID: ${user.id} • Not in MDGA Discord` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_user:${user.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_user:${user.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('sendApprovalRequest error:', err);
  }
}

// Send a simple alert embed to the officer channel
async function sendOfficerAlert(title, description, color = 0xB91C1C) {
  if (!client || !client.isReady() || !OFFICER_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(OFFICER_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('sendOfficerAlert error:', err);
  }
}

// ================================================
// SEND UNBAN REQUEST to officer channel (two-step approval)
// ================================================
async function sendUnbanRequest(bannedUser, requestedBy, reason) {
  if (!client || !client.isReady() || !OFFICER_CHANNEL_ID) {
    console.warn('Cannot send unban request — bot not ready or no officer channel configured');
    return;
  }

  try {
    const channel = await client.channels.fetch(OFFICER_CHANNEL_ID);
    if (!channel) return;

    const name = bannedUser.display_name || bannedUser.username;
    const bannedDate = bannedUser.banned_at
      ? new Date(bannedUser.banned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setTitle('Unban Request')
      .setColor(0xF59E0B) // amber/warning
      .addFields(
        { name: 'Banned User', value: name, inline: true },
        { name: 'Discord', value: bannedUser.discord_username || 'N/A', inline: true },
        { name: 'Banned On', value: bannedDate, inline: true },
        { name: 'Original Ban Reason', value: bannedUser.ban_reason || 'No reason provided', inline: false },
        { name: 'Requested By', value: requestedBy, inline: true },
        { name: 'Unban Reason', value: reason || 'No reason provided', inline: false },
      )
      .setFooter({ text: `User ID: ${bannedUser.id} • Requires officer approval` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_unban:${bannedUser.id}`)
        .setLabel('Approve Unban')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_unban:${bannedUser.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );

    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('sendUnbanRequest error:', err);
  }
}

// ================================================
// GET ALL GUILD ROLES from bot cache
// ================================================
function getGuildRoles() {
  if (!client || !client.isReady()) return [];
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return [];
  return guild.roles.cache
    .filter(r => r.id !== guild.id) // exclude @everyone
    .sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position, managed: r.managed }));
}

// ================================================
// SET DISCORD NICKNAME to main character name
// ================================================
async function setMemberNickname(discordId, nickname) {
  if (!client || !client.isReady()) return { success: false, reason: 'bot_offline' };
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return { success: false, reason: 'guild_not_found' };
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return { success: false, reason: 'member_not_found' };

    // Can't change server owner's nickname
    if (member.id === guild.ownerId) {
      console.warn(`[Nickname sync] Skipping server owner ${discordId}`);
      return { success: false, reason: 'server_owner' };
    }

    // Discord nickname limit is 32 chars; strip and truncate
    const clean = (nickname || '').replace(/[^\w\s-]/g, '').trim().substring(0, 32);
    if (!clean) return { success: false, reason: 'empty_nickname' };

    // Skip if nickname is already set
    if (member.nickname === clean) {
      return { success: true, reason: 'already_set' };
    }

    try {
      await member.setNickname(clean);
      console.log(`[Nickname sync] Set ${discordId} nickname to "${clean}"`);
      return { success: true, reason: 'updated' };
    } catch (err) {
      // Permission errors: bot role too low, or missing Manage Nicknames permission
      console.warn(`[Nickname sync] Could not set nickname for ${discordId}: ${err.message}`);
      return { success: false, reason: 'permission_error', detail: err.message };
    }
  } catch (err) {
    console.warn(`[Nickname sync] Error for ${discordId}: ${err.message}`);
    return { success: false, reason: 'error', detail: err.message };
  }
}

// ================================================
// ASSIGN DISCORD ROLE to a member (for game rank → Discord sync)
// ================================================
async function setMemberRoles(discordId, addRoleIds, removeRoleIds) {
  if (!client || !client.isReady()) return false;
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return false;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return false;

    for (const roleId of (addRoleIds || [])) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch((err) => {
          console.warn(`[Role assign] Could not add role ${roleId} to ${discordId}: ${err.message}`);
        });
      }
    }
    for (const roleId of (removeRoleIds || [])) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch((err) => {
          console.warn(`[Role assign] Could not remove role ${roleId} from ${discordId}: ${err.message}`);
        });
      }
    }
    return true;
  } catch (err) {
    console.warn(`[Role assign] Error for ${discordId}: ${err.message}`);
    return false;
  }
}

module.exports = { startBot, checkGuildMember, sendApprovalRequest, sendOfficerAlert, sendUnbanRequest, getGuildRoles, setMemberNickname, setMemberRoles };
