const express = require('express');
const { DateTime } = require('luxon');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// PUT /api/profile/timezone
router.put('/timezone', requireAuth, async (req, res) => {
  try {
    const { timezone } = req.body;
    if (!timezone || typeof timezone !== 'string') {
      return res.status(400).json({ error: 'Timezone is required' });
    }
    const test = DateTime.now().setZone(timezone);
    if (!test.isValid) {
      return res.status(400).json({ error: 'Invalid timezone identifier' });
    }
    await pool.execute('UPDATE users SET timezone = ? WHERE id = ?', [timezone.trim(), req.user.id]);
    res.json({ message: 'Timezone updated', timezone: timezone.trim() });
  } catch (err) {
    console.error('Update timezone error:', err);
    res.status(500).json({ error: 'Failed to update timezone' });
  }
});

// GET /api/profile/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm,
              u.character_name, u.discord_username, u.created_at,
              u.afk_until, u.afk_reason, u.afk_set_at,
              uc_main.character_name AS main_character_name,
              uc_main.realm_slug AS main_realm_slug
       FROM users u
       LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
       WHERE u.id = ? AND u.status = ?`,
      [req.params.id, 'active']
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const [characters] = await pool.execute(
      `SELECT uc.*, ps.arena_2v2, ps.arena_3v3, ps.solo_shuffle, ps.rbg_rating, ps.honorable_kills,
             ps.killing_blows, ps.arenas_played, ps.arenas_won, ps.arenas_lost,
             ps.bgs_played, ps.bgs_won,
             ps.total_deaths, ps.creatures_killed, ps.dungeons_entered, ps.raids_entered,
             ps.quests_completed, ps.achievement_points, ps.achievement_breakdown,
             ps.fetched_at,
             gm.guild_id, g.faction AS guild_faction
       FROM user_characters uc
       LEFT JOIN pvp_stats ps ON ps.character_id = uc.id
       LEFT JOIN guild_members gm ON gm.linked_character_id = uc.id
       LEFT JOIN guilds g ON g.id = gm.guild_id
       WHERE uc.user_id = ?
       ORDER BY uc.is_main DESC, uc.character_name ASC`,
      [req.params.id]
    );

    // Forum activity counts
    const [[postCountRows], [commentCountRows], [viewCountRows]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS count FROM forum_posts WHERE user_id = ?', [req.params.id]),
      pool.execute('SELECT COUNT(*) AS count FROM forum_comments WHERE user_id = ?', [req.params.id]),
      pool.execute('SELECT COALESCE(SUM(view_count), 0) AS count FROM forum_posts WHERE user_id = ?', [req.params.id]),
    ]);

    res.json({
      user: users[0],
      characters,
      activity: {
        posts: postCountRows[0].count,
        views: viewCountRows[0].count,
        comments: commentCountRows[0].count,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profile/afk — set an AFK notice on the authenticated user.
// Body: { days: 30|60|90|180, reason: string<=255 }
// Days picker is fixed to a small allowlist so we don't accept arbitrary
// future dates (a 5-year AFK isn't an "audit hint", it's a leave). The
// resulting `afk_until` is today + days, stored as a DATE.
const AFK_DAY_OPTIONS = new Set([7, 14, 30, 60, 90, 180]);

router.put('/afk', requireAuth, async (req, res) => {
  try {
    const days = Number(req.body && req.body.days);
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 255);
    if (!AFK_DAY_OPTIONS.has(days)) {
      return res.status(400).json({ error: 'days must be one of 7, 14, 30, 60, 90, 180' });
    }
    const afkUntil = DateTime.utc().plus({ days }).toFormat('yyyy-MM-dd');
    await pool.execute(
      'UPDATE users SET afk_until = ?, afk_reason = ?, afk_set_at = NOW() WHERE id = ?',
      [afkUntil, reason || null, req.user.id]
    );
    res.json({ afk_until: afkUntil, afk_reason: reason || null });
  } catch (err) {
    console.error('Set AFK notice error:', err);
    res.status(500).json({ error: 'Failed to set AFK notice' });
  }
});

// DELETE /api/profile/afk — clear the authenticated user's AFK notice.
router.delete('/afk', requireAuth, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE users SET afk_until = NULL, afk_reason = NULL, afk_set_at = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ cleared: true });
  } catch (err) {
    console.error('Clear AFK notice error:', err);
    res.status(500).json({ error: 'Failed to clear AFK notice' });
  }
});

module.exports = router;
