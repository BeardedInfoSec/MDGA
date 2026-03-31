#!/usr/bin/env bash
# ================================================
# MDGA Setup Script
# Installs dependencies, builds the React frontend,
# initializes the database with schema + migrations,
# and verifies configuration.
# Usage: bash setup.sh
# ================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$ROOT/client"
ENV_PATH="$ROOT/.env"
UPLOADS_DIR="$ROOT/uploads"
DB_DIR="$ROOT/db"

STEPS=11
STEP=0

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

step_header() {
  STEP=$((STEP + 1))
  echo -e "\n${CYAN}[${STEP}/${STEPS}]${NC} ${BOLD}$1${NC}"
}

ok()   { echo -e "  ${GREEN}+${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}x${NC} $1"; }

echo ""
echo -e "${RED}╔══════════════════════════════════════╗${NC}"
echo -e "${RED}║${NC}  ${BOLD}MDGA${NC} — Make Durotar Great Again   ${RED}║${NC}"
echo -e "${RED}║${NC}  Server Setup Script               ${RED}║${NC}"
echo -e "${RED}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check prerequisites ───────────────────────
step_header "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js $NODE_VER is too old. Please install Node.js 18+."
  exit 1
fi
ok "Node.js $NODE_VER"

# npm
if ! command -v npm &>/dev/null; then
  fail "npm not found."
  exit 1
fi
ok "npm $(npm -v)"

# MySQL client
if command -v mysql &>/dev/null; then
  ok "MySQL client found"
  HAS_MYSQL=true
else
  warn "MySQL client not found — skipping database setup"
  warn "Install MySQL client or run migrations manually"
  HAS_MYSQL=false
fi

# ── 2. Check .env ────────────────────────────────
step_header "Checking .env configuration..."

if [ ! -f "$ENV_PATH" ]; then
  warn ".env not found — creating from template..."
  cat > "$ENV_PATH" << 'ENVTEMPLATE'
# ================================================
# MDGA — Environment Configuration
# Fill in your credentials below
# NEVER commit this file to version control
# ================================================

DB_HOST=localhost
DB_PORT=3306
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=YOUR_DB_NAME

# JWT secret (generate a random 64+ char string)
JWT_SECRET=CHANGE_ME_GENERATE_A_RANDOM_64_CHAR_STRING

# Discord OAuth2 + Bot
DISCORD_CLIENT_ID=YOUR_DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_DISCORD_GUILD_ID
DISCORD_OFFICER_CHANNEL_ID=YOUR_OFFICER_CHANNEL_ID
DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/discord/callback

# Discord webhook for application notifications (optional)
DISCORD_WEBHOOK_URL=YOUR_WEBHOOK_URL_HERE

# Google reCAPTCHA v2
RECAPTCHA_SITE_KEY=YOUR_RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY=YOUR_RECAPTCHA_SECRET_KEY

# Blizzard API (https://develop.battle.net)
BLIZZARD_CLIENT_ID=YOUR_BLIZZARD_CLIENT_ID
BLIZZARD_CLIENT_SECRET=YOUR_BLIZZARD_CLIENT_SECRET

# Allowed WoW Realms (comma-separated display names, empty = all US realms)
ALLOWED_REALMS=

# Email (SMTP) — for sending approval/invite emails
# Gmail: host=smtp.gmail.com, port=587, user=you@gmail.com, pass=app-password
# SendGrid: host=smtp.sendgrid.net, port=587, user=apikey, pass=SG.xxxxx
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM='MDGA <noreply@mdga.dev>'

# Server
HOST=0.0.0.0
PORT=3001
CORS_ORIGIN=http://localhost:3001
ENVTEMPLATE
  warn "Created .env — edit it with your credentials before starting the server"
else
  ok ".env exists"
fi

# Read .env safely (source breaks on special chars like < > in values)
# Only extract the specific vars we need for setup
read_env() {
  local key="$1"
  sed 's/\r$//' "$ENV_PATH" | grep -E "^${key}=" | head -1 | sed "s/^${key}=//" | sed "s/^['\"]//;s/['\"]$//"
}
DB_HOST=$(read_env DB_HOST)
DB_PORT=$(read_env DB_PORT)
DB_USER=$(read_env DB_USER)
DB_PASSWORD=$(read_env DB_PASSWORD)
DB_NAME=$(read_env DB_NAME)
JWT_SECRET=$(read_env JWT_SECRET)
DISCORD_CLIENT_ID=$(read_env DISCORD_CLIENT_ID)
DISCORD_CLIENT_SECRET=$(read_env DISCORD_CLIENT_SECRET)
DISCORD_BOT_TOKEN=$(read_env DISCORD_BOT_TOKEN)
DISCORD_GUILD_ID=$(read_env DISCORD_GUILD_ID)
DISCORD_OFFICER_CHANNEL_ID=$(read_env DISCORD_OFFICER_CHANNEL_ID)
DISCORD_REDIRECT_URI=$(read_env DISCORD_REDIRECT_URI)
BLIZZARD_CLIENT_ID=$(read_env BLIZZARD_CLIENT_ID)
BLIZZARD_CLIENT_SECRET=$(read_env BLIZZARD_CLIENT_SECRET)
CORS_ORIGIN=$(read_env CORS_ORIGIN)

