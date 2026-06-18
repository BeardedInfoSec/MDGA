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
const { setMemberNickname, setMemberRoles } = require('../bot');
const { logAdminAction } = require('../services/audit-log');

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

// ── GET /api/reconciliation/snapshot ──
// Officer toolkit's single round-trip endpoint. Returns all 8 cards in
// one payload, plus header metadata (counts, last sync times). Replaces
// 4-8 parallel calls from the toolkit on every refresh. Each `rows`
// array is the same shape the underlying report endpoints return —
// reuse those handlers' SQL by calling internal helpers where possible.
router.get('/snapshot', requireAuth, requireOfficer, async (req, res) => {
  try {
    // Forward each report query in parallel via internal HTTP. Cleaner
    // approach: factor the report queries into shared helpers; for v1
    // we keep it simple by issuing internal fetches against the same
    // process (no network hop — `http://127.0.0.1:<port>/api/...`).
    const port = process.env.PORT || 3001;
    const authHeader = req.headers.authorization || '';
    const fetch = require('node-fetch');
    const base = `http://127.0.0.1:${port}/api`;
    const headers = { Authorization: authHeader };

    const fetchJson = async (path) => {
      try {
        const r = await fetch(`${base}${path}`, { headers });
        if (!r.ok) return { error: `${r.status}`, rows: [] };
        return await r.json();
      } catch (err) {
        console.error('[Reconciliation] fetch error:', err);
        return { error: 'Fetch failed', rows: [] };
      }
    };

    const [
      neverSignedIn,
      noDiscordLink,
      leftDiscord,
      orphanDiscord,
      altWithoutMain,
      altNoteFormat,
      nicknameMismatch,
      spelling,
      nameChanges,
      meta,
    ] = await Promise.all([
      fetchJson('/reports/guild-gaps?link_state=no_site_account&limit=500'),
      fetchJson('/reports/guild-gaps?link_state=no_discord_link&limit=500'),
      fetchJson('/reports/guild-gaps?link_state=discord_not_active&limit=500'),
      fetchJson('/reports/discord-orphans?bucket=orphan_discord_member'),
      fetchJson('/reports/guild-gaps?link_state=alt_without_main&limit=500'),
      fetchJson('/reports/alt-note-format-violations'),
      fetchJson('/reports/nickname-mismatches'),
      fetchJson('/reports/spelling-mismatches'),
      fetchJson('/reports/name-changes?since_days=30'),
      // Header metadata: counts + sync timestamps for the bar at the
      // top of the toolkit.
      (async () => {
        const [[discordTotal]] = await pool.execute(
          'SELECT COUNT(*) AS n FROM discord_members WHERE is_in_guild = 1'
        );
        const [[guildTotal]] = await pool.execute(
          `SELECT COUNT(*) AS n FROM guild_members gm
             JOIN guilds g ON g.id = gm.guild_id
            WHERE g.is_primary = TRUE`
        );
        const [[lastDiscord]] = await pool.execute(
          'SELECT MAX(last_synced_at) AS at FROM discord_members'
        );
        const [[lastGuild]] = await pool.execute(
          `SELECT MAX(g.last_synced_at) AS at FROM guilds g WHERE g.is_primary = TRUE`
        );
        return {
          discord_total: discordTotal.n,
          guild_total: guildTotal.n,
          last_discord_sync: lastDiscord.at,
          last_guild_sync: lastGuild.at,
        };
      })(),
    ]);

    res.json({
      generated_at: new Date().toISOString(),
      meta,
      cards: {
        never_signed_in:    { rows: neverSignedIn.rows || [] },
        no_discord_link:    { rows: noDiscordLink.rows || [] },
        left_discord:       { rows: leftDiscord.rows || [] },
        orphan_in_discord:  { rows: orphanDiscord.rows || [] },
        alt_without_main:   { rows: altWithoutMain.rows || [] },
        alt_note_format:    { rows: altNoteFormat.rows || [] },
        nickname_mismatch:  { rows: nicknameMismatch.rows || [] },
        spelling_near:      { rows: spelling.rows || [] },
        name_changes:       { rows: nameChanges.rows || [] },
      },
    });
  } catch (err) {
    console.error('[Reconciliation] snapshot error:', err);
    res.status(500).json({ error: 'Failed to build snapshot' });
  }
});

