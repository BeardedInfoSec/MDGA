const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { signToken, loadUserPermissions, requireAuth } = require('../middleware/auth');
const { sendOfficerAlert } = require('../bot');
const { recordFailure } = require('../ipban');
const { sendEmail } = require('../services/email');

const router = express.Router();

// Rate limiting — track failed login attempts per IP
const loginAttempts = new Map(); // ip -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts) {
    if (data.lockedUntil && now > data.lockedUntil) {
      loginAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// POST /api/auth/login — username + password login (no Discord)
router.post('/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const entry = loginAttempts.get(ip);

    // Check if locked out
    if (entry && entry.lockedUntil) {
      if (Date.now() < entry.lockedUntil) {
        const minutesLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`, locked: true });
      }
      // Lockout expired — reset
      loginAttempts.delete(ip);
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      recordFailedAttempt(ip, username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Your account has been banned. If you believe this is a mistake, please contact an officer.', status: 'banned' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active', status: user.status });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Password login is not set up for this account. Use Discord to log in.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordFailedAttempt(ip, username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Success — clear failed attempts
    loginAttempts.delete(ip);

    const permissions = await loadUserPermissions(user.id);
    const token = signToken({ id: user.id, username: user.username, rank: user.rank }, permissions);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        rank: user.rank,
        displayRank: user.display_rank || null,
        avatarUrl: user.avatar_url,
        realm: user.realm,
        characterName: user.character_name,
        timezone: user.timezone,
        permissions,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

function recordFailedAttempt(ip, username) {
  const entry = loginAttempts.get(ip) || { count: 0 };
  entry.count += 1;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    loginAttempts.set(ip, entry);
    console.warn(`Login locked: IP ${ip}, username "${username}" — ${MAX_ATTEMPTS} failed attempts`);

    // Alert officers via Discord
    sendOfficerAlert(
      'Login Lockout Alert',
      `**${MAX_ATTEMPTS} failed login attempts** detected.\n\n` +
      `**Username tried:** ${username}\n` +
      `**IP Address:** ${ip}\n` +
      `**Locked for:** 15 minutes\n\n` +
      `This could indicate a brute-force attempt.`,
      0xFF0000
    );
  } else {
    loginAttempts.set(ip, entry);
  }

  // Track cumulative daily failures for IP ban (60 in 24h → site-wide ban)
  const banned = recordFailure(ip);
  if (banned) {
    console.warn(`IP BANNED: ${ip}, username "${username}" — 60+ failed attempts in 24h`);
    sendOfficerAlert(
      'IP Address Banned',
      `**IP address has been banned for 24 hours** due to excessive failed login attempts.\n\n` +
      `**Last username tried:** ${username}\n` +
      `**IP Address:** ${ip}\n` +
      `**Duration:** 24 hours\n` +
      `**Total failures:** 60+ in 24 hours\n\n` +
      `The IP is blocked from the entire site.`,
      0x000000
    );
  }
}

// PUT /api/auth/password — set or change password (requires auth)
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // If user already has a password, require current password
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (rows[0].password_hash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out' });
});

// ── Officer Toolkit token issuance ──
// The MDGA Officer Toolkit (Tauri desktop app) authenticates by having
// the officer sign into the website in their browser, click "Generate
// toolkit code" on a small page, and paste the 8-char code into the
// app. The app exchanges the code for a 7-day JWT.
//
// Codes live in this in-memory Map for ~5 minutes. Server restart
// between issue+exchange voids the code (officer regenerates).
const TOOLKIT_CODE_TTL_MS = 5 * 60 * 1000;
const toolkitCodes = new Map(); // code -> { token, expiresAt, userId }
function gcToolkitCodes() {
  const now = Date.now();
  for (const [code, entry] of toolkitCodes) {
    if (entry.expiresAt <= now) toolkitCodes.delete(code);
  }
}
function genToolkitCode() {
  // 8 char [A-Z2-9] excluding O/0/I/1 for visual clarity
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// POST /api/auth/toolkit-token-issue
// Officer must be signed in (requireAuth) and have officer/guildmaster
// rank OR admin.view_panel permission. Mints a 7-day toolkit JWT and a
// one-time paste code; returns the code.
router.post('/toolkit-token-issue', requireAuth, async (req, res) => {
  try {
    gcToolkitCodes();
    const { loadUserPermissions } = require('../middleware/auth');
    const permissions = await loadUserPermissions(req.user.id);
    const isAdmin = permissions.includes('admin.view_panel');
    const isOfficer = ['officer', 'guildmaster'].includes(req.user.rank);
    if (!isOfficer && !isAdmin) {
      return res.status(403).json({ error: 'Officer or admin access required' });
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: req.user.id,
        username: req.user.username,
        rank: req.user.rank,
        permissions,
        purpose: 'toolkit',
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Generate a unique code (retry on collision; ~10^12 keyspace so very rare).
    let code;
    for (let i = 0; i < 5; i++) {
      const candidate = genToolkitCode();
      if (!toolkitCodes.has(candidate)) { code = candidate; break; }
    }
    if (!code) return res.status(500).json({ error: 'Could not allocate code' });
    toolkitCodes.set(code, {
      token,
      expiresAt: Date.now() + TOOLKIT_CODE_TTL_MS,
      userId: req.user.id,
    });
    res.json({
      code,
      expiresInSeconds: Math.floor(TOOLKIT_CODE_TTL_MS / 1000),
      issuedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Toolkit token issue error:', err);
    res.status(500).json({ error: 'Failed to issue toolkit code' });
  }
});

// POST /api/auth/toolkit-token-exchange
// Public — the toolkit POSTs the 8-char code it received from the
// officer and receives the underlying 7-day JWT. One-time use; the
// code is deleted on successful exchange.
router.post('/toolkit-token-exchange', async (req, res) => {
  try {
    gcToolkitCodes();
    const codeRaw = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(codeRaw)) {
      return res.status(400).json({ error: 'Code must be 8 characters (A-Z, 2-9)' });
    }
    const entry = toolkitCodes.get(codeRaw);
    if (!entry || entry.expiresAt <= Date.now()) {
      return res.status(404).json({ error: 'Code not found or expired' });
    }
    toolkitCodes.delete(codeRaw);
    res.json({
      token: entry.token,
      expiresInDays: 7,
      issuedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Toolkit token exchange error:', err);
    res.status(500).json({ error: 'Failed to exchange code' });
  }
});

// POST /api/auth/toolkit-token-refresh
// Toolkit calls this on launch when its current JWT is within ~24h of
// expiry. Mints a fresh 7-day JWT and returns it. The caller must
// already hold a valid toolkit JWT (purpose=toolkit).
router.post('/toolkit-token-refresh', requireAuth, async (req, res) => {
  try {
    // requireAuth has already validated the existing JWT, but rebuilds
    // req.user from the DB row — the `purpose` claim from the JWT
    // doesn't propagate. Re-decode here to ensure this refresh path
    // is only usable with a toolkit-minted token.
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers.authorization || '';
    const tok = authHeader.split(' ')[1];
    const decoded = jwt.verify(tok, process.env.JWT_SECRET);
    if (decoded.purpose !== 'toolkit') {
      return res.status(403).json({ error: 'Not a toolkit token' });
    }
    const { loadUserPermissions } = require('../middleware/auth');
    const permissions = await loadUserPermissions(req.user.id);
    const token = jwt.sign(
      {
        id: req.user.id,
        username: req.user.username,
        rank: req.user.rank,
        permissions,
        purpose: 'toolkit',
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, expiresInDays: 7, issuedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Toolkit token refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh' });
  }
});

// POST /api/auth/companion-token
// Issues a long-lived JWT (90 days) for the MDGA Audit Tool / companion app to
// hit officer-only endpoints. Restricted to Guildmaster rank or anyone with the
// `admin.view_panel` permission — i.e. the website's "admin role" tier. Officers
// without admin perms cannot mint long-lived tokens.
router.post('/companion-token', requireAuth, async (req, res) => {
  try {
    const { loadUserPermissions } = require('../middleware/auth');
    const permissions = await loadUserPermissions(req.user.id);
    const isAdmin = permissions.includes('admin.view_panel');
    if (req.user.rank !== 'guildmaster' && !isAdmin) {
      return res.status(403).json({ error: 'Guildmaster or admin access required' });
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: req.user.id,
        username: req.user.username,
        rank: req.user.rank,
        permissions,
        purpose: 'companion',
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );
    res.json({
      token,
      expiresInDays: 90,
      issuedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Companion token error:', err);
    res.status(500).json({ error: 'Failed to issue token' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  // Pull the faction of the user's main character so the UI can theme itself
  // (e.g. swap the MDGA logo for the MEGA logo when the main is Alliance).
  // Falls back to null if the user hasn't picked a main yet.
  let mainFaction = null;
  try {
    const [rows] = await pool.execute(
      'SELECT faction FROM user_characters WHERE user_id = ? AND is_main = TRUE LIMIT 1',
      [req.user.id]
    );
    mainFaction = rows[0]?.faction || null;
  } catch (err) {
    console.warn('[/auth/me] main faction lookup failed:', err.message);
  }
  // Lightweight character-count tag so the frontend can decide whether to
  // show the first-time onboarding modal. Single COUNT, no per-row overhead.
  let characterCount = 0;
  try {
    const [[row]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM user_characters WHERE user_id = ?',
      [req.user.id]
    );
    characterCount = row.n || 0;
  } catch (err) {
    console.warn('[/auth/me] character count lookup failed:', err.message);
  }
  // Pull the user's main WoW character so the UI can prefer it over the
  // generic display_name when greeting / labeling them (rapazzini forum #34:
  // "show main character as display name, discord in parens").
  let mainCharacterName = null;
  let discordUsername = req.user.discord_username || null;
  try {
    const [[mc]] = await pool.execute(
      'SELECT character_name FROM user_characters WHERE user_id = ? AND is_main = TRUE LIMIT 1',
      [req.user.id]
    );
    mainCharacterName = mc?.character_name || null;
    if (!discordUsername) {
      const [[u]] = await pool.execute('SELECT discord_username FROM users WHERE id = ?', [req.user.id]);
      discordUsername = u?.discord_username || null;
    }
  } catch (err) {
    console.warn('[/auth/me] main character lookup failed:', err.message);
  }
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.display_name,
      rank: req.user.rank,
      displayRank: req.user.display_rank || null,
      avatarUrl: req.user.avatar_url,
      realm: req.user.realm,
      characterName: req.user.character_name,
      mainCharacterName,
      discordUsername,
      timezone: req.user.timezone,
      permissions: req.user.permissions || [],
      mainFaction,
      characterCount,
    },
  });
});

// POST /api/auth/test-email — send a test email (officer+ only)
router.post('/test-email', requireAuth, async (req, res) => {
  if (!['officer', 'guildmaster'].includes(req.user.rank)) {
    return res.status(403).json({ error: 'Officers only' });
  }

  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Email address required' });

  const result = await sendEmail(
    to,
    'MDGA Email Test',
    '<h2 style="color:#B91C1C;">MDGA Email Test</h2><p>If you see this, SMTP is working correctly.</p>'
  );

  res.json({ success: result, message: result ? 'Email sent' : 'Email failed — check server logs' });
});

module.exports = router;
