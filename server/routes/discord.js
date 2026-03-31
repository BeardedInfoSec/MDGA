// ================================================
// DISCORD OAUTH2 — Primary authentication method
// Creates accounts from Discord profile, issues JWT
// ================================================
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const pool = require('../db');
const { signToken, loadUserPermissions } = require('../middleware/auth');
const { checkGuildMember, sendApprovalRequest } = require('../bot');
const { syncUserRolesFromDiscord } = require('../services/discord-role-sync');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

// In-memory state store for CSRF protection
// Map<stateToken, { from, createdAt }>
const pendingStates = new Map();
const STATE_TTL = 10 * 60 * 1000; // 10 minutes

// One-time login grants to avoid passing JWTs in URL query params
// Map<grantCode, { token, user, createdAt }>
const pendingLoginGrants = new Map();
const LOGIN_GRANT_TTL = 2 * 60 * 1000; // 2 minutes

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now - val.createdAt > STATE_TTL) pendingStates.delete(key);
  }
}, 5 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingLoginGrants) {
    if (now - val.createdAt > LOGIN_GRANT_TTL) pendingLoginGrants.delete(key);
  }
}, 60 * 1000);

function createLoginGrant(token, user) {
  const grantCode = crypto.randomBytes(24).toString('hex');
  pendingLoginGrants.set(grantCode, {
    token,
    user,
    createdAt: Date.now(),
  });
  return grantCode;
}

// Exchange one-time grant code for JWT + user payload
router.post('/exchange', (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Grant code is required' });
  }

  const grant = pendingLoginGrants.get(code);
  if (!grant) {
    return res.status(400).json({ error: 'Invalid or expired login grant' });
  }

  pendingLoginGrants.delete(code);

  if (Date.now() - grant.createdAt > LOGIN_GRANT_TTL) {
    return res.status(400).json({ error: 'Invalid or expired login grant' });
  }

  return res.json({ token: grant.token, user: grant.user });
});

