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
      scriptSrc: ["'self'", "'unsafe-inline'"],
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

// CORS — allow Vite dev server in development
app.use(cors({
  origin: process.env.CORS_ORIGIN || [
    `http://localhost:${PORT}`,
    'http://localhost:5173',
  ],
  credentials: true,
}));

// IP ban middleware — blocks IPs with 60+ failed login attempts in 24h
const { ipBanMiddleware } = require('./ipban');
app.use(ipBanMiddleware);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
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

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/discord', require('./routes/discord'));
app.use('/api/events', require('./routes/events'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/forum', require('./routes/forum'));
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
app.use('/api/addon', require('./routes/addon'));
app.use('/api/config', require('./routes/config'));

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

  // SPA catch-all: all non-API routes serve React's index.html
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(REACT_DIST, 'index.html'));
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