# ── 3. Install server packages ──────────────────
step_header "Installing server dependencies..."
(cd "$ROOT" && npm install --loglevel=warn)
ok "Server packages installed"

# ── 4. Install client packages + build ──────────
step_header "Installing client dependencies and building React app..."

if [ ! -f "$CLIENT_DIR/package.json" ]; then
  fail "client/package.json not found"
  exit 1
fi

(cd "$CLIENT_DIR" && npm install --loglevel=warn)
ok "Client packages installed"

echo "  Building React frontend (this may take a minute)..."
(
  cd "$CLIENT_DIR"
  # Some hosts install node_modules/.bin scripts without executable bits.
  # Try normal npm build first, then fall back to direct Node execution.
  chmod +x ./node_modules/.bin/vite 2>/dev/null || true
  if npm run build --silent; then
    :
  elif [ -f "./node_modules/vite/bin/vite.js" ]; then
    warn "npm build failed; retrying with direct Node/Vite entrypoint"
    node ./node_modules/vite/bin/vite.js build
  else
    fail "Vite build failed and fallback entrypoint was not found"
    exit 1
  fi
)
ok "React build complete → client/dist/"

# ── 5. Create directories ─────────────────────────
step_header "Creating directories..."

if [ ! -d "$UPLOADS_DIR" ]; then
  mkdir -p "$UPLOADS_DIR"
  ok "Created uploads/"
else
  ok "uploads/ exists"
fi

LOGS_DIR="$ROOT/logs"
if [ ! -d "$LOGS_DIR" ]; then
  mkdir -p "$LOGS_DIR"
  ok "Created logs/"
else
  ok "logs/ exists"
fi

# ── 6. Initialize database ──────────────────────
step_header "Initializing database..."

if [ "$HAS_MYSQL" = false ]; then
  warn "Skipping — no MySQL client"
else
  if [ -z "$DB_NAME" ] || [[ "$DB_NAME" == *"YOUR_"* ]]; then
    warn "DB_NAME not configured in .env — skipping database setup"
  else
    MYSQL_ARGS="-h${DB_HOST:-localhost} -P${DB_PORT:-3306} -u${DB_USER}"
    if [ -n "$DB_PASSWORD" ]; then
      MYSQL_ARGS="$MYSQL_ARGS -p${DB_PASSWORD}"
    fi

    # Test connection
    if mysql $MYSQL_ARGS -e "SELECT 1" &>/dev/null; then
      ok "MySQL connection successful"

      # Create database
      mysql $MYSQL_ARGS -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
      ok "Database \`${DB_NAME}\` ready"

      # Run schema.sql
      SCHEMA_PATH="$DB_DIR/schema.sql"
      if [ -f "$SCHEMA_PATH" ]; then
        mysql $MYSQL_ARGS "$DB_NAME" < "$SCHEMA_PATH" 2>/dev/null && \
          ok "schema.sql applied" || \
          ok "schema.sql (tables already exist)"
      fi

      # Run migrations in order
      MIGRATION_COUNT=0
      MIGRATION_SKIP=0
      for migration in $(ls "$DB_DIR"/migration-*.sql 2>/dev/null | sort); do
        filename=$(basename "$migration")
        if mysql $MYSQL_ARGS "$DB_NAME" < "$migration" 2>/dev/null; then
          MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
        else
          MIGRATION_SKIP=$((MIGRATION_SKIP + 1))
        fi
      done

      if [ $MIGRATION_COUNT -gt 0 ]; then
        ok "$MIGRATION_COUNT migrations applied"
      fi
      if [ $MIGRATION_SKIP -gt 0 ]; then
        ok "$MIGRATION_SKIP migrations skipped (already applied)"
      fi
      if [ $MIGRATION_COUNT -eq 0 ] && [ $MIGRATION_SKIP -eq 0 ]; then
        warn "No migration files found in db/"
      fi
    else
      fail "Cannot connect to MySQL — check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in .env"
      warn "Start MySQL first: docker compose up -d"
      warn "Or skip and run migrations manually later"
    fi
  fi
fi

# ── 7. Seed admin account ─────────────────────────
step_header "Seeding admin account..."

if [ "$HAS_MYSQL" = false ] || [ -z "$DB_NAME" ] || [[ "$DB_NAME" == *"YOUR_"* ]]; then
  warn "Skipping — database not configured"