// ================================================
// GET /api/auth/discord — Initiate OAuth flow
// ?from=join|login — determines redirect after callback
// ================================================
router.get('/', (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({ error: 'Discord OAuth not configured' });
  }

  const state = crypto.randomBytes(20).toString('hex');
  const from = req.query.from || 'login';
  const appId = req.query.appId ? parseInt(req.query.appId, 10) : null;

  pendingStates.set(state, { from, appId, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state,
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ================================================
// GET /api/auth/discord/callback — Handle OAuth callback
// ================================================
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  // Discord denied or user cancelled
  if (oauthError) {
    return res.redirect('/login/?error=discord_denied');
  }

  // Validate state
  if (!state || !pendingStates.has(state)) {
    return res.redirect('/login/?error=invalid_state');
  }

  const { from, appId } = pendingStates.get(state);
  pendingStates.delete(state);

  // Determine redirect base based on origin
  const redirectBase = from === 'join' ? '/join/' : '/login/';

  if (!code) {
    return res.redirect(`${redirectBase}?error=discord_error`);
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Discord token exchange failed:', await tokenRes.text());
      return res.redirect(`${redirectBase}?error=discord_error`);
    }

    const tokenData = await tokenRes.json();

    // 2. Fetch Discord user profile
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error('Discord user fetch failed:', await userRes.text());
      return res.redirect(`${redirectBase}?error=discord_error`);
    }

    const discordUser = await userRes.json();
    const discordId = discordUser.id;
    const discordUsername = discordUser.username;
    const discordDisplayName = discordUser.global_name || discordUsername;
    const discordAvatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=256`
      : null;
    const discordEmail = discordUser.email || null;

    // 3. Find or create user
    let user = null;
    let isNewUser = false;

    // Check if this Discord account is already linked
    const [existing] = await pool.execute(
      'SELECT * FROM users WHERE discord_id = ?',
      [discordId]
    );

    if (existing.length > 0) {
      user = existing[0];
    } else {
      // Auto-create user from Discord profile
      const [result] = await pool.execute(
        'INSERT INTO users (discord_id, username, email, display_name, avatar_url, discord_username, discord_avatar, `rank`, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [discordId, discordUsername, discordEmail, discordDisplayName, discordAvatar, discordUsername, discordAvatar, 'recruit', 'pending_discord']
      );

      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = rows[0];
      isNewUser = true;
    }

    // 4. Update Discord info (in case username/avatar changed)
    await pool.execute(
      'UPDATE users SET discord_id = ?, discord_username = ?, discord_avatar = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
      [discordId, discordUsername, discordAvatar, discordAvatar, user.id]
    );

    // 4b. Link application data (character/realm) to user if appId was passed
    if (appId) {
      try {
        const [apps] = await pool.execute('SELECT character_name, server FROM applications WHERE id = ?', [appId]);
        if (apps.length) {
          const serverToRealm = { tichondrius: 'tichondrius', area52: 'area-52', illidan: 'illidan', zuljin: 'zuljin' };
          const realmSlug = serverToRealm[apps[0].server] || apps[0].server;
          await pool.execute(
            'UPDATE users SET character_name = ?, realm = ? WHERE id = ? AND character_name IS NULL',
            [apps[0].character_name, realmSlug, user.id]
          );
          // Link user to application so approval can send email
          await pool.execute(
            'UPDATE applications SET user_id = ?, discord_tag = ? WHERE id = ?',
            [user.id, discordUsername, appId]
          );
          user.character_name = apps[0].character_name;
          user.realm = realmSlug;
          console.log(`[Discord OAuth] Linked app #${appId} to user ${user.id}: ${apps[0].character_name} @ ${realmSlug}`);
        }
      } catch (appErr) {
        console.warn('[Discord OAuth] Failed to link application:', appErr.message);
      }
    }

    // 5. Check guild membership
    const member = await checkGuildMember(discordId);
    console.log(`[Discord OAuth] User ${discordUsername} (ID: ${user.id}) — inGuild: ${!!member}, status: ${user.status}, isNew: ${isNewUser}`);

    // Block banned users regardless of guild membership
    if (user.status === 'banned') {
      return res.redirect(`${redirectBase}?error=banned`);
    }

    if (member) {
      // In guild — activate account and sync rank/roles from Discord
      await pool.execute('UPDATE users SET status = ? WHERE id = ?', ['active', user.id]);

      const syncResult = await syncUserRolesFromDiscord(user.id, member);
      const newRank = syncResult.rank;

      // Load permissions and issue JWT
      const permissions = await loadUserPermissions(user.id);
      const jwt = signToken({ id: user.id, username: user.username, rank: newRank }, permissions);
      const userPayload = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        rank: newRank,
        avatarUrl: discordAvatar || user.avatar_url,
        realm: user.realm,
        characterName: user.character_name,
        timezone: user.timezone,
        permissions,
      };

      const grantCode = createLoginGrant(jwt, userPayload);

      // Use URL hash so the grant is not sent in Referer/header logs
      return res.redirect(`${redirectBase}#code=${grantCode}`);
    } else {
      // Not in guild — check if banned, suspended, or rejected
      if (user.status === 'banned') {
        return res.redirect(`${redirectBase}?error=banned`);
      }
      if (user.status === 'suspended' || user.status === 'rejected') {
        return res.redirect(`${redirectBase}?error=suspended`);
      }

      // Already approved but not in Discord server yet — let them log in
      // with a flag so the frontend can show the Discord invite
      if (user.status === 'active') {
        console.log(`[Discord OAuth] User ${discordUsername} is active but NOT in Discord — sending needsDiscord flag`);
        const [freshUser] = await pool.execute('SELECT * FROM users WHERE id = ?', [user.id]);
        const permissions = await loadUserPermissions(user.id);
        const jwt = signToken({ id: user.id, username: user.username, rank: freshUser[0].rank }, permissions);
        const userPayload = {
          id: user.id,
          username: user.username,
          displayName: freshUser[0].display_name,
          rank: freshUser[0].rank,
          avatarUrl: discordAvatar || freshUser[0].avatar_url,
          realm: freshUser[0].realm,
          characterName: freshUser[0].character_name,
          timezone: freshUser[0].timezone,
          permissions,
          needsDiscord: true,
        };

        const grantCode = createLoginGrant(jwt, userPayload);
        return res.redirect(`${redirectBase}#code=${grantCode}`);
      }

      // New user or not yet approved — send to officers for approval
      await pool.execute('UPDATE users SET status = ? WHERE id = ?', ['pending_approval', user.id]);

      // Refresh user data for the approval request
      const [updated] = await pool.execute('SELECT * FROM users WHERE id = ?', [user.id]);
      await sendApprovalRequest(updated[0]);

      const emailParam = discordEmail ? `&email=${encodeURIComponent(discordEmail)}` : '';
      return res.redirect(`${redirectBase}?status=pending${emailParam}`);
    }

  } catch (err) {
    console.error('Discord callback error:', err);
    return res.redirect(`${redirectBase}?error=discord_error`);
  }
});

module.exports = router;
