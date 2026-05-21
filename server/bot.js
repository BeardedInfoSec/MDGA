// ================================================
// DISCORD BOT — Guild verification, approval buttons, kick detection
// Runs inside the Express process via startBot()
// ================================================
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { syncUserRolesFromDiscord } = require('./services/discord-role-sync');
const { sendApprovalEmail } = require('./services/email');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OFFICER_CHANNEL_ID = process.env.DISCORD_OFFICER_CHANNEL_ID;
// #guild-invite-request channel — referenced in approval DMs so the
// applicant knows exactly where to go for their in-game invite.
// Falls back to a known channel id if the env var isn't set.
const GUILD_INVITE_REQUEST_CHANNEL_ID =
  process.env.DISCORD_GUILD_INVITE_REQUEST_CHANNEL_ID || '1376339634833068194';

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
    // Start the Discord member reconciliation sync now that the bot is online.
    try {
      require('./services/discord-member-sync').start();
    } catch (err) {
      console.error('[Discord member sync] Failed to start:', err.message);
    }
  });

  // ================================================
  // BUTTON INTERACTIONS — Approve / Reject
  // ================================================
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, idStr] = interaction.customId.split(':');
    if (!['approve_user', 'reject_user', 'approve_unban', 'deny_unban', 'approve_app', 'deny_app'].includes(action)) return;

    const userId = parseInt(idStr);
    if (!userId) return;

    try {
      if (action === 'approve_app' || action === 'deny_app') {
        const appId = userId;  // shared local var name; idStr is the app id here
        const newStatus = action === 'approve_app' ? 'approved' : 'denied';

        // Officer permission check — the interactor must be a site user
        // with admin.manage_applications (or be an officer in Discord).
        // Cheap path: trust the officer channel gate (only officers can
        // see/click these buttons because the channel is restricted),
        // mirror what we do for approve_user / approve_unban.

        const [rows] = await pool.execute(
          'SELECT id, status, character_name, discord_tag, user_id FROM applications WHERE id = ?',
          [appId]
        );
        const app = rows[0];
        if (!app) {
          await interaction.reply({ content: `Application #${appId} not found.`, ephemeral: true });
          return;
        }
        if (app.status !== 'pending') {
          await interaction.reply({ content: `Application #${appId} is already ${app.status}.`, ephemeral: true });
          return;
        }

        // Look up the reviewing officer's site user_id by their Discord id
        // so reviewed_by gets a meaningful FK. Falls back to NULL.
        let reviewerUserId = null;
        try {
          const [reviewerRows] = await pool.execute(
            'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
            [interaction.user.id]
          );
          reviewerUserId = reviewerRows[0]?.id || null;
        } catch { /* non-fatal */ }

        await pool.execute(
          'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
          [newStatus, reviewerUserId, appId]
        );

        let dmStatus = '';
        if (newStatus === 'approved') {
          // Pull discord_id from the linked site user if present
          let applicantDiscordId = null;
          if (app.user_id) {
            const [u] = await pool.execute('SELECT discord_id, email, display_name, username FROM users WHERE id = ?', [app.user_id]);
            applicantDiscordId = u[0]?.discord_id || null;
            // Activate the linked account + email them if we have one
            if (u[0]) {
              await pool.execute('UPDATE users SET status = ? WHERE id = ? AND status != ?', ['active', app.user_id, 'active']);
              if (u[0].email) {
                await sendApprovalEmail(u[0].email, u[0].display_name || u[0].username).catch(() => null);
              }
            }
          }
          const result = await sendApplicationApprovedDM({
            discordId: applicantDiscordId,
            discordTag: app.discord_tag,
          });
          dmStatus = ` (DM: ${result.status})`;
        }

        // Update the embed: tint by outcome, drop buttons, footer the reviewer
        const baseEmbed = interaction.message.embeds[0];
        const embed = baseEmbed
          ? EmbedBuilder.from(baseEmbed)
              .setColor(newStatus === 'approved' ? 0x34D399 : 0xEF4444)
              .setFooter({ text: `${newStatus === 'approved' ? 'Approved' : 'Denied'} by ${interaction.user.tag}${dmStatus}` })
          : new EmbedBuilder()
              .setTitle(`Application ${newStatus}`)
              .setColor(newStatus === 'approved' ? 0x34D399 : 0xEF4444);

        await interaction.update({ embeds: [embed], components: [] });
        console.log(`Application #${appId} (${app.character_name}) ${newStatus} by ${interaction.user.tag}${dmStatus}`);
        return;
      }

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

// Send a new-guild-application alert to the officer channel. Used by
// POST /api/applications instead of the old DISCORD_WEBHOOK_URL path
// (that env var sometimes goes unset, silently dropping notifications).
// Includes Approve/Deny buttons so officers can review without leaving
// Discord — handlers live in the interactionCreate listener below.
async function sendApplicationAlert(app) {
  if (!client || !client.isReady() || !OFFICER_CHANNEL_ID) {
    console.warn('Cannot send application alert — bot not ready or no officer channel configured');
    return false;
  }
  try {
    const channel = await client.channels.fetch(OFFICER_CHANNEL_ID);
    if (!channel) return false;
    const embed = new EmbedBuilder()
      .setTitle('New Guild Application')
      .setColor(0xB91C1C)
      .addFields(
        { name: 'Character Name', value: String(app.characterName || app.character_name || 'N/A'), inline: true },
        { name: 'Server', value: String(app.server || 'N/A'), inline: true },
        { name: 'Class & Spec', value: String(app.classSpec || app.class_spec || 'N/A'), inline: true },
        { name: 'Discord', value: String(app.discord || app.discord_tag || 'N/A'), inline: true },
        { name: 'PvP Experience', value: String(app.experience || 'Not provided').slice(0, 1024), inline: false },
        { name: 'Why MDGA?', value: String(app.whyJoin || app.why_join || 'Not provided').slice(0, 1024), inline: false },
      )
      .setFooter({ text: `App #${app.id} • Review at mdga.gg/admin` })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_app:${app.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_app:${app.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );
    await channel.send({ embeds: [embed], components: [row] });
    return true;
  } catch (err) {
    console.error('sendApplicationAlert error:', err);
    return false;
  }
}

// DM an approved applicant with next-step instructions. Called from both
// the web Approve button (PUT /api/applications/:id) AND the Discord
// approve_app button. Resolves a Discord ID from either the applicant's
// linked site account or by searching the guild for their discord_tag.
// Returns one of: { status: 'sent' | 'already_in_server' | 'no_discord_id'
// | 'dm_blocked' | 'bot_not_ready' }.
async function sendApplicationApprovedDM(opts) {
  const { discordId, discordTag } = opts || {};
  if (!client || !client.isReady() || !GUILD_ID) {
    return { status: 'bot_not_ready' };
  }
  // Resolve discordId if only a tag was provided
  let resolvedId = discordId || null;
  if (!resolvedId && discordTag) {
    try {
      const guild = client.guilds.cache.get(GUILD_ID);
      if (guild) {
        const members = await guild.members.fetch({ query: discordTag, limit: 5 }).catch(() => null);
        const match = members?.find((m) =>
          m.user?.username?.toLowerCase() === discordTag.toLowerCase()
          || m.user?.tag?.toLowerCase() === discordTag.toLowerCase()
        );
        if (match) resolvedId = match.user.id;
      }
    } catch (err) {
      console.warn('[App approval DM] guild lookup failed:', err.message);
    }
  }
  if (!resolvedId) return { status: 'no_discord_id' };

  // Always show the static permanent invite + name the channel. We
  // intentionally don't branch on "already in the server" — this is a
  // first-contact message; the applicant may have left, applied from a
  // different account, or never been in the server. Either way, the
  // friendly invite + channel name reads correctly.
  const intro = `🔗 **Join our Discord:** https://discord.gg/wowmdga\nOnce you're in, head to **#guild-invite-request** for your in-game invite.`;

  // Image paths — falls back to null if any image is missing on this
  // host, in which case the embed renders without it. Tries dist first
  // (deployed location) then public/source (dev/repo location).
  function findImage(name, extraSubdir) {
    const candidates = [
      path.resolve(__dirname, '..', 'client', 'dist', name),
      path.resolve(__dirname, '..', 'client', 'public', name),
      path.resolve(__dirname, '..', name),
    ];
    if (extraSubdir) candidates.unshift(path.resolve(__dirname, '..', extraSubdir, name));
    return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
  }
  const balloonPath = findImage('MDGA_ballon.png');
  const finderPath = findImage('guild_finder.png', 'images');

  // First embed: welcome + Discord invite + channel pointer
  const welcome = new EmbedBuilder()
    .setTitle('Welcome to MDGA!')
    .setColor(0xD4A017)
    .setDescription([
      `🎉 **Your MDGA guild application has been approved!** Welcome aboard.`,
      ``,
      intro,
    ].join('\n'))
    .setTimestamp();
  if (balloonPath) welcome.setImage('attachment://MDGA_ballon.png');

  // Second embed: GuildFinder how-to with screenshot
  const instructions = new EmbedBuilder()
    .setTitle('How to get your in-game invite')
    .setColor(0xD4A017)
    .setDescription([
      `⚔️ The easiest way is to apply through **GuildFinder** in-game. All our guilds (including MEGA) can be found by searching for **MDGA**. Sending an invite when you're offline doesn't always work, so applying yourself through GuildFinder is more reliable.`,
      ``,
      `📜 **The guild description in GuildFinder will tell you which one it is:**`,
      `🔴 **MDGA1** — Main Guild (Mains and 1 very active alt only)`,
      `🟠 **MDGA2** — Mains and less-played / other alts`,
      `🟡 **MDGA3** — Mains and less-played / other alts`,
      `🔵 **MEGA** — Main and alts (Alliance side)`,
      ``,
      `❓ If you run into any issues, ask in **#guild-invite-request** and an officer will sort it.`,
    ].join('\n'));
  if (finderPath) instructions.setImage('attachment://guild_finder.png');

  const files = [];
  if (balloonPath) files.push(new AttachmentBuilder(balloonPath, { name: 'MDGA_ballon.png' }));
  if (finderPath) files.push(new AttachmentBuilder(finderPath, { name: 'guild_finder.png' }));

  try {
    const dmUser = await client.users.fetch(resolvedId);
    if (!dmUser) return { status: 'no_discord_id' };
    await dmUser.send({ embeds: [welcome, instructions], files });
    return {
      status: 'sent',
      balloonAttached: !!balloonPath,
      finderAttached: !!finderPath,
    };
  } catch (err) {
    // 50007 = "Cannot send messages to this user" (DMs closed)
    if (err.code === 50007) return { status: 'dm_blocked' };
    console.error('sendApplicationApprovedDM error:', err);
    return { status: 'dm_blocked' };
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
// FETCH ALL GUILD MEMBERS from the Discord server.
// Returns an array of { discord_id, username, display_name, nickname, joined_at, roles }.
// roles is an array of role IDs (excluding @everyone). Used by the reconciliation sync.
// ================================================
async function fetchAllGuildMembers() {
  if (!client || !client.isReady()) return null;
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return null;

  const collection = await guild.members.fetch();
  const out = [];
  const everyoneId = guild.id;
  collection.forEach((member) => {
    const roles = [];
    member.roles.cache.forEach((r) => {
      if (r.id !== everyoneId) roles.push(r.id);
    });
    out.push({
      discord_id: member.id,
      username: member.user.username,
      display_name: member.user.globalName || member.user.displayName || null,
      nickname: member.nickname || null,
      joined_at: member.joinedAt ? new Date(member.joinedAt) : null,
      roles,
    });
  });
  return out;
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

// ================================================
// SEND to an arbitrary channel id (used by giveaway announcements, where
// admins choose between a test channel and the public Events channel).
// Falls back to OFFICER_CHANNEL_ID when channelId is blank so old configs
// (no channel persisted) still behave sensibly.
// ================================================
function absolutizeImageUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://mdga.gg${u.startsWith('/') ? '' : '/'}${u}`;
}

async function sendDiscordAnnouncement(channelId, title, description, color = 0xD4AF37, options = {}) {
  if (!client || !client.isReady()) return false;
  const target = String(channelId || '').trim() || OFFICER_CHANNEL_ID;
  if (!target) return false;
  try {
    const channel = await client.channels.fetch(target);
    if (!channel) return false;

    // Discord trick for multi-image embeds: multiple embeds sharing the
    // same URL property render as a single grouped gallery (up to 4
    // images shown). Callers pass either options.imageUrl (single) or
    // options.imageUrls (array, max 4 honored).
    const rawImages = Array.isArray(options.imageUrls) && options.imageUrls.length > 0
      ? options.imageUrls.slice(0, 4)
      : (options.imageUrl ? [options.imageUrl] : []);
    const imageUrls = rawImages.map(absolutizeImageUrl).filter(Boolean);

    if (imageUrls.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      return true;
    }

    // Pick a stable gallery URL (the source post if provided, else the
    // first image URL). Discord groups embeds by URL identity, so this
    // value must be the same on every embed in the batch.
    const galleryUrl = options.galleryUrl || imageUrls[0];

    const embeds = imageUrls.map((u, i) => {
      const e = new EmbedBuilder().setURL(galleryUrl).setColor(color).setImage(u);
      if (i === 0) {
        e.setTitle(title).setDescription(description).setTimestamp();
      }
      return e;
    });
    await channel.send({ embeds });
    return true;
  } catch (err) {
    console.error(`sendDiscordAnnouncement error (channel ${target}):`, err.message);
    return false;
  }
}

module.exports = { startBot, checkGuildMember, sendApprovalRequest, sendApplicationAlert, sendApplicationApprovedDM, sendOfficerAlert, sendDiscordAnnouncement, sendUnbanRequest, getGuildRoles, setMemberNickname, setMemberRoles, fetchAllGuildMembers };
