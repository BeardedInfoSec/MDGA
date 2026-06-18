const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start safely.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '24h';
// Pin the signing/verification algorithm. Without an explicit allow-list,
// jwt.verify accepts any algorithm in the token header, which opens an
// algorithm-confusion surface. We only ever issue HS256.
const JWT_ALGORITHMS = ['HS256'];

function signToken(user, permissions) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      rank: user.rank,
      permissions: permissions || [],
      // Per-user token version. Bumping users.token_version (e.g. via
      // /auth/logout-all) invalidates every outstanding token for that
      // user without rotating the global JWT_SECRET.
      tv: user.token_version || 0,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHMS[0] }
  );
}

// Load user permissions from roles
async function loadUserPermissions(userId) {
  const [rows] = await pool.execute(`
    SELECT DISTINCT p.key_name
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ?
  `, [userId]);
  return rows.map(r => r.key_name);
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    const [rows] = await pool.execute(
      'SELECT id, username, display_name, `rank`, display_rank, status, avatar_url, realm, character_name, discord_id, discord_username, timezone, token_version, account_locked_at, account_locked_until, account_locked_reason FROM users WHERE id = ?',
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    // Per-user revocation: a token whose tv claim no longer matches the
    // current users.token_version has been revoked. Missing claim == 0
    // (legacy tokens issued before this column existed stay valid until expiry).
    if ((decoded.tv || 0) !== (rows[0].token_version || 0)) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    if (rows[0].status !== 'active') {
      return res.status(403).json({ error: 'Account not active', status: rows[0].status });
    }
    // Account lock check. NULL until = indefinite; future until = timed lock.
    // Past until = expired lock, treat as unlocked (lazy-clear is fine; a
    // separate sweeper isn't needed because locked rows are rare).
    if (rows[0].account_locked_at) {
      const until = rows[0].account_locked_until ? new Date(rows[0].account_locked_until) : null;
      if (!until || until.getTime() > Date.now()) {
        return res.status(403).json({
          error: 'Account locked',
          status: 'locked',
          lockedUntil: until ? until.toISOString() : null,
          lockedReason: rows[0].account_locked_reason || null,
        });
      }
    }
    req.user = rows[0];

    // Load permissions from database
    req.user.permissions = await loadUserPermissions(req.user.id);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Like requireAuth but never 401s. If a valid token is present, populates
// req.user (including permissions). If not, leaves req.user undefined and
// continues. Used by endpoints that have a public read mode but want to
// branch on identity (e.g., leaderboards anonymizing for non-members).
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    const [rows] = await pool.execute(
      'SELECT id, username, display_name, `rank`, display_rank, status, avatar_url, realm, character_name, discord_id, discord_username, timezone, token_version FROM users WHERE id = ?',
      [decoded.id]
    );
    if (rows.length > 0 && rows[0].status === 'active' && (decoded.tv || 0) === (rows[0].token_version || 0)) {
      req.user = rows[0];
      req.user.permissions = await loadUserPermissions(req.user.id);
    }
  } catch {
    // Invalid token → treat as anonymous, no error
  }
  next();
}

// Backward-compatible: checks rank OR permissions
function requireOfficer(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Officer access required' });
  const hasRank = ['officer', 'guildmaster'].includes(req.user.rank);
  const hasPerm = req.user.permissions && req.user.permissions.includes('admin.view_panel');
  if (!hasRank && !hasPerm) {
    return res.status(403).json({ error: 'Officer access required' });
  }
  next();
}

function requireGuildMaster(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Guild Master access required' });
  // Accept actual guildmaster rank OR any role that grants admin.manage_roles
  // — lets the website_guru RBAC role reach GM-gated *read* pages (viewing
  // Discord role mappings, role lists, etc.) without needing the literal rank.
  //
  // SECURITY: Do NOT use this for routes that can MINT privileges (assigning
  // roles to users, editing rank-affecting Discord mappings). For those use
  // requireGuildMasterStrict — otherwise an admin.manage_roles holder can
  // self-promote to full GM. See requireGuildMasterStrict below.
  const isGM = req.user.rank === 'guildmaster';
  const hasAdminRoles = req.user.permissions && req.user.permissions.includes('admin.manage_roles');
  if (!isGM && !hasAdminRoles) {
    return res.status(403).json({ error: 'Guild Master access required' });
  }
  next();
}

// Strict Guild Master gate — the literal rank only, no permission shortcut.
// Use on any route that can grant roles/permissions or alter the
// Discord-role → site-rank mappings, so that holding admin.manage_roles
// cannot be parlayed into a self-promotion to Guild Master.
function requireGuildMasterStrict(req, res, next) {
  if (!req.user) return res.status(403).json({ error: 'Guild Master access required' });
  if (req.user.rank !== 'guildmaster') {
    return res.status(403).json({ error: 'Guild Master access required' });
  }
  next();
}

// Permission-based middleware factory
function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    // Officers and guildmasters bypass all permission checks
    if (['officer', 'guildmaster'].includes(req.user.rank)) return next();
    // Check if user has ANY of the required permissions
    const hasAny = perms.some(p => req.user.permissions.includes(p));
    if (!hasAny) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    next();
  };
}

module.exports = { signToken, loadUserPermissions, requireAuth, optionalAuth, requireOfficer, requireGuildMaster, requireGuildMasterStrict, requirePermission };
