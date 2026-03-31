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

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.display_name,
      rank: req.user.rank,
      avatarUrl: req.user.avatar_url,
      realm: req.user.realm,
      characterName: req.user.character_name,
      timezone: req.user.timezone,
      permissions: req.user.permissions || [],
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
