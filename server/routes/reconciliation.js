// ================================================
// RECONCILIATION — Guild ↔ Discord mismatch dashboard
// Action endpoints + a paste-based addon ingest fallback for officers
// who don't have the addon companion app wired up.
// ================================================
const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireOfficer } = require('../middleware/auth');
const { syncDiscordMembers } = require('../services/discord-member-sync');
const { syncAllGuilds } = require('../services/guild-sync');

const router = express.Router();

const MAX_ROSTER_SIZE = 1000;

// ── POST /api/reconciliation/addon-paste ──
// Officer pastes the JSON output of the addon's "Export JSON" button.
// Upserts officer/public notes + lastSeen onto guild_members for rows matching
// (guild_id, character_name, realm_slug). Deduplicates on SHA-256 of the payload.
router.post('/addon-paste', requireAuth, requireOfficer, async (req, res) => {
  try {
    const { guildInfo, roster } = req.body || {};
    if (!Array.isArray(roster)) {
      return res.status(400).json({ error: 'Missing roster array in payload.' });
    }
    if (roster.length > MAX_ROSTER_SIZE) {
      return res.status(400).json({ error: `Roster too large. Max ${MAX_ROSTER_SIZE} entries.` });
    }

    // Primary guild lookup — reconciliation is scoped to the primary guild.
    const [guildRows] = await pool.execute('SELECT id, name FROM guilds WHERE is_primary = TRUE LIMIT 1');
    if (guildRows.length === 0) {
      return res.status(500).json({ error: 'No primary guild configured.' });
    }
    const guildId = guildRows[0].id;
    const primaryGuildName = (guildRows[0].name || '').toUpperCase().trim();

    // Payload hash for dedup (canonicalize by sorting roster entries).
    const canonical = JSON.stringify({
      guild: guildInfo?.name || null,
      roster: [...roster]
        .map((m) => ({
          name: String(m.name || '').toLowerCase(),
          realm: String(m.realmSlug || '').toLowerCase(),
          officerNote: m.officerNote || '',
          publicNote: m.publicNote || '',
          lastSeen: m.lastSeen || 0,
        }))
        .sort((a, b) => (a.realm + a.name).localeCompare(b.realm + b.name)),
    });
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');

    const [dupRows] = await pool.execute('SELECT id, ingested_at FROM addon_ingests WHERE raw_blob_hash = ?', [hash]);
    if (dupRows.length > 0) {
      return res.json({
        skipped: true,
        reason: 'duplicate_hash',
        previously_ingested_at: dupRows[0].ingested_at,
      });
    }

    // If the addon reported a guild name, verify it matches the primary guild.
    if (guildInfo?.name) {
      const submitted = String(guildInfo.name).toUpperCase().trim();
      if (submitted !== primaryGuildName) {
        return res.status(403).json({
          error: `Addon payload is for a different guild ("${guildInfo.name}"). Expected "${guildRows[0].name}".`,
        });
      }
    }

    let matched = 0;
    const unmatched = [];

    for (const member of roster) {
      if (!member?.name || !member?.realmSlug) continue;
      const officerNote = typeof member.officerNote === 'string' ? member.officerNote.substring(0, 128) : null;
      const publicNote = typeof member.publicNote === 'string' ? member.publicNote.substring(0, 128) : null;
      const lastSeenTs = Number(member.lastSeen);
      const hasLastSeen = Number.isFinite(lastSeenTs) && lastSeenTs > 0;

      const [result] = await pool.execute(
        `UPDATE guild_members
         SET guild_rank_name   = COALESCE(?, guild_rank_name),
             officer_note      = COALESCE(?, officer_note),
             public_note       = COALESCE(?, public_note),
             addon_last_seen   = CASE WHEN ? IS NULL THEN addon_last_seen ELSE FROM_UNIXTIME(?) END,
             addon_ingested_at = NOW()
         WHERE guild_id = ? AND LOWER(character_name) = LOWER(?) AND realm_slug = ?`,
        [
          member.rankName || null,
          officerNote,
          publicNote,
          hasLastSeen ? lastSeenTs : null,
          hasLastSeen ? lastSeenTs : null,
          guildId, member.name, member.realmSlug,
        ]
      );
      if (result.affectedRows > 0) matched++;
      else unmatched.push({ name: member.name, realmSlug: member.realmSlug });
    }

    await pool.execute(
      `INSERT INTO addon_ingests (ingested_by_user_id, roster_count, event_count, matched_count, unmatched_count, raw_blob_hash, source)
       VALUES (?, ?, 0, ?, ?, ?, 'paste')`,
      [req.user.id, roster.length, matched, unmatched.length, hash]
    );

    res.json({
      ingested: true,
      roster_count: roster.length,
      matched,
      unmatched_count: unmatched.length,
      unmatched_characters: unmatched.slice(0, 50),
    });
  } catch (err) {
    console.error('[Reconciliation] addon-paste error:', err);
    res.status(500).json({ error: 'Failed to ingest addon data' });
  }
});

