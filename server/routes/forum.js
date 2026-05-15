const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requirePermission, loadUserPermissions } = require('../middleware/auth');
const { logAdminAction } = require('../services/audit-log');

const router = express.Router();

async function getOptionalActiveUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.execute(
      'SELECT id, `rank`, status FROM users WHERE id = ?',
      [decoded.id]
    );
    if (rows.length === 0 || rows[0].status !== 'active') return null;

    return {
      id: rows[0].id,
      rank: rows[0].rank,
      permissions: await loadUserPermissions(rows[0].id),
    };
  } catch (_) {
    return null;
  }
}

function hasOfficerCategoryAccess(user) {
  if (!user) return false;
  if (['officer', 'guildmaster'].includes(user.rank)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('forum.access_officer_categories');
}

// GET /api/forum/categories
router.get('/categories', async (req, res) => {
  try {
    const viewer = await getOptionalActiveUser(req);
    const whereClause = hasOfficerCategoryAccess(viewer) ? '' : 'WHERE fc.officer_only = 0';

    // Explicit column list (instead of fc.*) so a future migration that
    // adds new columns doesn't get masked by mysql2's prepared-statement
    // metadata cache — added columns silently disappear from API responses
    // until the cache invalidates. Bit me on migration-044.
    const [categories] = await pool.execute(`
      SELECT
        fc.id, fc.name, fc.description, fc.sort_order, fc.created_by, fc.created_at,
        fc.officer_only, fc.age_restricted, fc.icon, fc.accent_color, fc.banner_url,
        (SELECT COUNT(*) FROM forum_posts fp WHERE fp.category_id = fc.id) AS post_count,
        (SELECT fp2.title FROM forum_posts fp2 WHERE fp2.category_id = fc.id ORDER BY fp2.created_at DESC LIMIT 1) AS latest_post_title,
        (SELECT fp3.created_at FROM forum_posts fp3 WHERE fp3.category_id = fc.id ORDER BY fp3.created_at DESC LIMIT 1) AS latest_post_date
      FROM forum_categories fc
      ${whereClause}
      ORDER BY fc.sort_order ASC
    `);
    res.json({ categories });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/forum/search?q=term
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const viewer = await getOptionalActiveUser(req);
    const canAccessOfficer = hasOfficerCategoryAccess(viewer);

    // Escape LIKE wildcards so user input is treated as literal text
    const escaped = q.replace(/[%_\\]/g, '\\$&');
    const term = `%${escaped}%`;
    const params = [term, term, term, term, term, term, term, term, term];

    // Filter out officer-only categories for non-officers
    const rbacClause = canAccessOfficer ? '' : 'AND fc_cat.officer_only = 0';

    const [posts] = await pool.execute(`
      SELECT DISTINCT fp.id, fp.title, fp.category_id, fp.created_at, fp.view_count, fp.pinned, fp.locked,
        fp.user_id,
        u.username, u.display_name, u.\`rank\`, u.display_rank, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        fc_cat.name AS category_name,
        (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id) AS comment_count,
        COALESCE(vote_sum.net_votes, 0) AS net_votes,
        CASE
          WHEN u.username LIKE ? OR u.display_name LIKE ? THEN 'user'
          WHEN fp.title LIKE ? THEN 'title'
          WHEN fp.content LIKE ? THEN 'body'
          ELSE 'reply'
        END AS match_type
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      JOIN forum_categories fc_cat ON fc_cat.id = fp.category_id
      LEFT JOIN forum_comments fc_match ON fc_match.post_id = fp.id AND fc_match.content LIKE ?
      LEFT JOIN (
        SELECT post_id, SUM(vote) AS net_votes FROM forum_votes GROUP BY post_id
      ) vote_sum ON vote_sum.post_id = fp.id
      WHERE (fp.title LIKE ? OR fp.content LIKE ? OR fc_match.id IS NOT NULL
        OR u.username LIKE ? OR u.display_name LIKE ?)
      ${rbacClause}
      ORDER BY fp.created_at DESC
      LIMIT 50
    `, params);

    res.json({ query: q, results: posts });
  } catch (err) {
    console.error('Forum search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Validators shared by POST and PUT. Keep these tight — categories are
// rendered everywhere on the forum so a bad value here breaks the index.
function normalizeCategoryPayload(body) {
  const errors = [];
  const name = (body.name || '').trim();
  const description = (body.description || '').trim();
  const icon = body.icon == null ? null : String(body.icon).trim().slice(0, 50) || null;
  const accent = body.accent_color == null ? null : String(body.accent_color).trim();
  const banner = body.banner_url == null ? null : String(body.banner_url).trim().slice(0, 500) || null;
  const sortOrder = Number.isFinite(Number(body.sort_order ?? body.sortOrder)) ? parseInt(body.sort_order ?? body.sortOrder, 10) : 0;
  const officerOnly = body.officer_only === true || body.officer_only === 1 || body.officer_only === '1' ? 1 : 0;
  const ageRestricted = body.age_restricted === true || body.age_restricted === 1 || body.age_restricted === '1' ? 1 : 0;

  if (!name) errors.push('Category name is required');
  if (name.length > 100) errors.push('Category name must be 100 characters or fewer');
  if (description.length > 500) errors.push('Description must be 500 characters or fewer');
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) errors.push('Accent color must be #RRGGBB');

  return {
    errors,
    payload: { name, description, icon, accent_color: accent || null, banner_url: banner, sort_order: sortOrder, officer_only: officerOnly, age_restricted: ageRestricted },
  };
}

// POST /api/forum/categories
router.post('/categories', requireAuth, requirePermission('forum.manage_categories'), async (req, res) => {
  try {
    const { errors, payload } = normalizeCategoryPayload(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const [existing] = await pool.execute('SELECT id FROM forum_categories WHERE name = ?', [payload.name]);
    if (existing.length > 0) return res.status(409).json({ error: 'A category with that name already exists' });

    const [result] = await pool.execute(
      `INSERT INTO forum_categories
         (name, description, sort_order, created_by, officer_only, age_restricted, icon, accent_color, banner_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.name, payload.description, payload.sort_order, req.user.id, payload.officer_only,
       payload.age_restricted, payload.icon, payload.accent_color, payload.banner_url]
    );
    res.status(201).json({ id: result.insertId, message: 'Category created' });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/forum/categories/:id — full replace of category settings.
router.put('/categories/:id', requireAuth, requirePermission('forum.manage_categories'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid category id' });

    const { errors, payload } = normalizeCategoryPayload(req.body);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    // Block name collision against another row (the unique index would catch
    // this too but we want a friendly message, not a 500).
    const [collision] = await pool.execute(
      'SELECT id FROM forum_categories WHERE name = ? AND id != ?',
      [payload.name, id]
    );
    if (collision.length > 0) return res.status(409).json({ error: 'A category with that name already exists' });

    const [result] = await pool.execute(
      `UPDATE forum_categories
         SET name = ?, description = ?, sort_order = ?, officer_only = ?, age_restricted = ?,
             icon = ?, accent_color = ?, banner_url = ?
       WHERE id = ?`,
      [payload.name, payload.description, payload.sort_order, payload.officer_only, payload.age_restricted,
       payload.icon, payload.accent_color, payload.banner_url, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category updated' });
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/forum/categories/:id — hard delete. Posts/comments cascade
// via the existing FK ON DELETE CASCADE, which is intentional: deleting a
// category should remove its content. Add a confirmation guard in the UI.
router.delete('/categories/:id', requireAuth, requirePermission('forum.manage_categories'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid category id' });

    const [result] = await pool.execute('DELETE FROM forum_categories WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// GET /api/forum/categories/:id/posts
router.get('/categories/:id/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const allowedLimits = [10, 15, 20, 50];
    const limit = allowedLimits.includes(parseInt(req.query.limit)) ? parseInt(req.query.limit) : 20;
    const offset = (page - 1) * limit;
    const sort = req.query.sort || 'hot'; // hot, new, top
    const viewer = await getOptionalActiveUser(req);

    const [catRows] = await pool.execute(
      'SELECT * FROM forum_categories WHERE id = ?',
      [req.params.id]
    );
    if (catRows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (catRows[0].officer_only && !hasOfficerCategoryAccess(viewer)) {
      return res.status(403).json({ error: 'You do not have access to this category' });
    }

    let orderClause;
    if (sort === 'new') {
      orderClause = 'fp.pinned DESC, fp.created_at DESC';
    } else if (sort === 'top') {
      orderClause = 'fp.pinned DESC, net_votes DESC, fp.created_at DESC';
    } else {
      // Hot: Reddit-style — log(score) + age_bonus
      orderClause = 'fp.pinned DESC, (LOG10(GREATEST(ABS(COALESCE(vote_sum.net_votes, 0)) + 1, 1)) + UNIX_TIMESTAMP(fp.created_at) / 45000) DESC';
    }

    const [posts] = await pool.execute(`
      SELECT fp.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        uc_main.realm_slug AS main_realm_slug,
        (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id) AS comment_count,
        COALESCE(vote_sum.net_votes, 0) AS net_votes,
        COALESCE(vote_sum.upvotes, 0) AS upvotes,
        COALESCE(vote_sum.downvotes, 0) AS downvotes
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      LEFT JOIN (
        SELECT post_id,
          SUM(vote) AS net_votes,
          SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
          SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
        FROM forum_votes GROUP BY post_id
      ) vote_sum ON vote_sum.post_id = fp.id
      WHERE fp.category_id = ? AND fp.deleted_at IS NULL
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `, [req.params.id]);

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) AS total FROM forum_posts WHERE category_id = ? AND deleted_at IS NULL',
      [req.params.id]
    );

    res.json({
      category: catRows[0] || null,
      posts,
      sort,
      pagination: { page, limit, total: countResult[0].total, pages: Math.ceil(countResult[0].total / limit) },
    });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// POST /api/forum/posts
router.post('/posts', requireAuth, async (req, res) => {
  try {
    const { categoryId, title, content, imageUrl } = req.body;
    const cleanTitle = String(title || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    const cleanContent = String(content || '').replace(/\u0000/g, '').trim();

    if (!categoryId || !cleanTitle || !cleanContent) {
      return res.status(400).json({ error: 'categoryId, title, and content are required' });
    }
    if (cleanTitle.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }

    // Check if category is officer-only
    const [catRows] = await pool.execute('SELECT officer_only FROM forum_categories WHERE id = ?', [categoryId]);
    if (catRows.length > 0 && catRows[0].officer_only) {
      const canAccess = hasOfficerCategoryAccess(req.user);
      if (!canAccess) {
        return res.status(403).json({ error: 'You do not have permission to post in this category' });
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO forum_posts (category_id, user_id, title, content, image_url) VALUES (?, ?, ?, ?, ?)',
      [categoryId, req.user.id, cleanTitle, cleanContent, imageUrl || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Post created' });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// GET /api/forum/posts/:id
router.get('/posts/:id', async (req, res) => {
  try {
    const viewer = await getOptionalActiveUser(req);
    const viewerUserId = viewer ? viewer.id : null;
    let userVote = 0;

    const [postRows] = await pool.execute(`
      SELECT fp.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        uc_main.realm_slug AS main_realm_slug,
        fc_cat.officer_only, fc_cat.age_restricted AS category_age_restricted,
        fc_cat.name AS category_name,
        COALESCE(vote_sum.net_votes, 0) AS net_votes,
        COALESCE(vote_sum.upvotes, 0) AS upvotes,
        COALESCE(vote_sum.downvotes, 0) AS downvotes
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      JOIN forum_categories fc_cat ON fc_cat.id = fp.category_id
      LEFT JOIN (
        SELECT post_id,
          SUM(vote) AS net_votes,
          SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
          SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
        FROM forum_votes GROUP BY post_id
      ) vote_sum ON vote_sum.post_id = fp.id
      WHERE fp.id = ? AND fp.deleted_at IS NULL
    `, [req.params.id]);

    if (postRows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(viewer)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }

    // Record unique view if logged in (INSERT IGNORE skips duplicates)
    if (viewerUserId) {
      const [viewResult] = await pool.execute(
        'INSERT IGNORE INTO forum_post_views (post_id, user_id) VALUES (?, ?)',
        [req.params.id, viewerUserId]
      );
      if (viewResult.affectedRows > 0) {
        await pool.execute('UPDATE forum_posts SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);
      }
    }

    // Get current user's vote
    if (viewerUserId) {
      const [voteRows] = await pool.execute(
        'SELECT vote FROM forum_votes WHERE post_id = ? AND user_id = ?',
        [req.params.id, viewerUserId]
      );
      if (voteRows.length > 0) userVote = voteRows[0].vote;
    }

    const [comments] = await pool.execute(`
      SELECT fc.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        uc_main.realm_slug AS main_realm_slug,
        COALESCE(comment_vote_sum.net_votes, 0) AS net_votes,
        COALESCE(comment_vote_sum.upvotes, 0) AS upvotes,
        COALESCE(comment_vote_sum.downvotes, 0) AS downvotes,
        COALESCE(comment_user_vote.vote, 0) AS user_vote
      FROM forum_comments fc
      JOIN users u ON fc.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      LEFT JOIN (
        SELECT comment_id,
          SUM(vote) AS net_votes,
          SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
          SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
        FROM forum_comment_votes
        GROUP BY comment_id
      ) comment_vote_sum ON comment_vote_sum.comment_id = fc.id
      LEFT JOIN forum_comment_votes comment_user_vote
        ON comment_user_vote.comment_id = fc.id
        AND comment_user_vote.user_id = ?
      WHERE fc.post_id = ? AND fc.deleted_at IS NULL
      ORDER BY fc.created_at ASC
    `, [viewerUserId || 0, req.params.id]);

    const post = { ...postRows[0] };
    delete post.officer_only;

    res.json({ post, comments, userVote });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});
// POST /api/forum/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const [postRows] = await pool.execute(`
      SELECT fp.locked, fc.officer_only
      FROM forum_posts fp
      JOIN forum_categories fc ON fc.id = fp.category_id
      WHERE fp.id = ?
    `, [req.params.id]);
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }
    if (postRows[0].locked) return res.status(403).json({ error: 'This post is locked' });

    const { content, imageUrl } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const [result] = await pool.execute(
      'INSERT INTO forum_comments (post_id, user_id, content, image_url) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, content, imageUrl || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Comment added' });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST /api/forum/posts/:id/vote
router.post('/posts/:id/vote', requireAuth, async (req, res) => {
  try {
    const { vote } = req.body;
    if (vote !== 1 && vote !== -1 && vote !== 0) {
      return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
    }

    const postId = req.params.id;
    const userId = req.user.id;
    const [postRows] = await pool.execute(`
      SELECT fp.id, fc.officer_only
      FROM forum_posts fp
      JOIN forum_categories fc ON fc.id = fp.category_id
      WHERE fp.id = ?
    `, [postId]);
    if (postRows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }

    if (vote === 0) {
      // Remove vote
      await pool.execute('DELETE FROM forum_votes WHERE post_id = ? AND user_id = ?', [postId, userId]);
    } else {
      // Upsert vote
      await pool.execute(
        'INSERT INTO forum_votes (post_id, user_id, vote) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vote = ?',
        [postId, userId, vote, vote]
      );
    }

    // Return updated counts
    const [result] = await pool.execute(`
      SELECT
        COALESCE(SUM(vote), 0) AS net_votes,
        SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
        SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
      FROM forum_votes WHERE post_id = ?
    `, [postId]);

    res.json({
      net_votes: result[0].net_votes || 0,
      upvotes: result[0].upvotes || 0,
      downvotes: result[0].downvotes || 0,
      userVote: vote,
    });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// POST /api/forum/comments/:id/vote
router.post('/comments/:id/vote', requireAuth, async (req, res) => {
  try {
    const { vote } = req.body;
    if (vote !== 1 && vote !== -1 && vote !== 0) {
      return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
    }

    const commentId = req.params.id;
    const userId = req.user.id;

    const [commentRows] = await pool.execute(`
      SELECT fc.id, fp.id AS post_id, cat.officer_only
      FROM forum_comments fc
      JOIN forum_posts fp ON fp.id = fc.post_id
      JOIN forum_categories cat ON cat.id = fp.category_id
      WHERE fc.id = ?
    `, [commentId]);

    if (commentRows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (commentRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this comment' });
    }

    if (vote === 0) {
      await pool.execute('DELETE FROM forum_comment_votes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
    } else {
      await pool.execute(
        'INSERT INTO forum_comment_votes (comment_id, user_id, vote) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vote = ?',
        [commentId, userId, vote, vote]
      );
    }

    const [result] = await pool.execute(`
      SELECT
        COALESCE(SUM(vote), 0) AS net_votes,
        SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
        SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
      FROM forum_comment_votes
      WHERE comment_id = ?
    `, [commentId]);

    res.json({
      net_votes: result[0].net_votes || 0,
      upvotes: result[0].upvotes || 0,
      downvotes: result[0].downvotes || 0,
      userVote: vote,
    });
  } catch (err) {
    console.error('Comment vote error:', err);
    res.status(500).json({ error: 'Failed to vote on comment' });
  }
});

// POST /api/forum/posts/:id/report
router.post('/posts/:id/report', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId)) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const reasonRaw = req.body.reason;
    const reason = reasonRaw === undefined || reasonRaw === null
      ? ''
      : String(reasonRaw).trim();
    if (reason.length > 500) {
      return res.status(400).json({ error: 'Reason must be 500 characters or less' });
    }

    const [postRows] = await pool.execute(`
      SELECT fp.id, fp.user_id, fc.officer_only
      FROM forum_posts fp
      JOIN forum_categories fc ON fc.id = fp.category_id
      WHERE fp.id = ?
    `, [postId]);
    if (postRows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }
    if (Number(postRows[0].user_id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'You cannot report your own post' });
    }

    const [dupeRows] = await pool.execute(
      `SELECT id
       FROM forum_reports
       WHERE reporter_user_id = ?
         AND target_type = 'post'
         AND target_post_id = ?
         AND status IN ('open', 'reviewing')
       LIMIT 1`,
      [req.user.id, postId]
    );
    if (dupeRows.length > 0) {
      return res.status(409).json({ error: 'You already have an active report for this post' });
    }

    await pool.execute(
      `INSERT INTO forum_reports
        (reporter_user_id, target_type, target_post_id, target_user_id, reason, status)
       VALUES (?, 'post', ?, ?, ?, 'open')`,
      [req.user.id, postId, postRows[0].user_id, reason || 'No reason provided']
    );

    res.status(201).json({ message: 'Report submitted' });
  } catch (err) {
    console.error('Report post error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// POST /api/forum/comments/:id/report
router.post('/comments/:id/report', requireAuth, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId)) {
      return res.status(400).json({ error: 'Invalid comment id' });
    }

    const reasonRaw = req.body.reason;
    const reason = reasonRaw === undefined || reasonRaw === null
      ? ''
      : String(reasonRaw).trim();
    if (reason.length > 500) {
      return res.status(400).json({ error: 'Reason must be 500 characters or less' });
    }

    const [commentRows] = await pool.execute(`
      SELECT fc.id, fc.user_id, fc.post_id, cat.officer_only
      FROM forum_comments fc
      JOIN forum_posts fp ON fp.id = fc.post_id
      JOIN forum_categories cat ON cat.id = fp.category_id
      WHERE fc.id = ?
    `, [commentId]);
    if (commentRows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (commentRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this comment' });
    }
    if (Number(commentRows[0].user_id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'You cannot report your own comment' });
    }

    const [dupeRows] = await pool.execute(
      `SELECT id
       FROM forum_reports
       WHERE reporter_user_id = ?
         AND target_type = 'comment'
         AND target_comment_id = ?
         AND status IN ('open', 'reviewing')
       LIMIT 1`,
      [req.user.id, commentId]
    );
    if (dupeRows.length > 0) {
      return res.status(409).json({ error: 'You already have an active report for this comment' });
    }

    await pool.execute(
      `INSERT INTO forum_reports
        (reporter_user_id, target_type, target_post_id, target_comment_id, target_user_id, reason, status)
       VALUES (?, 'comment', ?, ?, ?, ?, 'open')`,
      [
        req.user.id,
        commentRows[0].post_id,
        commentId,
        commentRows[0].user_id,
        reason || 'No reason provided',
      ]
    );

    res.status(201).json({ message: 'Report submitted' });
  } catch (err) {
    console.error('Report comment error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// DELETE /api/forum/posts/:id — soft delete: row is moved to the recycle
// bin (deleted_at set) so admins can restore. Frontend listing endpoints
// already filter on deleted_at IS NULL via the WHERE clauses above.
router.delete('/posts/:id', requireAuth, async (req, res) => {
  try {
    const [postRows] = await pool.execute(
      'SELECT user_id FROM forum_posts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });
    const isOwner = postRows[0].user_id === req.user.id;
    const canDeleteAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_post'));
    if (!isOwner && !canDeleteAny) return res.status(403).json({ error: 'Not authorized' });

    await pool.execute(
      'UPDATE forum_posts SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, req.params.id]
    );
    if (!isOwner || canDeleteAny) {
      logAdminAction({
        adminUserId: req.user.id, actionType: 'post.delete',
        targetType: 'forum_post', targetId: parseInt(req.params.id, 10),
        summary: `Soft-deleted post #${req.params.id}`,
      });
    }
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// DELETE /api/forum/comments/:id — soft delete (see DELETE post comment above).
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT user_id FROM forum_comments WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    const isOwner = rows[0].user_id === req.user.id;
    const canDeleteAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_comment'));
    if (!isOwner && !canDeleteAny) return res.status(403).json({ error: 'Not authorized' });

    await pool.execute(
      'UPDATE forum_comments SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, req.params.id]
    );
    if (!isOwner || canDeleteAny) {
      logAdminAction({
        adminUserId: req.user.id, actionType: 'comment.delete',
        targetType: 'forum_comment', targetId: parseInt(req.params.id, 10),
        summary: `Soft-deleted comment #${req.params.id}`,
      });
    }
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// PUT /api/forum/posts/:id — edit title/content. Author can edit their own
// post; users with forum.delete_any_post can edit anyone's. Each edit
// snapshots the previous title+content into forum_post_revisions so admins
// can review the history and audit moderation rewrites.
router.put('/posts/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid post id' });

    const [[existing]] = await pool.execute(
      'SELECT id, user_id, title, content FROM forum_posts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const isOwner = existing.user_id === req.user.id;
    const canEditAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_post'));
    if (!isOwner && !canEditAny) return res.status(403).json({ error: 'Not authorized' });

    const CTRL = new RegExp('[\u0000-\u001F\u007F]', 'g');
    const cleanTitle = String(req.body.title ?? existing.title).replace(CTRL, '').trim();
    const cleanContent = String(req.body.content ?? existing.content).replace(CTRL, '').trim();
    if (!cleanTitle || !cleanContent) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    if (cleanTitle.length > 200) return res.status(400).json({ error: 'Title too long' });

    const titleChanged = cleanTitle !== existing.title;
    const contentChanged = cleanContent !== existing.content;
    if (!titleChanged && !contentChanged) return res.json({ message: 'No changes' });

    await pool.execute(
      'INSERT INTO forum_post_revisions (post_id, edited_by, previous_title, previous_content) VALUES (?, ?, ?, ?)',
      [id, req.user.id, existing.title, existing.content]
    );
    await pool.execute(
      'UPDATE forum_posts SET title = ?, content = ?, updated_at = NOW() WHERE id = ?',
      [cleanTitle, cleanContent, id]
    );

    if (!isOwner) {
      logAdminAction({
        adminUserId: req.user.id, actionType: 'post.edit',
        targetType: 'forum_post', targetId: id,
        summary: `Edited post #${id} (${titleChanged ? 'title+' : ''}${contentChanged ? 'body' : ''})`,
      });
    }
    res.json({ message: 'Post updated' });
  } catch (err) {
    console.error('Edit post error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// PUT /api/forum/posts/:id/pin
router.put('/posts/:id/pin', requireAuth, requirePermission('forum.pin_posts'), async (req, res) => {
  try {
    await pool.execute('UPDATE forum_posts SET pinned = NOT pinned WHERE id = ?', [req.params.id]);
    res.json({ message: 'Pin toggled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// PUT /api/forum/posts/:id/lock
router.put('/posts/:id/lock', requireAuth, requirePermission('forum.lock_posts'), async (req, res) => {
  try {
    await pool.execute('UPDATE forum_posts SET locked = NOT locked WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lock toggled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle lock' });
  }
});

module.exports = router;
