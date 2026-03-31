# MDGA — Make Durotar Great Again

Complete documentation for the MDGA guild website: installation, configuration, features, and administration.

---

## Recent Updates (v1.1.0)

- **Guild Verification**: Character validation now enforces guild membership in "MAKE DUROTAR GREAT AGAIN" (case-insensitive matching)
- **Duplicate Prevention**: Prevents same character from being claimed twice (checks `user_id`, `character_name`, `realm_slug` uniqueness)
- **Realm Slug Fix**: Fixed character lookup to use `profile.realm.slug` directly instead of regex parsing from API href
- **Guild & Faction Storage**: Added `guild_name` and `faction` columns to `user_characters` table (migration-027)
- **Security Hardening**: Strengthened Blizzard API integration with improved error handling and guild validation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Configuration (.env)](#4-configuration-env)
5. [Running the Server](#5-running-the-server)
6. [Apache Reverse Proxy](#6-apache-reverse-proxy)
7. [Architecture](#7-architecture)
8. [Authentication & Login](#8-authentication--login)
9. [Discord Integration](#9-discord-integration)
10. [Roles & Permissions (RBAC)](#10-roles--permissions-rbac)
11. [Characters & Blizzard API](#11-characters--blizzard-api)
12. [Guild System](#12-guild-system)
13. [Leaderboards](#13-leaderboards)
14. [Forum](#14-forum)
15. [Events](#15-events)
16. [Applications (Recruitment)](#16-applications-recruitment)
17. [Profile System](#17-profile-system)
18. [Admin Panel](#18-admin-panel)
19. [Home Page & Carousel](#19-home-page--carousel)
20. [Image Uploads](#20-image-uploads)
21. [WoW Addon Integration](#21-wow-addon-integration)
22. [Reports & Analytics](#22-reports--analytics)
23. [Security](#23-security)
24. [Database](#24-database)
25. [API Reference](#25-api-reference)
26. [Troubleshooting](#26-troubleshooting)

---

## 1. Overview

MDGA is a full-stack web application for the World of Warcraft guild **Make Durotar Great Again** on Tichondrius-US. It provides guild management, a forum, event scheduling, PvP/PvE leaderboards, character profiles synced from Blizzard's API, Discord integration, and a full admin panel.

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+ / Express 4 |
| Database | MySQL 8 (mysql2/promise connection pool) |
| Frontend | React 19 + React Router 6 (Vite 6 build) |
| Auth | Discord OAuth 2.0 + JWT (jsonwebtoken) |
| Process Manager | PM2 (auto-restart, logging, systemd boot) |
| External APIs | Blizzard Game Data API, Discord Bot API |
| Image Processing | sharp (WebP conversion, resize to 1920px) |
| CSS | CSS Modules (React components) |

---

## 2. Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package management |
| MySQL | 8+ | Database |
| PM2 | Latest | Process management (installed by setup) |
| Apache | 2.4+ | Reverse proxy (production) |

You will also need accounts for:

- **Discord Developer Portal** — Create an application with OAuth2 + Bot
- **Blizzard Developer Portal** (develop.battle.net) — API credentials for character data
- **Google reCAPTCHA v2** — For the application form

---

## 3. Installation

### Automated Setup

```bash
# 1. Clone or upload the project
cd /path/to/MDGA

# 2. Copy and fill in your .env (see Section 4)
cp .env.example .env
nano .env

# 3. Run the setup script
bash setup.sh
```

The setup script handles all 10 steps:

1. Checks prerequisites (Node 18+, npm, MySQL client)
2. Validates `.env` configuration
3. Installs server dependencies (`npm install` — includes `sharp` for image compression)
4. Installs client dependencies and builds the React frontend
5. Creates `uploads/` and `logs/` directories
6. Initializes the database (schema + all migrations)
7. Seeds a default admin account (`admin` / `admin` — change immediately)
8. Installs PM2 globally
9. Displays PM2 startup commands
10. Verifies all required environment variables

### Manual Setup

If you prefer to run each step manually:

```bash
# Install server deps
npm install

# Install client deps and build
cd client && npm install && npm run build && cd ..

# Create directories
mkdir -p uploads logs

# Run database schema
mysql -u USER -p DB_NAME < db/schema.sql

# Run all migrations (in order)
for f in db/migration-*.sql; do mysql -u USER -p DB_NAME < "$f"; done

# Install PM2
npm install -g pm2
```

---

## 4. Configuration (.env)

Create a `.env` file in the project root. Every variable is documented below.

### Database

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `DB_HOST` | Yes | `localhost` | MySQL host |
| `DB_PORT` | Yes | `3306` | MySQL port |
| `DB_USER` | Yes | `mdga_user` | MySQL username |
| `DB_PASSWORD` | Yes | `secret` | MySQL password |
| `DB_NAME` | Yes | `mdga_core` | Database name |

### Authentication

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `JWT_SECRET` | Yes | (64+ random chars) | Secret for signing JWT tokens. Generate with `openssl rand -base64 48` |

### Discord

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `DISCORD_CLIENT_ID` | Yes | `123456789` | Discord app Client ID (OAuth2) |
| `DISCORD_CLIENT_SECRET` | Yes | `abc123...` | Discord app Client Secret |
| `DISCORD_BOT_TOKEN` | Yes | `MTQ2...` | Discord bot token (Bot tab) |
| `DISCORD_GUILD_ID` | Yes | `123456789` | Your Discord server ID (right-click server → Copy ID) |
| `DISCORD_OFFICER_CHANNEL_ID` | Yes | `123456789` | Channel for officer alerts and approval embeds |
| `DISCORD_REDIRECT_URI` | Yes | `https://mdga.dev/api/auth/discord/callback` | OAuth callback URL. Must match Discord app settings. |
| `DISCORD_WEBHOOK_URL` | No | `https://discord.com/api/webhooks/...` | Webhook for application notifications |

### Blizzard API

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `BLIZZARD_CLIENT_ID` | Yes | `105c4e8...` | Battle.net app Client ID |
| `BLIZZARD_CLIENT_SECRET` | Yes | `1UUne1i...` | Battle.net app Client Secret |

### reCAPTCHA

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `RECAPTCHA_SITE_KEY` | No | `6Lcv...` | Google reCAPTCHA v2 site key (for application form) |
| `RECAPTCHA_SECRET_KEY` | No | `6Lcv...` | Google reCAPTCHA v2 secret key |

### Email (SMTP)

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | `you@gmail.com` | SMTP username |
| `SMTP_PASS` | No | `app-password` | SMTP password or app password |
| `SMTP_FROM` | No | `MDGA <noreply@mdga.dev>` | From address for emails |

### Game Configuration

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `ALLOWED_REALMS` | No | `Tichondrius,Area 52,Illidan,Zul'jin` | Comma-separated list of WoW realms users can add characters from. If empty, all realms are allowed. |

### Server

| Variable | Required | Example | Description |
|----------|:--------:|---------|-------------|
| `HOST` | No | `0.0.0.0` | Bind address (default `0.0.0.0`) |
| `PORT` | No | `3001` | Server port (default `3000`) |
| `CORS_ORIGIN` | Yes | `https://mdga.dev` | Allowed CORS origin. Set to your domain in production. |

### Example .env

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=mdga_user
DB_PASSWORD=your_db_password
DB_NAME=mdga_core

JWT_SECRET=gfN0HSArPCyD12xh0SmWzAtndFeE53uZk7JH05GlDy9FnBOYPp...

DISCORD_CLIENT_ID=123456789
DISCORD_CLIENT_SECRET=your_discord_secret
DISCORD_BOT_TOKEN=MTQ2...
DISCORD_GUILD_ID=123456789
DISCORD_OFFICER_CHANNEL_ID=123456789
DISCORD_REDIRECT_URI=https://mdga.dev/api/auth/discord/callback
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

BLIZZARD_CLIENT_ID=your_blizzard_id
BLIZZARD_CLIENT_SECRET=your_blizzard_secret

ALLOWED_REALMS=Tichondrius,Area 52,Illidan,Zul'jin

RECAPTCHA_SITE_KEY=6Lcv...
RECAPTCHA_SECRET_KEY=6Lcv...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=MDGA <noreply@mdga.dev>

HOST=0.0.0.0
PORT=3001
CORS_ORIGIN=https://mdga.dev
```

---

## 5. Running the Server

### Production (PM2)

PM2 is the recommended way to run in production. It auto-restarts on crash, manages logs, and survives server reboots.

```bash
# Start the application
pm2 start ecosystem.config.js

# Enable auto-start on server boot
pm2 startup systemd
# (Run the sudo command it prints)
pm2 save

# Useful PM2 commands
pm2 status              # View running processes
pm2 logs mdga           # Tail application logs
pm2 logs mdga --lines 100  # Last 100 lines
pm2 restart mdga        # Restart the app
pm2 stop mdga           # Stop the app
pm2 monit               # Real-time monitoring dashboard
```

PM2 configuration is in `ecosystem.config.js`:
- Auto-restart with exponential backoff (1s → 2s → 4s... up to 15s)
- 512MB memory limit (restarts if exceeded)
- Logs written to `logs/pm2-out.log` and `logs/pm2-error.log`

### Development

```bash
# Backend with auto-restart on file changes
npm run dev

# Frontend dev server with hot module replacement (separate terminal)
cd client && npm run dev
```

The Vite dev server runs on port 5173 and proxies `/api`, `/uploads`, and `/images` to the backend on port 3001.

### Rebuilding After Frontend Changes

```bash
cd client && npm run build
```

No server restart needed — Express serves files directly from `client/dist/`.

---

## 6. Apache Reverse Proxy

In production, Apache sits in front of Node.js. The `.htaccess` file handles routing:

```apache
# API and file requests → Node.js on port 3001
RewriteRule ^api/(.*)$ http://localhost:3001/api/$1 [P,L]
RewriteRule ^uploads/(.*)$ http://localhost:3001/uploads/$1 [P,L]
RewriteRule ^images/(.*)$ http://localhost:3001/images/$1 [P,L]

# Everything else → React SPA (index.html)
RewriteRule ^ /index.html [L]
```

Required Apache modules:
```bash
sudo a2enmod proxy proxy_http rewrite
sudo systemctl restart apache2
```

If using a VirtualHost config instead of `.htaccess`, include `ProxyPreserveHost On` and match the same rules.

---

## 7. Architecture

### Directory Structure

```
MDGA/
├── server/
│   ├── index.js              # Express entry point, middleware, static serving
│   ├── db.js                 # MySQL connection pool
│   ├── blizzard.js           # Blizzard API client (OAuth, character data)
│   ├── bot.js                # Discord bot (approval flow, alerts, nickname sync)
│   ├── ipban.js              # IP ban middleware
│   ├── middleware/
│   │   ├── auth.js           # JWT auth, role/permission middleware
│   │   └── upload.js         # Multer + magic byte validation + sharp compression
│   ├── routes/
│   │   ├── auth.js           # Login, logout, password, /me
│   │   ├── discord.js        # Discord OAuth2 flow + role sync
│   │   ├── discord-roles.js  # Discord-to-site role mapping
│   │   ├── config.js         # Public config (allowed realms)
│   │   ├── events.js         # Event CRUD + RSVP
│   │   ├── applications.js   # Guild applications
│   │   ├── forum.js          # Forum categories, posts, comments, votes
│   │   ├── users.js          # User management (admin)
│   │   ├── characters.js     # Character CRUD + Blizzard validation
│   │   ├── profile.js        # User profile endpoint
│   │   ├── leaderboard.js    # PvP/PvE leaderboard + stat refresh
│   │   ├── roles.js          # RBAC role management
│   │   ├── dashboard.js      # Dashboard data
│   │   ├── guild.js          # Guild roster + member management
│   │   ├── carousel.js       # Carousel images + site settings
│   │   ├── upload.js         # Image upload endpoint
│   │   ├── reports.js        # Admin reports + analytics
│   │   └── addon.js          # WoW addon sync endpoint
│   └── services/
│       ├── character-sync.js # Character stat refresh scheduler
│       ├── guild-sync.js     # Guild roster sync from Blizzard
│       └── email.js          # SMTP email sending
├── client/                   # React SPA (Vite)
│   ├── src/
│   │   ├── App.jsx           # Router definition
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Auth state, API fetch, permissions
│   │   ├── components/
│   │   │   ├── layout/       # Layout, Nav, Footer
│   │   │   └── common/       # ProtectedRoute, PageHero, LoadingSpinner
│   │   ├── pages/
│   │   │   ├── Home/         # Dashboard + hero
│   │   │   ├── Login/        # Discord OAuth login
│   │   │   ├── AdminLogin/   # Password login (admin fallback)
│   │   │   ├── Join/         # Application form
│   │   │   ├── Story/        # Guild lore timeline
│   │   │   ├── Leadership/   # Leadership roster
│   │   │   ├── Events/       # Calendar + RSVP
│   │   │   ├── Forum/        # Index, Category, Post, NewPost
│   │   │   ├── Leaderboards/ # PvP/PvE rankings
│   │   │   ├── Profile/      # User profile + characters
│   │   │   └── Admin/        # Admin panel (6+ tabs)
│   │   ├── hooks/            # useDocumentTitle
│   │   ├── utils/            # helpers, timezone
│   │   └── data/             # leaderboardData, wowData
│   └── vite.config.js        # Build config + dev proxy
├── db/                       # SQL schema + 40 migration files
├── uploads/                  # User-uploaded images (compressed WebP)
├── images/                   # Static site images
├── logs/                     # PM2 log files
├── ecosystem.config.js       # PM2 process config
├── setup.sh                  # Automated setup script
├── .htaccess                 # Apache proxy rules
├── docker-compose.yml        # MySQL container (optional)
└── .env                      # Environment variables (never commit)
```

### How Serving Works

The Express server serves the React SPA from `client/dist/` when the build exists. All `/api/*` routes are handled by Express. Non-API requests fall through to `index.html` for React Router to handle client-side routing.

In production, Apache proxies `/api/*`, `/uploads/*`, and `/images/*` to Node.js on port 3001, and serves everything else through the SPA fallback.

---

## 8. Authentication & Login

### Discord OAuth 2.0 (Primary)

This is the main login method for all users.

**Flow:**
1. User clicks **Login with Discord** on `/login`
2. Redirects to `/api/auth/discord?from=login`
3. Server generates a CSRF state token (10-min TTL) and redirects to Discord
4. User authorizes the app on Discord
5. Discord redirects back to `/api/auth/discord/callback`
6. Server validates state, exchanges code for Discord access token
7. Fetches Discord profile (`identify email` scopes)
8. Finds or creates user by `discord_id`
9. Checks guild membership via Discord bot:
   - **In guild** → status = `active`, syncs rank from `discord_role_mappings`
   - **Not in guild** → status = `pending_approval`, sends approval embed to officer channel
10. Creates a one-time login grant (2-min TTL)
11. Redirects to `/login/#code=<grant>` (hash fragment to prevent Referer leakage)
12. Frontend exchanges grant for JWT + user data via `POST /api/auth/discord/exchange`
13. Token and user stored in `sessionStorage`

### Username/Password Login (Admin Fallback)

Available at `/admin-login` for emergencies when Discord is down. Uses `POST /api/auth/login`.

Protected by:
- 5 failed attempts per IP → 15-minute lockout
- 60 failed attempts in 24h → 24-hour site-wide IP ban
- Discord alerts sent to officer channel on lockouts and bans

### JWT Token

```javascript
{
  id: 42,
  username: "Thrall",
  rank: "officer",      // recruit | member | veteran | officer | guildmaster
  permissions: ["forum.create_posts", "admin.view_panel", ...]
}
// Expires in 24 hours
```

### Changing Passwords

Logged-in users can set or change their password via `PUT /api/auth/password`. Requires the current password (if one exists) and a new password of 8+ characters. Passwords are hashed with bcrypt (12 rounds).

---

## 9. Discord Integration

### Bot Features

The Discord bot (`server/bot.js`) provides:

| Feature | Description |
|---------|-------------|
| **Approval flow** | Sends embed with Approve/Reject buttons to officer channel for non-guild members |
| **Nickname sync** | Sets Discord nickname to match main WoW character name |
| **Kick/leave detection** | Suspends user account when member leaves Discord guild |
| **Officer alerts** | Sends alerts for login lockouts, IP bans, rank changes, and security events |
| **Role fetching** | Provides live Discord roles list for the role mapping UI |
| **Invite links** | Creates one-time Discord invite links (24h, 1 use) for approved members |

### Discord Role Sync

On each login, the server:

1. Fetches the user's Discord roles from the guild
2. Looks up `discord_role_mappings` for matches
3. Determines highest-priority rank: recruit → member → veteran → officer → guildmaster
4. Updates the user's `rank` column
5. Syncs RBAC roles (adds matched roles, removes unmatched synced roles, leaves manual roles)

### Setting Up the Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. **OAuth2** tab: Add redirect URI matching your `DISCORD_REDIRECT_URI`
4. **Bot** tab: Create a bot, copy the token for `DISCORD_BOT_TOKEN`
5. **Bot** tab: Enable "Server Members Intent" and "Message Content Intent"
6. Invite the bot to your server with `bot` + `applications.commands` scopes and these permissions:
   - Manage Nicknames
   - Create Instant Invite
   - Send Messages
   - Embed Links
   - Read Message History

---

## 10. Roles & Permissions (RBAC)

### Guild Ranks

Legacy rank system, synced from Discord. Determines display badges and basic access levels.

| Rank | Level | Description |
|------|:-----:|-------------|
| `recruit` | 0 | New member, pending promotion |
| `member` | 1 | Regular guild member |
| `veteran` | 2 | Experienced member |
| `officer` | 3 | Guild leadership |
| `guildmaster` | 4 | Full access to everything |

### RBAC Roles

Fine-grained permission system layered on top of ranks. Users can have multiple roles. Permissions are additive. Guildmaster bypasses all permission checks.

| Permission | Category | Description |
|-----------|----------|-------------|
| `forum.create_posts` | Forum | Create forum posts |
| `forum.create_comments` | Forum | Reply to posts |
| `forum.vote` | Forum | Vote on posts/comments |
| `forum.pin_posts` | Forum | Pin/unpin posts |
| `forum.lock_posts` | Forum | Lock/unlock posts |
| `forum.delete_any_post` | Forum | Delete any post |
| `forum.delete_any_comment` | Forum | Delete any comment |
| `forum.access_officer_categories` | Forum | Access officer-only categories |
| `forum.manage_categories` | Forum | Create/edit categories |
| `events.manage` | Events | Create/edit/delete events |
| `admin.view_panel` | Admin | View admin panel |
| `admin.manage_applications` | Admin | Review guild applications |
| `admin.manage_users` | Admin | Change ranks, ban/delete users |
| `admin.manage_roles` | Admin | Create/edit/delete roles |
| `leaderboard.bulk_refresh` | Leaderboard | Refresh all character stats |
| `guild.manage` | Guild | Manage guild sync and roster |
| `guild.view_roster` | Guild | View full guild roster |

### Default Roles

| Role | Default | Key Permissions |
|------|:-------:|----------------|
| Member | Yes (auto-assigned) | Create posts, comments, vote, view roster |
| Moderator | No | Pin, lock, delete any post/comment, officer categories |
| Event Manager | No | Create/manage events |
| Officer | No | All moderator + admin panel, manage apps/users, bulk refresh |
| Guild Master | No | All permissions |

### Auth Middleware

```javascript
requireAuth                    // JWT required
requireOfficer                 // Rank officer/GM OR admin.view_panel permission
requireGuildMaster             // Rank guildmaster only
requirePermission('perm.key')  // Check specific permission
```

---

## 11. Characters & Blizzard API

### Adding a Character

1. Navigate to your **Profile** page
2. Click **Add Character**
3. Select a realm from the dropdown (configured via `ALLOWED_REALMS` in `.env`)
4. Enter the character name and click **Search**
5. The server validates the character against Blizzard's Armory:
   - Must exist on a supported realm
   - Must be a current member of **Make Durotar Great Again**
6. If validated, review the character details and click **Save Character**
7. Optionally check "Set as main character" to make it your primary

### Validation Rules

All character additions are validated server-side against the Blizzard Armory:

| Check | Error Message |
|-------|---------------|
| Unsupported realm | "This realm is not supported. Characters must be on one of the following realms: ..." |
| Character not found | "Character not found on World of Warcraft Armory" |
| Wrong guild | "This character is in \<Other Guild\>, not \<Make Durotar Great Again\>. Only members of our guild can be added." |
| No guild | "This character is not in a guild. Only members of \<Make Durotar Great Again\> can be added." |
| Already on your profile | "This character is already on your profile." |
| Claimed by another user | "This character is already claimed by {discord_username}. If this is your character, please open a support ticket in our Discord server to have it reassigned." |

**Security Note**: Guild membership is validated on every character addition (both lookup and save endpoints). Duplicate character claims are prevented with a unique constraint on `(user_id, character_name, realm_slug)`.

### Realm Configuration

Allowed realms are set in `.env`:

```env
ALLOWED_REALMS=Tichondrius,Area 52,Illidan,Zul'jin
```

To add more realms, append them to the comma-separated list and restart the server. The frontend automatically fetches the allowed list from `GET /api/config/realms`.

### Blizzard API Data

The server fetches character data from the Blizzard Game Data API using Client Credentials OAuth.

**Per-character data fetched:**

| Category | Fields |
|----------|--------|
| Profile | Name, level, race, class, spec, item level, achievement points, last login |
| Media | Character render image URL |
| PvP Summary | Solo Shuffle, 2v2, 3v3, RBG ratings |
| PvP Brackets | Individual bracket ratings and W/L records |
| Statistics | Honorable kills, killing blows, arenas played/won, BGs played/won, deaths |
| PvE | Dungeons entered, raids entered, quests completed, creatures killed |
| Mythic+ | M+ rating, highest key level completed |
| Raid Progression | Latest raid mythic boss kills |
| Talents | Active spec, loadout name, talent selections |

### Auto-Refresh

Character stats refresh automatically:
- Every 2 hours after server boot
- Staggered 5 minutes between characters to avoid API throttling
- Users can manually refresh via the **Refresh Stats** button on their profile
- Officers can trigger a guild-wide refresh from the admin panel

---

## 12. Guild System

### Guild Sync

The server periodically syncs the full guild roster from Blizzard:

- Fetches all guild members (name, realm, level, class, race, rank)
- Cross-links guild members to site users by matching character name + realm
- Stores data in the `guild_members` table
- Syncs guild achievements to `guild_achievements`

### Guild Roster (Admin)

Officers can view the full guild roster at **Admin > Guild**:
- Search by character name
- Filter by class, rank, level
- View linked site accounts
- Ban/unban guild members

### Guild Activity Feed

Tracks real-time guild events:
- Rank changes
- Member joins/leaves
- Online/offline status (via addon)

---

## 13. Leaderboards

The `/leaderboards` page displays guild-wide rankings across multiple brackets.

### PvP Brackets
- Solo Shuffle, Arena 3v3, Arena 2v2, RBG Rating
- Honorable Kills, Killing Blows
- Arenas Played/Won, Battlegrounds Played/Won

### PvE Brackets
- Mythic+ Rating, Item Level
- Highest M+ Key, Mythic Bosses Killed
- Dungeons Entered, Raids Entered, Creatures Killed

### General Brackets
- Total Deaths, Quests Completed, Achievement Points

### Expandable Details

Click any row in the leaderboard to expand and view the character's full stat card with PvP, PvE, and General statistics in a 3-column grid layout.

### Refreshing Stats

- Members can refresh their own stats (15-minute cooldown)
- Officers with `leaderboard.bulk_refresh` permission can trigger a guild-wide refresh

---

## 14. Forum

### Structure

- **Categories** — Officer-created, with optional officer-only access
- **Posts** — Support text content and one image attachment
- **Comments** — Replies to posts, also support images
- **Votes** — Upvote/downvote on both posts and comments

### Features

| Feature | Description |
|---------|-------------|
| **Sorting** | Hot (Reddit-style), New, Top |
| **Pagination** | Configurable page size (10/15/20/50) |
| **Search** | Full-text search across posts, comments, and usernames (300ms debounce) |
| **View tracking** | Unique views per user per post |
| **Pinned posts** | Stick important posts to the top |
| **Locked posts** | Prevent new comments |
| **Officer categories** | Restrict access to officers+ |
| **Reporting** | Members can report posts/comments for review |
| **Image attachments** | One image per post or comment (auto-compressed to WebP) |

### Creating a Post

1. Navigate to `/forum`
2. Click a category
3. Click **New Post**
4. Enter a title (max 200 chars), content, and optional image
5. Submit

### Moderation

Officers/moderators can:
- **Pin** posts to keep them at the top of a category
- **Lock** posts to prevent further comments
- **Delete** any post or comment
- **Review reports** in the admin panel

---

## 15. Events

### Viewing Events

The `/events` page is public — anyone can see upcoming guild events.

### Creating Events

Users with `events.manage` permission can create events:

| Field | Description |
|-------|-------------|
| Title | Event name (max 150 chars) |
| Description | Full event details |
| Category | PvP, Defense, Social, or Raid |
| Start/End Time | Date and time with timezone support |
| Recurring | Optional: weekly, biweekly, or custom interval (2-52 instances) |

### RSVP

Logged-in members can RSVP with three statuses:
- **Going** — Confirmed attendance
- **Maybe** — Tentative
- **Not Going** — Declined

RSVP counts are displayed on event cards. Officers can view the full attendee list.

### Managing Events

- Edit or delete individual events
- Delete an entire recurring series (future events only)

---

## 16. Applications (Recruitment)

### How It Works

1. Prospective member visits `/join`
2. Fills out the application form:
   - Character name, server, class/spec
   - Discord tag
   - WoW experience
   - Why they want to join
   - reCAPTCHA verification
3. Application is submitted (no login required)
4. Notification sent to Discord webhook
5. Officers review in **Admin > Applications**
6. Officer approves or denies:
   - **Approve**: User account activated, approval email sent with Discord invite link
   - **Deny**: Application marked as denied

### Discord Approval Flow

If a user logs in with Discord but isn't in the guild:
1. Account created with `pending_approval` status
2. Embed with Approve/Reject buttons sent to officer channel
3. Officer clicks button → account activated or rejected

---

## 17. Profile System

### User Profile (`/profile`)

Every member has a profile page showing:

| Section | Content |
|---------|---------|
| Hero | Avatar, display name, rank badge, Discord username, join date, timezone |
| Forum Stats | Total posts, views, and comments |
| Characters | Card grid of all WoW characters |

### Character Cards

Each character card shows:
- **Front**: Character render, name, realm, guild, class/spec, level, item level, quick PvP pills (Shuffle, 3v3, 2v2, RBG, HKs), Armory link
- **Back** (click to flip): Full stat card — all PvP ratings, arena/BG records with win rates, PvE stats, achievement points, last synced time

### Profile Actions (Own Profile)

- **Add Character** — Search and validate from Blizzard
- **Set Main** — Designate primary character (syncs to Discord nickname)
- **Delete Character** — Remove a character from your profile
- **Refresh Stats** — Re-fetch all character stats from Blizzard
- **Change Timezone** — Click your timezone to change it

---

## 18. Admin Panel

Accessible at `/admin` for officers and users with `admin.view_panel` permission.

### Tab: Members

- View all registered users with rank badges
- Search by username or display name
- **Change Rank** — Promote/demote (hierarchy enforced — can't promote above your own rank)
- **Ban** — Ban with reason (sends Discord alert)
- **Delete** — Remove user account
- **Resend Invite** — Re-send approval email with Discord invite

### Tab: Applications

- View pending, approved, and denied applications
- **Approve** — Activates user, sends approval email with Discord invite
- **Deny** — Marks application as denied

### Tab: Forum Management

- **Create Category** — Add new forum categories (name, description, officer-only toggle, sort order)
- **Reports** — Review reported posts/comments (open, reviewing, resolved, dismissed)

### Tab: Events

- Create, edit, and delete events
- Manage recurring event series

### Tab: Carousel

- **Upload Images** — Add screenshots/photos to the homepage carousel
- **Manage Order** — Drag to reorder, edit alt text
- **Home Background** — Upload or set URL for the hero background image

### Tab: Reports

- **Member Activity Report** — Search and filter users by rank, status, date range, activity period. Export results.
- **Guild Gaps Report** — Compare Discord members vs. site accounts. Identify: needs Discord link, no site account, Discord not active, etc.
- **Saved Presets** — Save and load report filter configurations

### Tab: Roles (Guild Master Only)

- Create/edit/delete custom RBAC roles
- Toggle permissions per role
- Assign roles to specific users

### Tab: Discord Roles (Guild Master Only)

- View all Discord server roles (live from bot)
- Map Discord roles → site ranks (recruit/member/veteran/officer/guildmaster)
- Map Discord roles → RBAC roles

---

## 19. Home Page & Carousel

### Visitor View

Non-logged-in visitors see:
- Hero section with CTAs to join or read the guild story
- Stats bar, guild photo, about section
- Gallery carousel
- Leadership preview
- PvP achievements highlight

### Member Dashboard

Logged-in members see a personalized dashboard:
- Welcome message with rank badge
- Quick stats (forum posts, replies, character count, top PvP rating)
- Recent forum activity (last 10 posts)
- Upcoming events with RSVP counts
- Latest Updates feed with post previews

### Carousel Management

Officers manage the carousel from **Admin > Carousel**:
- Upload images (up to 15MB raw — auto-compressed to WebP)
- Or provide an external URL
- Set alt text for accessibility
- Control sort order
- Auto-advances every 5 seconds with prev/next navigation

---

## 20. Image Uploads

### How It Works

All image uploads go through the same pipeline:

1. **Multer** accepts the file (up to 15MB raw)
2. **MIME type check** — Only JPEG, PNG, GIF, and WebP allowed
3. **Magic byte detection** — Validates actual file content matches declared type
4. **sharp compression** — Resizes to max 1920px wide and converts to WebP at 80% quality
5. **Saved** with a timestamp + random hex filename to `uploads/`

GIF files are stored as-is (to preserve animations).

### Where Uploads Are Used

- Forum posts and comments (image attachments)
- Carousel images (homepage gallery)
- Home background image

### Storage

Uploaded files are saved to the `uploads/` directory and served via `/uploads/` URL path. Files are served with:
- `X-Content-Type-Options: nosniff`
- `Cache-Control: public, max-age=86400` (24-hour browser cache)

---

## 21. WoW Addon Integration

The project includes a companion WoW addon that sends real-time guild data to the website.

### What the Addon Tracks

| Event Type | Description |
|-----------|-------------|
| `rank_change` | Guild member promoted/demoted |
| `join` | New member joined the guild |
| `leave` | Member left or was kicked |
| `online` | Member logged in |
| `offline` | Member logged off |

### Sync Endpoint

`POST /api/addon/sync` — Officer-only (guild rank 0-2), rate-limited to 10 requests per 15 minutes.

### Validation

- Schema version 3 required
- Guild name must match (case-insensitive)
- Data must be fresh (30min for capture, 2h for events)
- Character ownership verified
- Max 100 events and 1000 roster entries per sync

---

## 22. Reports & Analytics

### Member Activity Report

Available at **Admin > Reports**. Provides insights into member engagement:

- Search by username/display name
- Filter by rank, account status, date range
- Activity period filter (7 days, 30 days, 90 days, all time)
- Sort by any column
- Export all results
- Save/load filter presets

### Guild Gaps Report

Cross-references Discord members with site accounts:

| State | Meaning |
|-------|---------|
| Needs Discord | Site account has no Discord link |
| No Site Account | Discord member hasn't registered on site |
| No Discord Link | Registered but Discord not linked |
| Discord Not Active | Linked but no longer in Discord server |
| Linked Active | Everything is connected |

### Forum Reports

Review reported posts and comments:
- Status: Open → Reviewing → Resolved / Dismissed
- View reporter, reason, and reported content

---

## 23. Security

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| All API routes | 200 requests | 15 minutes |
| Login attempts | 5 failures per IP | 15 minutes |
| IP ban threshold | 60 failures | 24 hours |
| Addon sync | 10 requests | 15 minutes |

### IP Banning

After 60 failed login attempts from a single IP within 24 hours, the IP is banned site-wide for 24 hours. Bans are stored in memory (reset on server restart). Discord alerts are sent to the officer channel.

### Security Headers (Helmet.js)

- Content Security Policy (restricts scripts, styles, fonts, images, connections)
- `X-Content-Type-Options: nosniff`
- Cross-Origin policies

### Image Upload Security

1. MIME type whitelist (JPEG, PNG, GIF, WebP only)
2. Magic byte detection (validates actual binary content)
3. MIME vs. content type cross-check (prevents extension spoofing)
4. Randomized filenames (timestamp + crypto random hex)
5. Server-side compression (prevents oversized file storage)

### CSRF Protection

Discord OAuth uses random state tokens with 10-minute TTL, stored server-side and validated on callback.

### Database Security

- Parameterized queries throughout (no string concatenation in SQL)
- LIKE wildcards escaped (`%`, `_`, `\`)
- Foreign keys with CASCADE/SET NULL

---

## 24. Database

### Schema

All migrations are in `db/` (schema.sql + migration-001 through migration-040). Run automatically by `setup.sh`.

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (Discord/password auth, rank, status, avatar) |
| `user_characters` | Characters linked to users (Blizzard Armory data) |
| `pvp_stats` | Per-character PvP/PvE statistics |
| `guilds` | Guild data from Blizzard API |
| `guild_members` | Full guild roster (synced from Blizzard) |
| `guild_member_stats` | Guild-wide leaderboard stats |
| `guild_achievements` | Guild achievement data |
| `guild_activity` | Join/leave/rank change activity feed |
| `events` | Calendar events (supports recurring) |
| `event_rsvps` | RSVP attendance tracking |
| `forum_categories` | Forum structure (officer-only flag, sort order) |
| `forum_posts` | Posts (pinned, locked, view count, image) |
| `forum_comments` | Post replies |
| `forum_votes` | Post votes (+1/-1) |
| `forum_comment_votes` | Comment votes (+1/-1) |
| `forum_post_views` | Unique view tracking per user |
| `forum_reports` | Reported content (status workflow) |
| `applications` | Guild applications (pending/approved/denied) |
| `roles` | RBAC role definitions |
| `permissions` | RBAC permission definitions |
| `role_permissions` | Role ↔ Permission mapping |
| `user_roles` | User ↔ Role assignment |
| `discord_role_mappings` | Discord role → site rank/RBAC mapping |
| `login_attempts` | Failed login tracking per IP |
| `carousel_images` | Homepage carousel images |
| `site_settings` | Key/value configuration (home background, etc.) |
| `addon_events` | Real-time guild events from WoW addon |
| `game_rank_mappings` | In-game guild rank → site rank mapping |
| `user_report_presets` | Saved admin report filter configurations |

### Running Migrations Manually

```bash
# Single migration
mysql -u USER -p DB_NAME < db/migration-040-fix-charset-utf8mb4.sql

# All migrations (skips already-applied)
for f in db/migration-*.sql; do mysql -u USER -p DB_NAME < "$f" 2>/dev/null; done
```

---

## 25. API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/auth/discord?from=login\|join` | — | Start Discord OAuth |
| GET | `/api/auth/discord/callback` | — | Discord OAuth callback |
| POST | `/api/auth/discord/exchange` | — | Exchange grant code for JWT |
| POST | `/api/auth/login` | — | Username/password login |
| PUT | `/api/auth/password` | JWT | Change password |
| POST | `/api/auth/logout` | JWT | Logout |
| GET | `/api/auth/me` | JWT | Current user + permissions |
| POST | `/api/auth/test-email` | Officer | Test SMTP configuration |

### Config

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/config/realms` | — | Get allowed WoW realms list |

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/dashboard` | JWT | Personalized home dashboard |

### Characters

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/api/characters/lookup` | JWT | Search character on Blizzard Armory |
| GET | `/api/characters/:userId` | JWT | Get user's characters |
| POST | `/api/characters` | JWT | Add validated character |
| PUT | `/api/characters/:id` | JWT | Update character |
| PUT | `/api/characters/:id/main` | JWT | Set as main character |
| DELETE | `/api/characters/:id` | JWT | Delete character |

### Profile

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/profile/:id` | JWT | Full profile (user, characters, stats, activity) |
| PUT | `/api/profile/timezone` | JWT | Update timezone |

### Leaderboard

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/leaderboard?bracket=solo_shuffle&page=1` | JWT | Rankings for a bracket |
| POST | `/api/leaderboard/refresh` | JWT | Refresh own character stats |
| POST | `/api/leaderboard/refresh-all` | leaderboard.bulk_refresh | Guild-wide stat refresh |

### Forum

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/forum/categories` | — | List categories |
| POST | `/api/forum/categories` | forum.manage_categories | Create category |
| GET | `/api/forum/categories/:id/posts` | — | Posts in category (sort: hot/new/top) |
| GET | `/api/forum/search?q=term` | — | Full-text search |
| POST | `/api/forum/posts` | JWT | Create post |
| GET | `/api/forum/posts/:id` | — | Get post + comments + votes |
| POST | `/api/forum/posts/:id/comments` | JWT | Add comment |
| POST | `/api/forum/posts/:id/vote` | JWT | Vote (+1/-1/0) |
| POST | `/api/forum/comments/:id/vote` | JWT | Vote on comment |
| POST | `/api/forum/posts/:id/report` | JWT | Report post |
| POST | `/api/forum/comments/:id/report` | JWT | Report comment |
| DELETE | `/api/forum/posts/:id` | JWT | Delete post |
| DELETE | `/api/forum/comments/:id` | JWT | Delete comment |
| PUT | `/api/forum/posts/:id/pin` | forum.pin_posts | Toggle pin |
| PUT | `/api/forum/posts/:id/lock` | forum.lock_posts | Toggle lock |

### Events

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/events` | — | List upcoming events |
| POST | `/api/events` | events.manage | Create event |
| PUT | `/api/events/:id` | events.manage | Update event |
| DELETE | `/api/events/:id` | events.manage | Delete event |
| DELETE | `/api/events/series/:seriesId` | events.manage | Delete future events in series |
| POST | `/api/events/:id/rsvp` | JWT | RSVP to event |
| GET | `/api/events/:id/rsvps` | JWT | Get RSVP list |

### Applications

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/api/applications` | — | Submit application |
| GET | `/api/applications?status=pending` | admin.manage_applications | List applications |
| PUT | `/api/applications/:id` | admin.manage_applications | Approve or deny |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/users` | admin.manage_users | List all users |
| GET | `/api/users/banned` | admin.manage_users | List banned users |
| PUT | `/api/users/:id/rank` | admin.manage_users | Change rank |
| PUT | `/api/users/:id/ban` | admin.manage_users | Ban user |
| PUT | `/api/users/:id/unban-request` | admin.manage_users | Request unban |
| DELETE | `/api/users/:id` | admin.manage_users | Delete user |
| POST | `/api/users/:id/resend-invite` | admin.manage_users | Resend invite email |

### Guild

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/guild/summary` | JWT | Guild info + activity + achievements |
| GET | `/api/guild/roster` | guild.view_roster | Full roster with filters |

### Roles & Permissions

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/roles` | admin.manage_roles | List roles |
| GET | `/api/roles/permissions` | admin.manage_roles | List all permissions |
| POST | `/api/roles` | admin.manage_roles | Create role |
| PUT | `/api/roles/:id` | admin.manage_roles | Update role |
| DELETE | `/api/roles/:id` | admin.manage_roles | Delete role |
| GET | `/api/roles/users/:userId` | GM | Get user's roles |
| PUT | `/api/roles/users/:userId` | GM | Set user's roles |

### Discord Roles

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/discord-roles/guild-roles` | GM | Live Discord roles |
| GET | `/api/discord-roles/mappings` | GM | Saved role mappings |
| PUT | `/api/discord-roles/mappings` | GM | Update all mappings |

### Upload & Carousel

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/api/upload` | JWT | Upload image (max 15MB, auto-compressed to WebP) |
| GET | `/api/carousel` | — | Carousel images + background |
| POST | `/api/carousel` | Officer | Add carousel image |
| PUT | `/api/carousel/:id` | Officer | Update carousel image |
| DELETE | `/api/carousel/:id` | Officer | Delete carousel image |
| GET | `/api/carousel/settings` | Officer | Get background image |
| PUT | `/api/carousel/settings/background` | Officer | Set background image |

### Reports

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| GET | `/api/reports/users` | admin.view_panel | Member activity report |
| GET | `/api/reports/guild-gaps` | admin.view_panel | Guild vs Discord gaps |
| GET | `/api/reports?status=open` | admin.view_panel | Forum violation reports |
| PUT | `/api/reports/:id` | admin.view_panel | Update report status |
| GET | `/api/reports/users/presets` | admin.view_panel | Saved report presets |
| POST | `/api/reports/users/presets` | admin.view_panel | Save report preset |
| DELETE | `/api/reports/users/presets/:id` | admin.view_panel | Delete preset |

### Addon

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| POST | `/api/addon/sync` | JWT + Officer | Sync WoW addon data |

---

## 26. Troubleshooting

### Common Issues

**"COLLATION is not valid for CHARACTER SET 'binary'"**

Run the charset migration:
```bash
mysql -u USER -p DB_NAME < db/migration-040-fix-charset-utf8mb4.sql
```

**Unicode characters not displaying (guild roster, leaderboards)**

Same fix — migration-040 converts all tables to `utf8mb4`.

**sharp fails to install on Linux**

sharp requires native dependencies. On Ubuntu/Debian:
```bash
sudo apt-get install -y build-essential libvips-dev
npm install sharp
```

**PM2 not starting on boot**

```bash
pm2 startup systemd
# Run the sudo command it prints
pm2 save
```

**Frontend changes not showing**

Rebuild the React app:
```bash
cd client && npm run build
```

**5xx errors on character lookup**

Check that `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` are set correctly in `.env`. The Blizzard token may have expired — restart the server to refresh it.

**Discord login redirect loop**

Verify `DISCORD_REDIRECT_URI` in `.env` matches exactly what's configured in the Discord Developer Portal (including protocol, domain, and path).

**Images not loading after upload**

Make sure `uploads/` directory exists and has write permissions:
```bash
mkdir -p uploads
chmod 755 uploads
```

**Database connection refused**

Check MySQL is running and credentials in `.env` are correct:
```bash
mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "SELECT 1"
```
