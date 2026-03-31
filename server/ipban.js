// ================================================
// IP BAN — Tracks cumulative failed login attempts
// 60 failures in 24 hours → full site ban for 24h
// ================================================
const DAILY_LIMIT = 60;
const BAN_MS = 24 * 60 * 60 * 1000; // 24 hours
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hour window

// ip -> { timestamps: number[], bannedUntil: number|null }
const ipTracking = new Map();

// Cleanup every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipTracking) {
    if (data.bannedUntil && now > data.bannedUntil) {
      ipTracking.delete(ip);
    } else if (!data.bannedUntil) {
      // Remove old timestamps
      data.timestamps = data.timestamps.filter(t => now - t < WINDOW_MS);
      if (data.timestamps.length === 0) ipTracking.delete(ip);
    }
  }
}, 30 * 60 * 1000);

// Check if IP is banned
function isBanned(ip) {
  const data = ipTracking.get(ip);
  if (!data || !data.bannedUntil) return false;
  if (Date.now() > data.bannedUntil) {
    ipTracking.delete(ip);
    return false;
  }
  return true;
}

// Record a failed attempt; returns true if this triggered a ban
function recordFailure(ip) {
  const now = Date.now();
  let data = ipTracking.get(ip);
  if (!data) {
    data = { timestamps: [], bannedUntil: null };
    ipTracking.set(ip, data);
  }

  // Prune old timestamps
  data.timestamps = data.timestamps.filter(t => now - t < WINDOW_MS);
  data.timestamps.push(now);

  if (data.timestamps.length >= DAILY_LIMIT) {
    data.bannedUntil = now + BAN_MS;
    return true;
  }
  return false;
}

// Express middleware — blocks banned IPs from entire site
function ipBanMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (isBanned(ip)) {
    const message = 'Your IP address is temporarily banned due to excessive failed login attempts. This ban is lifted automatically in 24 hours.';
    if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({
        error: message,
        code: 'IP_BANNED',
      });
    }
    return res.status(403).send('<!DOCTYPE html><html><head><title>Access Denied</title></head><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;"><h1 style="color:#B91C1C;">Access Denied</h1><p>Your IP address has been temporarily banned due to excessive failed login attempts.</p><p>This ban will be lifted automatically in 24 hours.</p></div></body></html>');
  }
  next();
}

module.exports = { isBanned, recordFailure, ipBanMiddleware };
