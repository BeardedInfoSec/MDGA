const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { refreshCharacter } = require('../services/character-sync');
const { syncAllGuildStats } = require('../services/guild-stats-sync');

const router = express.Router();

const VALID_BRACKETS = [
  'solo_shuffle', 'arena_3v3', 'arena_2v2', 'rbg_rating',
  'honorable_kills', 'killing_blows',
  'arenas_played', 'arenas_won',
  'bgs_played', 'bgs_won',
  'mythic_plus_rating', 'item_level', 'highest_mplus_key', 'mythic_bosses_killed',
  'dungeons_entered', 'raids_entered',
  'creatures_killed', 'total_deaths',
  'quests_completed', 'achievement_points',
];

// GET /api/leaderboard — guild-wide leaderboard from guild_member_stats
router.get('/', requireAuth, async (req, res) => {
  try {
    let bracket = req.query.bracket || 'solo_shuffle';
    if (!VALID_BRACKETS.includes(bracket)) bracket = 'solo_shuffle';

    const pageSize = Math.min(100, parseInt(req.query.page_size, 10) || 20);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    // Count total matching entries
    const [[countRow]] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      INNER JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
      WHERE g.is_primary = TRUE
        AND gms.${bracket} > 0
    `);

    const limitClause = `LIMIT ${parseInt(pageSize, 10)} OFFSET ${parseInt((page - 1) * pageSize, 10)}`;

    const [entries] = await pool.execute(`
      SELECT gm.id, gm.character_name, gm.realm_slug, gm.class, gm.race, gm.level,
             gm.guild_rank, gm.spec,
             gms.arena_2v2, gms.arena_3v3, gms.solo_shuffle, gms.rbg_rating,
             gms.honorable_kills, gms.killing_blows,
             gms.arenas_played, gms.arenas_won, gms.arenas_lost,
             gms.bgs_played, gms.bgs_won,
             gms.total_deaths, gms.creatures_killed, gms.dungeons_entered, gms.raids_entered,
             gms.quests_completed, gms.achievement_points, gms.mythic_plus_rating,
             gms.item_level AS ps_item_level, gms.highest_mplus_key, gms.mythic_bosses_killed,
             gms.spec AS stats_spec, gms.fetched_at,
             u.id AS user_id, u.display_name, u.avatar_url, u.\`rank\` AS user_rank,
             uc.realm AS realm, uc.is_main, uc.spec AS uc_spec
      FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      INNER JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
      LEFT JOIN users u ON u.id = gm.linked_user_id
      LEFT JOIN user_characters uc ON uc.id = gm.linked_character_id
      WHERE g.is_primary = TRUE
        AND gms.${bracket} > 0
      ORDER BY gms.${bracket} DESC, gm.character_name ASC
      ${limitClause}
    `);

    res.json({ entries, bracket, total: countRow.total, page, pageSize });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// POST /api/leaderboard/refresh — refresh own characters (updates pvp_stats for profile)
router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const [characters] = await pool.execute(
      `SELECT uc.id, uc.realm_slug, uc.character_name
       FROM user_characters uc
       LEFT JOIN pvp_stats ps ON ps.character_id = uc.id
       WHERE uc.user_id = ?
         AND (ps.fetched_at IS NULL OR ps.fetched_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE))`,
      [req.user.id]
    );

    if (characters.length === 0) {
      return res.json({ message: 'Stats are up to date', refreshed: 0 });
    }

    let refreshed = 0;
    for (const char of characters) {
      const result = await refreshCharacter(char);
      if (result.updated) refreshed++;
    }

    res.json({ message: `Refreshed ${refreshed} character(s)`, refreshed });
  } catch (err) {
    console.error('Refresh stats error:', err);
    res.status(500).json({ error: 'Failed to refresh stats' });
  }
});

// POST /api/leaderboard/refresh-guild — officer trigger for guild stats sync (fire-and-forget)
router.post('/refresh-guild', requireAuth, requirePermission('leaderboard.bulk_refresh'), async (req, res) => {
  res.json({ message: 'Guild stats refresh started' });

  (async () => {
    try {
      const results = await syncAllGuildStats();
      console.log('[Leaderboard] Guild stats refresh complete:', results);
    } catch (err) {
      console.error('[Leaderboard] Guild stats refresh error:', err);
    }
  })();
});

module.exports = router;
