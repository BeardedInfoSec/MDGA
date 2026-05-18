// ================================================
// Guild registry — cached lookups against the `guilds` table.
// Single source of truth for "is this character in a guild we accept?"
// and for the realm allowlist (auto-derived from registered child guilds).
// ================================================
const pool = require('../db');

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = null;
let loadedAt = 0;
let inflight = null;

function normalizeName(s) {
  return String(s || '').toUpperCase().trim();
}

function normalizeSlug(s) {
  return String(s || '').toLowerCase().trim();
}

// Mirror the slug rule used by routes/characters.js + blizzard.js.
function slugifyRealm(realmName) {
  return String(realmName || '')
    .toLowerCase()
    .replace(/[' ]/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function loadGuilds() {
  const [rows] = await pool.execute(
    'SELECT id, name, realm_slug, name_slug, faction, is_primary FROM guilds'
  );
  cache = rows;
  loadedAt = Date.now();
  return rows;
}

async function getGuilds() {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = loadGuilds().finally(() => { inflight = null; });
  return inflight;
}

function invalidate() {
  cache = null;
  loadedAt = 0;
}

// Find the registered child guild matching a (guild name, realm slug) pair.
// Returns the guild row or null.
async function findGuild({ guildName, realmSlug }) {
  if (!guildName || !realmSlug) return null;
  const targetName = normalizeName(guildName);
  const targetSlug = normalizeSlug(realmSlug);
  const guilds = await getGuilds();
  return guilds.find(
    (g) => normalizeName(g.name) === targetName && normalizeSlug(g.realm_slug) === targetSlug
  ) || null;
}

// Name-only match. Accepts any character whose guild name matches one of
// the federation guilds, regardless of realm. Used by character add — we
// don't want to gate on realm registration since members are spread across
// every WoW server. Returns the first matching guild row (for FK linkage)
// or null.
async function findGuildByName(guildName) {
  if (!guildName) return null;
  const targetName = normalizeName(guildName);
  const guilds = await getGuilds();
  return guilds.find((g) => normalizeName(g.name) === targetName) || null;
}

// Ensure a (guildName, realmSlug) pair is registered. If a row already
// exists, return it. Otherwise insert a new row and return that. The new
// row mirrors the canonical name + faction of an existing federation guild
// with the same name (so the auto-extension stays consistent), and starts
// with member_count=0 / last_synced_at=NULL so the next sync pulls roster.
// Returns the guild row (existing or new), or null if guildName isn't a
// federation guild at all (caller should reject before reaching here).
async function ensureGuildRegistered({ guildName, realmSlug }) {
  if (!guildName || !realmSlug) return null;
  const normalizedSlug = normalizeSlug(realmSlug);

  // Already registered on this realm? Use the (name, realm) tuple matcher.
  const existing = await findGuild({ guildName, realmSlug: normalizedSlug });
  if (existing) return existing;

  // Federation membership check — only auto-register if the NAME is one of
  // our known federation guilds (prevents arbitrary guilds being added).
  const peer = await findGuildByName(guildName);
  if (!peer) return null;

  const nameSlug = String(guildName)
    .toLowerCase()
    .replace(/[' ]/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  await pool.execute(
    `INSERT INTO guilds (name, realm_slug, name_slug, faction, is_primary)
     VALUES (?, ?, ?, ?, FALSE)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [peer.name, normalizedSlug, nameSlug, peer.faction]
  );

  invalidate(); // bust cache so the new row is visible immediately
  const [rows] = await pool.execute(
    'SELECT id, name, realm_slug, name_slug, faction, is_primary FROM guilds WHERE name_slug = ? AND realm_slug = ?',
    [nameSlug, normalizedSlug]
  );
  return rows[0] || null;
}

async function getPrimaryGuild() {
  const guilds = await getGuilds();
  return guilds.find((g) => g.is_primary) || guilds[0] || null;
}

async function getRegisteredRealmSlugs() {
  const guilds = await getGuilds();
  return [...new Set(guilds.map((g) => normalizeSlug(g.realm_slug)))];
}

// True iff `realmInput` (display name OR slug) maps to a realm that has at
// least one registered child guild.
async function isRealmRegistered(realmInput) {
  if (!realmInput) return false;
  const slugs = await getRegisteredRealmSlugs();
  const probe = normalizeSlug(realmInput);
  if (slugs.includes(probe)) return true;
  return slugs.includes(slugifyRealm(realmInput));
}

// Filter a list of realm display names down to those whose slug is registered.
async function filterRegisteredRealmNames(realmNames) {
  const slugs = new Set(await getRegisteredRealmSlugs());
  return (realmNames || []).filter((name) => slugs.has(slugifyRealm(name)));
}

module.exports = {
  findGuild,
  findGuildByName,
  getGuilds,
  getPrimaryGuild,
  getRegisteredRealmSlugs,
  isRealmRegistered,
  filterRegisteredRealmNames,
  invalidate,
  slugifyRealm,
};