else
  # Generate bcrypt hash for "admin" using Node.js
  ADMIN_HASH=$(node -e "const b=require('bcrypt');b.hash('admin',12).then(h=>process.stdout.write(h))" 2>/dev/null)
  if [ -n "$ADMIN_HASH" ]; then
    mysql $MYSQL_ARGS "$DB_NAME" -e "
      INSERT INTO users (username, display_name, password_hash, \`rank\`, status)
      VALUES ('admin', 'Admin', '${ADMIN_HASH}', 'guildmaster', 'active')
      ON DUPLICATE KEY UPDATE password_hash = '${ADMIN_HASH}', \`rank\` = 'guildmaster', status = 'active';
    " 2>/dev/null && \
      ok "Admin account ready (username: admin, password: admin)" || \
      warn "Could not seed admin account"
  else
    warn "bcrypt not available — install server deps first (npm install)"
  fi
fi

# ── 8. Seed forum categories & events ─────────────
step_header "Seeding forum categories & events..."

if [ "$HAS_MYSQL" = false ] || [ -z "$DB_NAME" ] || [[ "$DB_NAME" == *"YOUR_"* ]]; then
  warn "Skipping — database not configured"
else
  SEED_FILE="$DB_DIR/seed-forum-events.sql"
  if [ -f "$SEED_FILE" ]; then
    mysql $MYSQL_ARGS "$DB_NAME" < "$SEED_FILE" 2>/dev/null && \
      ok "Forum categories & events seeded" || \
      warn "Could not seed forum/events (may already exist)"
  else
    warn "Seed file not found: db/seed-forum-events.sql"
  fi
fi

# ── 9. Install PM2 process manager ────────────────
step_header "Setting up PM2 process manager..."

if command -v pm2 &>/dev/null; then
  ok "PM2 already installed ($(pm2 -v))"
else
  echo "  Installing PM2 globally..."
  npm install -g pm2 --loglevel=warn 2>/dev/null
  if command -v pm2 &>/dev/null; then
    ok "PM2 installed ($(pm2 -v))"
  else
    warn "PM2 install failed — install manually: npm install -g pm2"
  fi
fi

if [ -f "$ROOT/ecosystem.config.js" ]; then
  ok "ecosystem.config.js found"
else
  warn "ecosystem.config.js not found — PM2 will need manual configuration"
fi

# ── 10. Configure PM2 startup ────────────────────
step_header "Configuring PM2 startup service..."

if command -v pm2 &>/dev/null; then
  # Generate systemd startup script
  STARTUP_CMD=$(pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null | grep "sudo" | head -1)
  if [ -n "$STARTUP_CMD" ]; then
    echo "  Run this command to enable PM2 on boot:"
    echo -e "  ${YELLOW}${STARTUP_CMD}${NC}"
    echo ""
    echo "  Then start the app and save the process list:"
    echo -e "  ${YELLOW}pm2 start ecosystem.config.js && pm2 save${NC}"
  else
    ok "PM2 startup may already be configured"
    echo "  Start the app: pm2 start ecosystem.config.js && pm2 save"
  fi
else
  warn "Skipping — PM2 not available"
fi

# ── 11. Verify configuration ─────────────────────
step_header "Verifying configuration..."

WARNINGS=()
declare -A REQUIRED=(
  [DB_NAME]="Database name"
  [JWT_SECRET]="Generate: openssl rand -base64 48"
  [DISCORD_CLIENT_ID]="discord.com/developers → your app"
  [DISCORD_CLIENT_SECRET]="Discord app → OAuth2"
  [DISCORD_BOT_TOKEN]="Discord app → Bot → Token"
  [DISCORD_GUILD_ID]="Right-click server (Developer Mode)"
  [DISCORD_OFFICER_CHANNEL_ID]="Right-click officer channel"
  [DISCORD_REDIRECT_URI]="http://localhost:3001/api/auth/discord/callback"
  [BLIZZARD_CLIENT_ID]="develop.battle.net → your app"
  [BLIZZARD_CLIENT_SECRET]="Battle.net app credentials"
  [CORS_ORIGIN]="Your site URL, e.g. https://mdga.dev"
)

for key in "${!REQUIRED[@]}"; do
  val="${!key}"
  if [ -z "$val" ] || [[ "$val" == *"YOUR_"* ]] || [[ "$val" == *"CHANGE_ME"* ]]; then
    WARNINGS+=("  ${YELLOW}!${NC} ${BOLD}$key${NC} — ${REQUIRED[$key]}")
  fi
done

if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo -e "  ${YELLOW}Missing or placeholder values in .env:${NC}"
  for w in "${WARNINGS[@]}"; do
    echo -e "$w"
  done
else
  ok "All required env vars configured"
fi

# ── Summary ──────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Start with PM2:${NC}        pm2 start ecosystem.config.js"
echo -e "  ${BOLD}PM2 status:${NC}            pm2 status"
echo -e "  ${BOLD}PM2 logs:${NC}              pm2 logs mdga"
echo -e "  ${BOLD}PM2 restart:${NC}           pm2 restart mdga"
echo -e "  ${BOLD}Save for auto-start:${NC}   pm2 save"
echo ""
echo -e "  ${BOLD}Manual start:${NC}          npm start"
echo -e "  ${BOLD}Development mode:${NC}      npm run dev"
echo -e "  ${BOLD}Client dev server:${NC}     cd client && npm run dev"
echo -e "  ${BOLD}Start MySQL (Docker):${NC}  docker compose up -d"
echo ""