// ── POST /api/reconciliation/refresh ──
// Kicks off an immediate Discord member sync + a guild roster sync so the
// reconciliation view reflects the latest state. Fire-and-forget if either
// is already running.
router.post('/refresh', requireAuth, requireOfficer, async (req, res) => {
  const tasks = {
    discord: null,
    guild: null,
  };
  try {
    const [dResult, gResult] = await Promise.allSettled([
      syncDiscordMembers(),
      syncAllGuilds(),
    ]);
    tasks.discord = dResult.status === 'fulfilled' ? dResult.value : { error: dResult.reason?.message };
    tasks.guild = gResult.status === 'fulfilled' ? gResult.value : { error: gResult.reason?.message };
    res.json({ refreshed: true, tasks });
  } catch (err) {
    console.error('[Reconciliation] refresh error:', err);
    res.status(500).json({ error: 'Refresh failed', tasks });
  }
});

// ── POST /api/reconciliation/guild-members/:id/link ──
// Manually link a guild_member row to a site user (used when spelling differs
// between in-game and site character name and the auto cross-link missed it).
router.post('/guild-members/:id/link', requireAuth, requireOfficer, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const userId = parseInt(req.body?.user_id, 10);
    if (!Number.isFinite(memberId) || !Number.isFinite(userId)) {
      return res.status(400).json({ error: 'Invalid member or user id' });
    }
    const [memberRows] = await pool.execute('SELECT id FROM guild_members WHERE id = ?', [memberId]);
    if (memberRows.length === 0) return res.status(404).json({ error: 'Guild member not found' });
    const [userRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

    await pool.execute(
      'UPDATE guild_members SET linked_user_id = ? WHERE id = ?',
      [userId, memberId]
    );
    res.json({ linked: true });
  } catch (err) {
    console.error('[Reconciliation] link error:', err);
    res.status(500).json({ error: 'Failed to link member' });
  }
});

// ── POST /api/reconciliation/guild-members/:id/ignore ──
// Suppress a reconciliation row for N days (default 30). Officer may want to
// ignore intentional alt-without-main rows, for example.
router.post('/guild-members/:id/ignore', requireAuth, requireOfficer, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const days = Math.max(1, Math.min(365, parseInt(req.body?.days, 10) || 30));
    if (!Number.isFinite(memberId)) return res.status(400).json({ error: 'Invalid member id' });

    await pool.execute(
      'UPDATE guild_members SET reconciliation_ignored_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
      [days, memberId]
    );
    res.json({ ignored_for_days: days });
  } catch (err) {
    console.error('[Reconciliation] ignore error:', err);
    res.status(500).json({ error: 'Failed to ignore member' });
  }
});

// ── DELETE /api/reconciliation/guild-members/:id/ignore ──
// Clear an ignore flag, returning the row to the active reconciliation list.
router.delete('/guild-members/:id/ignore', requireAuth, requireOfficer, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    if (!Number.isFinite(memberId)) return res.status(400).json({ error: 'Invalid member id' });
    await pool.execute(
      'UPDATE guild_members SET reconciliation_ignored_until = NULL WHERE id = ?',
      [memberId]
    );
    res.json({ cleared: true });
  } catch (err) {
    console.error('[Reconciliation] ignore-clear error:', err);
    res.status(500).json({ error: 'Failed to clear ignore' });
  }
});

module.exports = router;
