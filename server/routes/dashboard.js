const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard — personalized home page data for logged-in users
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch in parallel: user stats, recent forum activity, upcoming events, character count
    const [
      [postCount],
      [commentCount],
      [charCount],
      [recentPosts],
      [events],
      [announcements],
      [guildActivity],
      [guildAchievements],
    ] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS count FROM forum_posts WHERE user_id = ?', [userId]),
      pool.execute('SELECT COUNT(*) AS count FROM forum_comments WHERE user_id = ?', [userId]),
      pool.execute('SELECT COUNT(*) AS count FROM user_characters WHERE user_id = ?', [userId]),
      pool.execute(`
        SELECT fp.id, fp.title, fp.category_id, fp.created_at, fp.view_count,
          fp.content,
          fc.name AS category_name,
          u.username, u.display_name, u.avatar_url, u.\`rank\` AS user_rank,
          (SELECT COUNT(*) FROM forum_comments fc2 WHERE fc2.post_id = fp.id) AS comment_count,
          (SELECT COALESCE(SUM(vote), 0) FROM forum_votes fv WHERE fv.post_id = fp.id) AS net_votes
        FROM forum_posts fp
        JOIN forum_categories fc ON fc.id = fp.category_id
        JOIN users u ON u.id = fp.user_id
        WHERE fc.officer_only = 0
        ORDER BY fp.created_at DESC
        LIMIT 10
      `),
      pool.execute(`
        SELECT e.id, e.title,
          DATE_FORMAT(e.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
          DATE_FORMAT(e.ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
          e.timezone, e.category,
          (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS rsvp_going,
          (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe') AS rsvp_maybe,
          (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = ? LIMIT 1) AS user_rsvp_status
        FROM events e
        WHERE e.starts_at IS NOT NULL AND e.starts_at >= NOW()
        ORDER BY e.starts_at ASC
        LIMIT 5
      `, [userId]),
      pool.execute(`
        SELECT fp.id, fp.title, fp.created_at, fp.content,
          u.username, u.display_name, u.avatar_url, u.\`rank\` AS user_rank,
          (SELECT COUNT(*) FROM forum_comments fc2 WHERE fc2.post_id = fp.id) AS comment_count,
          (SELECT COALESCE(SUM(vote), 0) FROM forum_votes fv WHERE fv.post_id = fp.id) AS net_votes,
          fp.view_count
        FROM forum_posts fp
        JOIN forum_categories fc ON fc.id = fp.category_id
        JOIN users u ON u.id = fp.user_id
        WHERE fc.name = 'Guild Announcements'
        ORDER BY fp.created_at DESC
        LIMIT 5
      `),
      pool.execute(`
        SELECT ga.activity_type, ga.character_name, ga.description, ga.occurred_at
        FROM guild_activity ga
        JOIN guilds g ON g.id = ga.guild_id
        WHERE g.is_primary = TRUE
        ORDER BY ga.occurred_at DESC
        LIMIT 5
      `),
      pool.execute(`
        SELECT ga.achievement_name, ga.description, ga.completed_at
        FROM guild_achievements ga
        JOIN guilds g ON g.id = ga.guild_id
        WHERE g.is_primary = TRUE
        ORDER BY ga.completed_at DESC
        LIMIT 3
      `),
    ]);

    // Get main character ratings for dashboard stat cards
    const [mainChar] = await pool.execute(`
      SELECT uc.character_name, uc.realm, uc.class, uc.spec,
             ps.solo_shuffle, ps.arena_3v3, ps.arena_2v2, ps.rbg_rating, ps.mythic_plus_rating
      FROM user_characters uc
      LEFT JOIN pvp_stats ps ON ps.character_id = uc.id
      WHERE uc.user_id = ? AND uc.is_main = TRUE
      LIMIT 1
    `, [userId]);

    res.json({
      stats: {
        posts: postCount[0].count,
        comments: commentCount[0].count,
        characters: charCount[0].count,
        mainCharacter: mainChar[0] || null,
      },
      recentPosts,
      announcements,
      events,
      guildActivity,
      guildAchievements,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

module.exports = router;
