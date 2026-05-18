const express = require('express');
const pool = require('../db');
const { requireAuth, optionalAuth, requirePermission } = require('../middleware/auth');
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

// GET /api/leaderboard — guild-wide leaderboard from guild_member_stats.
// Public read: anonymous visitors see character standings only; logged-in
// members get the full Discord-linked attribution + search across users.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAuthed = !!req.user;
    let bracket = req.query.bracket || 'solo_shuffle';
    if (!VALID_BRACKETS.includes(bracket)) bracket = 'solo_shuffle';

    const pageSize = Math.min(100, parseInt(req.query.page_size, 10) || 20);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    // Filter split: BASE filters define who's on the bracket leaderboard at
    // all (and so determine ROW_NUMBER ranking). The optional search filter
    // is applied AFTER ranking so search results show each character's
    // *true* leaderboard rank, not their position in the filtered subset.
    const q = String(req.query.q || '').trim().slice(0, 60);
    // Previously hard-coded to is_primary=TRUE (Tichondrius MDGA only).
    // Now the leaderboard spans every federation guild — Area-52, Illidan,
    // Sargeras, Moon-Guard MEGA, etc. — so members on any registered realm
    // appear. Filter still drops zero-rated rows for the active bracket.
    const baseFilter = `gms.${bracket} > 0`;
    const baseWhere = `WHERE ${baseFilter}`;

    // Build the search clause in two forms: qualified (gm./u. prefixes) for
    // queries that JOIN to those tables; unqualified for the outer query
    // that selects from the inner-ranked subquery (column aliases are bare).
    let qualifiedSearch = '';
    let unqualifiedSearch = '';
    const searchParams = [];
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      if (isAuthed) {
        qualifiedSearch = '(gm.character_name LIKE ? OR u.display_name LIKE ? OR u.username LIKE ? OR u.discord_username LIKE ?)';
        unqualifiedSearch = '(character_name LIKE ? OR display_name LIKE ? OR username LIKE ? OR discord_username LIKE ?)';
        searchParams.push(like, like, like, like);
      } else {
        qualifiedSearch = 'gm.character_name LIKE ?';
        unqualifiedSearch = 'character_name LIKE ?';
        searchParams.push(like);
      }
    }

    // Count uses base + search together (we want the count of MATCHING rows).
    const countWhere = qualifiedSearch ? `${baseWhere} AND ${qualifiedSearch}` : baseWhere;
    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM guild_members gm
       JOIN guilds g ON g.id = gm.guild_id
       INNER JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
       LEFT JOIN users u ON u.id = gm.linked_user_id
       ${countWhere}`,
      searchParams
    );

    const limitClause = `LIMIT ${parseInt(pageSize, 10)} OFFSET ${parseInt((page - 1) * pageSize, 10)}`;

    // ── User-driven sort. Whitelisted to prevent SQL injection since values
    // are inlined into the query. The leaderboard rank itself is stamped in
    // the inner SELECT via ROW_NUMBER() ordered by the bracket metric, so
    // sorting by Character/Player/etc. doesn't change a row's "true rank".
    // item_level is aliased to ps_item_level in the inner SELECT, so the
    // outer ORDER BY references the alias when sorting by value on that bracket.
    const bracketColumn = bracket === 'item_level' ? 'ps_item_level' : bracket;
    const sortBy = String(req.query.sort_by || 'rank');
    // Per-column default direction: rank/name columns want ASC (so #1 / "A"
    // shows first); numeric value columns want DESC (highest first). Only
    // override when the client explicitly passes sort_dir.
    const rawSortDir = String(req.query.sort_dir || '').toLowerCase();
    const ascByDefault = ['rank', 'character', 'player', 'class'].includes(sortBy);
    const sortDir = rawSortDir === 'asc' ? 'ASC'
                    : rawSortDir === 'desc' ? 'DESC'
                    : (ascByDefault ? 'ASC' : 'DESC');
    const winRateExpr = bracket === 'arenas_won'
      ? '(CASE WHEN arenas_played > 0 THEN arenas_won * 1.0 / arenas_played ELSE 0 END)'
      : (bracket === 'bgs_won'
        ? '(CASE WHEN bgs_played > 0 THEN bgs_won * 1.0 / bgs_played ELSE 0 END)'
        : 'leaderboard_rank');
    const SORT_EXPR = {
      rank: 'leaderboard_rank',
      character: 'character_name',
      player: 'display_name',
      class: 'class',
      value: bracketColumn,
      winRate: winRateExpr,
    };
    const sortExpr = SORT_EXPR[sortBy] || 'leaderboard_rank';
    // For non-rank sorts, secondary by leaderboard_rank ASC for stable order.
    const orderBy = sortBy === 'rank'
      ? `leaderboard_rank ${sortDir}`
      : `${sortExpr} ${sortDir}, leaderboard_rank ASC`;

    // Inner subquery ranks every row in the bracket. Outer query applies
    // the search filter (so AlienZombie's rank stays the same whether the
    // user is filtering or not).
    const outerWhere = unqualifiedSearch ? `WHERE ${unqualifiedSearch}` : '';
    const [entries] = await pool.execute(
      `SELECT * FROM (
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
               u.id AS user_id, u.display_name, u.username, u.avatar_url, u.\`rank\` AS user_rank, u.display_rank AS user_display_rank,
               u.discord_username,
               uc.realm AS realm, uc.is_main, uc.spec AS uc_spec,
               ROW_NUMBER() OVER (ORDER BY gms.${bracket} DESC, gm.character_name ASC) AS leaderboard_rank
         FROM guild_members gm
         JOIN guilds g ON g.id = gm.guild_id
         INNER JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
         LEFT JOIN users u ON u.id = gm.linked_user_id
         LEFT JOIN user_characters uc ON uc.id = gm.linked_character_id
         ${baseWhere}
       ) ranked
       ${outerWhere}
       ORDER BY ${orderBy}
       ${limitClause}`,
      searchParams
    );

    // Strip Discord-derived identity fields for anonymous visitors. Keeps
    // character + class/spec + rating visible (the public-interest data),
    // but hides who the human behind the toon is until the visitor logs in.
    const sanitizedEntries = isAuthed
      ? entries
      : entries.map((e) => ({
          ...e,
          user_id: null,
          display_name: null,
          username: null,
          discord_username: null,
          avatar_url: null,
          user_rank: null,
          user_display_rank: null,
        }));

    res.json({ entries: sanitizedEntries, bracket, total: countRow.total, page, pageSize, q, sortBy, sortDir: sortDir.toLowerCase(), isAuthed });
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
