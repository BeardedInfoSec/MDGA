require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Apache) — fixes rate limiting + real client IPs
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const APP_ROOT = path.resolve(__dirname, '..');

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      // No 'unsafe-inline' for scripts: the Vite build emits only external
      // hashed bundles (no inline <script>), so a strict policy doesn't break
      // anything and restores CSP as a real XSS backstop for the
      // DOMPurify-sanitized markdown render path. styleSrc keeps
      // 'unsafe-inline' because React injects inline styles at runtime.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://discord.com', 'https://oauth.battle.net', 'https://us.api.blizzard.com'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://discord.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow Vite dev server in development. CORS_ORIGIN may be a
// comma-separated list so production can allow both mdga.gg and mdga.dev.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [`http://localhost:${PORT}`, 'http://localhost:5173'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// IP ban middleware — blocks IPs with 60+ failed login attempts in 24h
const { ipBanMiddleware } = require('./ipban');
app.use(ipBanMiddleware);

// Body parsing. JSON capped at 2mb (image/file uploads go through multer,
// not JSON, so this only needs to cover text payloads + the occasional
// pasted roster JSON). urlencoded explicitly capped too.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiter for API routes.
// Anonymous traffic: 200/15min — tight, since unauthenticated requests
// have no audit trail and are the actual abuse target.
// Authenticated traffic: 2000/15min — power users like officers running
// admin pages or members during a giveaway launch blew past the old flat
// 200 limit, causing the dashboard + forum to silently render empty.
// The larger bucket is granted ONLY for a cryptographically VALID token —
// previously any "Bearer " prefix sufficed, letting an attacker grab 10x
// the budget against expensive unauthenticated endpoints with a bogus header.
const jwtForLimiter = require('jsonwebtoken');
function hasValidBearer(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    jwtForLimiter.verify(auth.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => (hasValidBearer(req) ? 2000 : 200),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Serve uploaded images
app.use('/uploads', express.static(path.join(APP_ROOT, 'uploads'), {
  dotfiles: 'deny',
  fallthrough: false,
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// Serve /images from project root
app.use('/images', express.static(path.join(APP_ROOT, 'images'), {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// Serve /wow_addon as static so audit-tool and addon downloads land as
// real files. Without this mount, /wow_addon/* falls through to the SPA
// fallback below and the browser receives index.html bytes saved as
// `.zip` — appears corrupt (rapazzini forum #72).
app.use('/wow_addon', express.static(path.join(APP_ROOT, 'wow_addon'), {
  dotfiles: 'deny',
  index: false,
  fallthrough: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (filePath.endsWith('.zip')) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
  },
}));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/discord', require('./routes/discord'));
app.use('/api/events', require('./routes/events'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api/notifications', require('./routes/notifications'));
// SSE heartbeat — keeps long-lived connections from being closed by
// intermediary proxies that timeout silent streams.
require('./services/notification-stream').startHeartbeat();
// Periodic scheduler that fires the 'event' broadcast when a scheduled
// event's publish_at lands. Self-starts on require.
require('./services/event-publish-scheduler');
// Periodic scheduler that posts a "now live" Discord embed to the events
// channel when an event's starts_at lands (rapazzini forum #65 item 3).
require('./services/event-live-scheduler');
app.use('/api/users', require('./routes/users'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/characters', require('./routes/characters'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/discord-roles', require('./routes/discord-roles'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/guild', require('./routes/guild'));
app.use('/api/carousel', require('./routes/carousel'));
app.use('/api/overlord', require('./routes/overlord'));
app.use('/api/addon', require('./routes/addon'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reconciliation', require('./routes/reconciliation'));
app.use('/api/admin', require('./routes/admin'));

// The routes the React router actually serves. Kept here so the SPA catch-all
// can tell a real page from a typo and answer with a real status code.
// Auth-gated routes are included: they exist, they just redirect to /login.
// '/index.php' is the home page, not a stray path: Apache's DirectoryIndex
// resolves the site root before the proxy rule forwards it, so a request to
// https://mdga.gg/ reaches Express as '/index.php'. Verified on prod — leaving
// it out made the home page answer 404 while every other route was fine.
const SPA_ROUTES = new Set([
  '/', '/index.php', '/login', '/admin-login', '/join', '/story', '/leadership',
  '/events', '/leaderboards', '/forum', '/profile', '/admin',
  '/overlord', '/wow-addon',
]);
const SPA_PREFIXES = ['/forum/', '/officer-toolkit/'];

function isKnownRoute(reqPath) {
  const clean = reqPath.length > 1 && reqPath.endsWith('/') ? reqPath.slice(0, -1) : reqPath;
  return SPA_ROUTES.has(clean) || SPA_PREFIXES.some((prefix) => reqPath.startsWith(prefix));
}

// robots.txt / sitemap.xml. Served from Express rather than the client bundle
// so they don't depend on a front-end rebuild to change. Both previously fell
// through to the SPA catch-all and answered 200 with index.html, so crawlers
// got a page of React markup where they asked for a sitemap.
//
// Only genuinely public pages are listed. /overlord is a deliberately
// unlisted direct-link archive, so it is omitted rather than Disallow'd —
// a Disallow line would publish the path to anyone reading robots.txt.
const PUBLIC_PAGES = ['/', '/join', '/story', '/leadership', '/events', '/leaderboards'];

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /admin-login',
    'Disallow: /profile',
    'Disallow: /forum',
    'Disallow: /uploads/',
    '',
    'Sitemap: https://mdga.gg/sitemap.xml',
    '',
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const urls = PUBLIC_PAGES
    .map((page) => `  <url><loc>https://mdga.gg${page}</loc></url>`)
    .join('\n');
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    '</urlset>\n'
  );
});

// React SPA: serve client/dist if the build exists.
const REACT_DIST = path.join(APP_ROOT, 'client', 'dist');
const fs = require('fs');
const serveReact = fs.existsSync(path.join(REACT_DIST, 'index.html'));

if (serveReact) {
  // Legacy static URL compatibility rewrites.
  app.get([
    '/index.html',
    '/home',
    '/home.html',
    '/events/index.html',
    '/events.html',
    '/forum/index.html',
    '/forum.html',
    '/forum/new-post.html',
    '/leaderboards/index.html',
    '/leaderboards.html',
    '/leadership/index.html',
    '/leadership.html',
    '/story/index.html',
    '/story.html',
    '/profile/index.html',
    '/profile.html',
    '/login/index.html',
    '/login.html',
    '/admin/index.html',
    '/admin.html',
    '/admin-login/index.html',
    '/admin-login.html',
    '/join/index.html',
    '/join.html',
  ], (req, res) => {
    const redirects = {
      '/index.html': '/',
      '/home': '/',
      '/home.html': '/',
      '/events/index.html': '/events',
      '/events.html': '/events',
      '/forum/index.html': '/forum',
      '/forum.html': '/forum',
      '/forum/new-post.html': '/forum',
      '/leaderboards/index.html': '/leaderboards',
      '/leaderboards.html': '/leaderboards',
      '/leadership/index.html': '/leadership',
      '/leadership.html': '/leadership',
      '/story/index.html': '/story',
      '/story.html': '/story',
      '/profile/index.html': '/profile',
      '/profile.html': '/profile',
      '/login/index.html': '/login',
      '/login.html': '/login',
      '/admin/index.html': '/admin',
      '/admin.html': '/admin',
      '/admin-login/index.html': '/admin-login',
      '/admin-login.html': '/admin-login',
      '/join/index.html': '/join',
      '/join.html': '/join',
    };
    return res.redirect(301, redirects[req.path] || '/');
  });

  // Serve React build assets (JS, CSS, etc.)
  app.use(express.static(REACT_DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA catch-all: all non-API routes serve React's index.html. Unknown paths
  // still get the app (the client router sends them home), but with a 404
  // status so crawlers aren't told every typo is a real page.
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res
      .status(isKnownRoute(req.path) ? 200 : 404)
      .sendFile(path.join(REACT_DIST, 'index.html'));
  });
} else {
  // No React build found — refuse to serve project root (would expose .env and other secrets)
  console.error('FATAL: React build not found at client/dist/index.html. Run: cd client && npm run build');
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.status(503).send('Site is temporarily unavailable. Please try again later.');
  });
}

app.listen(PORT, HOST, () => {
  console.log(`MDGA server running on http://${HOST}:${PORT}`);

  // Start Discord bot
  const { startBot } = require('./bot');
  startBot();

  // Start character refresh scheduler (every 2h, removes non-guild members)
  require('./services/character-scheduler');
});
