const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start safely.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '24h';

function signToken(user, permissions) {
  return jwt.sign(
    { id: user.id, username: user.username, rank: user.rank, permissions: permissions || [] },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
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
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, username, display_name, `rank`, status, avatar_url, realm, character_name, discord_id, discord_username, timezone FROM users WHERE id = ?',
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (rows[0].status !== 'active') {
      return res.status(403).json({ error: 'Account not active', status: rows[0].status });
    }
    req.user = rows[0];

    // Load permissions from database
    req.user.permissions = await loadUserPermissions(req.user.id);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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
  if (!req.user || req.user.rank !== 'guildmaster') {
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

module.exports = { signToken, loadUserPermissions, requireAuth, requireOfficer, requireGuildMaster, requirePermission };