// ── POST /api/reconciliation/action ──
// Officer-toolkit single dispatcher for website-side actions (i.e. the
// ones that don't require the in-game addon to execute). Body:
//   { kind: 'rename_discord_nick' | 'remove_discord_role' |
//           'link_guild_member' | 'ignore_guild_member' |
//           'clear_ignore',
//     target: { user_id?, member_id?, discord_id? },
//     args: { nickname?, role_ids?, days? } }
// In-game-only actions (kick, set officer note, promote, demote) come
// from the toolkit's local SavedVariables queue path, not this endpoint.
router.post('/action', requireAuth, requireOfficer, async (req, res) => {
  try {
    const { kind, target, args } = req.body || {};
    if (!kind) return res.status(400).json({ error: 'Missing kind' });
    const t = target || {};
    const a = args || {};

    switch (kind) {
      case 'rename_discord_nick': {
        if (!t.discord_id || !a.nickname) {
          return res.status(400).json({ error: 'discord_id and nickname required' });
        }
        const result = await setMemberNickname(String(t.discord_id), String(a.nickname).slice(0, 32));
        logAdminAction({
          adminId: req.user.id, action: 'reconciliation.rename_discord_nick',
          targetType: 'discord_member', targetId: null,
          details: { discord_id: t.discord_id, nickname: a.nickname, result },
        });
        return res.json({ kind, result });
      }

      case 'remove_discord_role': {
        if (!t.discord_id || !Array.isArray(a.role_ids) || a.role_ids.length === 0) {
          return res.status(400).json({ error: 'discord_id and role_ids[] required' });
        }
        const result = await setMemberRoles(String(t.discord_id), [], a.role_ids.map(String));
        logAdminAction({
          adminId: req.user.id, action: 'reconciliation.remove_discord_role',
          targetType: 'discord_member', targetId: null,
          details: { discord_id: t.discord_id, removed_role_ids: a.role_ids, result },
        });
        return res.json({ kind, result });
      }

      case 'link_guild_member': {
        const memberId = parseInt(t.member_id, 10);
        const userId = parseInt(t.user_id, 10);
        if (!Number.isFinite(memberId) || !Number.isFinite(userId)) {
          return res.status(400).json({ error: 'member_id and user_id required' });
        }
        const [memberRows] = await pool.execute('SELECT id FROM guild_members WHERE id = ?', [memberId]);
        if (memberRows.length === 0) return res.status(404).json({ error: 'Member not found' });
        const [userRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
        await pool.execute('UPDATE guild_members SET linked_user_id = ? WHERE id = ?', [userId, memberId]);
        logAdminAction({
          adminId: req.user.id, action: 'reconciliation.link_guild_member',
          targetType: 'guild_member', targetId: memberId,
          details: { linked_user_id: userId },
        });
        return res.json({ kind, linked: true });
      }

      case 'ignore_guild_member': {
        const memberId = parseInt(t.member_id, 10);
        const days = Math.max(1, Math.min(365, parseInt(a.days, 10) || 30));
        if (!Number.isFinite(memberId)) return res.status(400).json({ error: 'member_id required' });
        await pool.execute(
          'UPDATE guild_members SET reconciliation_ignored_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
          [days, memberId]
        );
        logAdminAction({
          adminId: req.user.id, action: 'reconciliation.ignore_guild_member',
          targetType: 'guild_member', targetId: memberId,
          details: { days },
        });
        return res.json({ kind, ignored_for_days: days });
      }

      case 'clear_ignore': {
        const memberId = parseInt(t.member_id, 10);
        if (!Number.isFinite(memberId)) return res.status(400).json({ error: 'member_id required' });
        await pool.execute(
          'UPDATE guild_members SET reconciliation_ignored_until = NULL WHERE id = ?',
          [memberId]
        );
        logAdminAction({
          adminId: req.user.id, action: 'reconciliation.clear_ignore',
          targetType: 'guild_member', targetId: memberId,
          details: {},
        });
        return res.json({ kind, cleared: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action kind: ${kind}` });
    }
  } catch (err) {
    console.error('[Reconciliation] action error:', err);
    res.status(500).json({ error: 'Action failed' });
  }
});

module.exports = router;
