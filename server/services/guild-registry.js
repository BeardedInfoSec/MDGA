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
  getGuilds,
  getPrimaryGuild,
  getRegisteredRealmSlugs,
  isRealmRegistered,
  filterRegisteredRealmNames,
  invalidate,
  slugifyRealm,
};
