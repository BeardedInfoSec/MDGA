// ================================================
// ADDON SYNC — Receives data from the WoW addon companion app
// POST /api/addon/sync
// Officer-only (guild_rank <= 2), JWT auth, strict validation
// ================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendOfficerAlert } = require('../bot');
const { processRankChanges } = require('../services/guild-sync');

const router = express.Router();

// ── Constants ──
const REQUIRED_GUILD_NAME = 'MAKE DUROTAR GREAT AGAIN';
const OFFICER_RANK_THRESHOLD = 2;       // guild_rank <= 2 (0=GM, 1=Officer, 2=Senior Officer)
const MAX_EVENTS_PER_BATCH = 100;
const MAX_ROSTER_SIZE = 1000;
const MAX_CAPTURE_AGE_MS = 30 * 60 * 1000;   // 30 minutes
const MAX_EVENT_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const VALID_EVENT_TYPES = new Set(['rank_change', 'join', 'leave', 'online', 'offline']);

// ── Per-user rate limiter: 10 requests per 15 minutes ──
const addonLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `addon_${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many addon sync requests. Try again later.' },
});

// ================================================
// POST /api/addon/sync
// ================================================
router.post('/sync', requireAuth, addonLimiter, async (req, res) => {
  try {
    const {
      schemaVersion, capturedBy, capturedAt,
      guildInfo, playerInfo,
      roster, events, rosterIncluded,
    } = req.body;

    // ── 1. Schema version check (v3 and v4 accepted; v4 adds officer/public notes + lastSeen) ──
    if (schemaVersion !== 3 && schemaVersion !== 4) {
      return res.status(400).json({ error: 'Unsupported addon schema version. Please update your addon.' });
    }

    // ── 2. Guild name verification ──
    if (!guildInfo?.name || guildInfo.name.toUpperCase().trim() !== REQUIRED_GUILD_NAME) {
      return res.status(403).json({ error: 'This endpoint is only for MDGA guild members.' });
    }

    // ── 3. Capture freshness check ──
    const now = Date.now();
    const capturedAtMs = (capturedAt || 0) * 1000;
    if (now - capturedAtMs > MAX_CAPTURE_AGE_MS) {
      return res.status(400).json({ error: 'Data is too old. Please /reload in-game and try again.' });
    }

    // ── 4. Validate playerInfo ──
    if (!playerInfo?.name || !playerInfo?.realmSlug) {
      return res.status(400).json({ error: 'Missing player info (name and realmSlug required).' });
    }

    // ── 5. Character ownership: playerInfo must match a user_character owned by req.user ──
    const [ownedChars] = await pool.execute(
      `SELECT id FROM user_characters
       WHERE user_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?`,
      [req.user.id, playerInfo.name, playerInfo.realmSlug]
    );
    if (ownedChars.length === 0) {
      return res.status(403).json({ error: 'Character not linked to your account.' });
    }

    // ── 6. Guild membership + OFFICER CHECK (authoritative from DB) ──
    const [guildRows] = await pool.execute('SELECT id FROM guilds WHERE is_primary = TRUE LIMIT 1');
    if (guildRows.length === 0) {
      return res.status(500).json({ error: 'No primary guild configured.' });
    }
    const guildId = guildRows[0].id;

    const [memberRows] = await pool.execute(
      `SELECT guild_rank FROM guild_members
       WHERE guild_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?`,
      [guildId, playerInfo.name, playerInfo.realmSlug]
    );
    if (memberRows.length === 0) {
      return res.status(403).json({ error: 'Character not found in guild roster. Run a guild sync first.' });
    }
    if (memberRows[0].guild_rank > OFFICER_RANK_THRESHOLD) {
      return res.status(403).json({ error: 'Insufficient guild rank. Only officers (rank 0-2) may submit addon data.' });
    }

    // ── 7. Payload size limits ──
    if (Array.isArray(events) && events.length > MAX_EVENTS_PER_BATCH) {
      return res.status(400).json({ error: `Too many events. Max ${MAX_EVENTS_PER_BATCH} per batch.` });
    }
    if (Array.isArray(roster) && roster.length > MAX_ROSTER_SIZE) {
      return res.status(400).json({ error: `Roster too large. Max ${MAX_ROSTER_SIZE} entries.` });
    }

    // ── 8. Process rank names from addon (fill in game_rank_mappings.game_rank_name) ──
    if (guildInfo.rankNames && typeof guildInfo.rankNames === 'object') {
      for (const [idxStr, rankName] of Object.entries(guildInfo.rankNames)) {
        const idx = parseInt(idxStr, 10);
        if (!Number.isFinite(idx) || !rankName) continue;
        await pool.execute(
          'UPDATE game_rank_mappings SET game_rank_name = ? WHERE guild_id = ? AND game_rank = ?',
          [String(rankName).substring(0, 100), guildId, idx]
        );
      }
    }

    // ── 9. Process roster (supplementary — Blizzard API is authoritative) ──
    // v4+: also captures officer_note, public_note, and addon_last_seen so the
    // reconciliation dashboard can surface in-game notes that the Blizzard API
    // never exposes.
    let rosterProcessed = 0;
    if (rosterIncluded && Array.isArray(roster)) {
      for (const member of roster.slice(0, MAX_ROSTER_SIZE)) {
        if (!member.name || !member.realmSlug) continue;
        const officerNote = typeof member.officerNote === 'string' ? member.officerNote.substring(0, 128) : null;
        const publicNote = typeof member.publicNote === 'string' ? member.publicNote.substring(0, 128) : null;
        const lastSeenTs = Number(member.lastSeen);
        await pool.execute(
          `UPDATE guild_members
           SET guild_rank_name = COALESCE(?, guild_rank_name),
               officer_note    = COALESCE(?, officer_note),
               public_note     = COALESCE(?, public_note),
               addon_last_seen = CASE
                 WHEN ? IS NULL THEN addon_last_seen
                 ELSE FROM_UNIXTIME(?)
               END,
               addon_ingested_at = NOW()
           WHERE guild_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?`,
          [
            member.rankName || null,
            officerNote,
            publicNote,
            Number.isFinite(lastSeenTs) && lastSeenTs > 0 ? lastSeenTs : null,
            Number.isFinite(lastSeenTs) && lastSeenTs > 0 ? lastSeenTs : null,
            guildId, member.name, member.realmSlug,
          ]
        );
        rosterProcessed++;
      }
    }

    // ── 10. Process events ──
    let eventsProcessed = 0;
    let eventsSkipped = 0;
    const rankChanges = [];

    if (Array.isArray(events)) {
      for (const evt of events.slice(0, MAX_EVENTS_PER_BATCH)) {
        // Validate event shape
        if (!evt.id || !evt.type || !evt.characterName || !evt.timestamp) continue;
        if (!VALID_EVENT_TYPES.has(evt.type)) continue;

        // Age check: skip events older than 2 hours or more than 60s in the future
        const evtAgeMs = now - (evt.timestamp * 1000);
        if (evtAgeMs > MAX_EVENT_AGE_MS || evtAgeMs < -60000) continue;

        // Dedup check against addon_events
        const [existing] = await pool.execute(
          'SELECT id FROM addon_events WHERE event_id = ?',
          [evt.id]
        );
        if (existing.length > 0) {
          eventsSkipped++;
          continue;
        }

        // Store event
        await pool.execute(
          `INSERT INTO addon_events
            (event_id, guild_id, event_type, character_name, realm_slug, event_data, event_timestamp, submitted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            evt.id,
            guildId,
            evt.type,
            evt.characterName,
            evt.realmSlug || playerInfo.realmSlug,
            JSON.stringify(evt.data || {}),
            evt.timestamp,
            req.user.id,
          ]
        );
        eventsProcessed++;

        // Track rank changes for processRankChanges
        if (evt.type === 'rank_change' && evt.data) {
          rankChanges.push({
            characterName: evt.characterName,
            realmSlug: evt.realmSlug || playerInfo.realmSlug,
            oldRank: evt.data.oldRank,
            newRank: evt.data.newRank,
          });
        }

        // Insert join/leave into guild_activity with 60-second dedup window
        if (evt.type === 'join' || evt.type === 'leave') {
          const desc = evt.type === 'join'
            ? `${evt.characterName} joined the guild`
            : `${evt.characterName} left the guild`;

          const [actExists] = await pool.execute(
            `SELECT id FROM guild_activity
             WHERE guild_id = ? AND activity_type = ? AND character_name = ?
             AND ABS(TIMESTAMPDIFF(SECOND, occurred_at, FROM_UNIXTIME(?))) < 60
             LIMIT 1`,
            [guildId, evt.type, evt.characterName, evt.timestamp]
          );
          if (actExists.length === 0) {
            await pool.execute(
              `INSERT INTO guild_activity
                (guild_id, activity_type, character_name, description, activity_data, occurred_at)
               VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
              [guildId, evt.type, evt.characterName, desc, JSON.stringify(evt.data || {}), evt.timestamp]
            );
          }
        }
      }
    }

    // ── 11. Process rank changes via existing infrastructure ──
    if (rankChanges.length > 0) {
      const enrichedChanges = [];
      for (const change of rankChanges) {
        const [link] = await pool.execute(
          `SELECT linked_user_id FROM guild_members
           WHERE guild_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?`,
          [guildId, change.characterName, change.realmSlug]
        );
        enrichedChanges.push({
          ...change,
          linkedUserId: link.length > 0 ? link[0].linked_user_id : null,
        });
      }

      // Fire-and-forget: process rank changes async
      processRankChanges(guildId, enrichedChanges).catch((err) => {
        console.error('[Addon sync] processRankChanges error:', err.message);
      });

      // Officer alerts for rank changes
      for (const change of rankChanges) {
        sendOfficerAlert(
          'Addon: In-Game Rank Change',
          `**${change.characterName}** rank: **${change.oldRank}** \u2192 **${change.newRank}**\n` +
          `Reported by: ${playerInfo.name} via addon`,
          0x00CCFF
        );
      }
    }

    // ── 12. Trim old addon events (keep last 10,000 per guild) ──
    await pool.execute(
      `DELETE FROM addon_events WHERE guild_id = ? AND id NOT IN (
        SELECT id FROM (SELECT id FROM addon_events WHERE guild_id = ? ORDER BY event_timestamp DESC LIMIT 10000) t
      )`,
      [guildId, guildId]
    );

    console.log(`[Addon sync] User ${req.user.username}: roster=${rosterProcessed}, events=${eventsProcessed}, skipped=${eventsSkipped}, rankChanges=${rankChanges.length}`);

    res.json({
      message: 'Addon data synced',
      rosterProcessed,
      eventsProcessed,
      eventsSkipped,
      rankChangesTriggered: rankChanges.length,
    });
  } catch (err) {
    console.error('[Addon sync] Error:', err);
    res.status(500).json({ error: 'Failed to process addon data' });
  }
});

module.exports = router;
