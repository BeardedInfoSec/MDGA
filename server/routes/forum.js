const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requirePermission, loadUserPermissions } = require('../middleware/auth');
const { logAdminAction } = require('../services/audit-log');
const { sendOfficerAlert, sendDiscordAnnouncement } = require('../bot');
const { DateTime } = require('luxon');

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

// Post URL params may be either pure numeric ("23") or the friendly form
// "23-some-title-slug". Always parse the leading digits as the post id;
// anything after the first hyphen is cosmetic.
function parsePostId(raw) {
  const m = String(raw || '').match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function hasOfficerCategoryAccess(user) {
  if (!user) return false;
  if (['officer', 'guildmaster'].includes(user.rank)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('forum.access_officer_categories');
}

// Giveaway hard-coded values — the regex and announcement channel are
// fixed for every drop now, so officers configure positions + cooldown
// only. Change here to flip every future giveaway in one edit.
const GIVEAWAY_VALID_PATTERN = '^(MDGA|MEGA)!$';
// TEST CHANNEL — flip back to 1483266989647724758 (Events) for real drops.
const GIVEAWAY_CHANNEL_ID = '1504276476634071102';

// Scheduled-publish gating (rapazzini forum #39). A non-officer viewer must
// not see a post whose publish_at is still in the future; officers can,
// rendered in muted style so they can preview/edit before the cutover.
function canSeeScheduled(user) {
  if (!user) return false;
  if (['officer', 'guildmaster'].includes(user.rank)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('forum.schedule_posts');
}
// A post is "publicly visible" when its publish_at is null, has passed,
// OR (for giveaway-enabled posts) at least one warning ping has fired.
// The warning lift lets members read the post once the bot starts hyping
// the drop, even though replies are still gated by publish_at.
const PUBLISH_FILTER_SQL = `(
  fp.publish_at IS NULL
  OR fp.publish_at <= NOW()
  OR EXISTS (
    SELECT 1 FROM giveaway_configs gc_vis
    WHERE gc_vis.post_id = fp.id
      AND JSON_LENGTH(COALESCE(gc_vis.warnings_sent, JSON_OBJECT())) > 0
  )
)`;

// GET /api/forum/categories
router.get('/categories', async (req, res) => {
  try {
    const viewer = await getOptionalActiveUser(req);
    const whereClause = hasOfficerCategoryAccess(viewer) ? '' : 'WHERE fc.officer_only = 0';

    // Explicit column list (instead of fc.*) so a future migration that
    // adds new columns doesn't get masked by mysql2's prepared-statement
    // metadata cache — added columns silently disappear from API responses
    // until the cache invalidates. Bit me on migration-044.
    const viewerIdForQuery = viewer ? viewer.id : 0;
    const [categories] = await pool.execute(`
      SELECT
        fc.id, fc.name, fc.description, fc.sort_order, fc.created_by, fc.created_at,
        fc.officer_only, fc.age_restricted, fc.officer_post_only, fc.icon, fc.accent_color, fc.banner_url,
        LOWER(REGEXP_REPLACE(REGEXP_REPLACE(fc.name, '[^A-Za-z0-9 -]', ''), ' +', '-')) AS slug,
        (SELECT COUNT(*) FROM forum_posts fp WHERE fp.category_id = fc.id AND fp.deleted_at IS NULL) AS post_count,
        (SELECT fp2.title FROM forum_posts fp2 WHERE fp2.category_id = fc.id AND fp2.deleted_at IS NULL ORDER BY fp2.created_at DESC LIMIT 1) AS latest_post_title,
        (SELECT fp3.created_at FROM forum_posts fp3 WHERE fp3.category_id = fc.id AND fp3.deleted_at IS NULL ORDER BY fp3.created_at DESC LIMIT 1) AS latest_post_date,
        CASE WHEN ? = 0 THEN 0 ELSE (
          SELECT COUNT(*)
          FROM forum_posts fp4
          LEFT JOIN forum_post_views fpv ON fpv.post_id = fp4.id AND fpv.user_id = ?
          WHERE fp4.category_id = fc.id
            AND fp4.deleted_at IS NULL
            AND (
              fpv.viewed_at IS NULL
              OR fpv.viewed_at < GREATEST(
                fp4.updated_at,
                COALESCE((SELECT MAX(fc2.created_at) FROM forum_comments fc2 WHERE fc2.post_id = fp4.id AND fc2.deleted_at IS NULL), fp4.updated_at)
              )
            )
        ) END AS unread_count
      FROM forum_categories fc
      ${whereClause}
      ORDER BY fc.sort_order ASC
    `, [viewerIdForQuery, viewerIdForQuery]);
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
        gm_main.guild_id AS main_guild_id,
        g_main.faction AS main_guild_faction,
        fc_cat.name AS category_name,
        (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.deleted_at IS NULL) AS comment_count,
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
      LEFT JOIN guild_members gm_main ON gm_main.linked_character_id = uc_main.id
      LEFT JOIN guilds g_main ON g_main.id = gm_main.guild_id
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
  const officerPostOnly = body.officer_post_only === true || body.officer_post_only === 1 || body.officer_post_only === '1' ? 1 : 0;

  if (!name) errors.push('Category name is required');
  if (name.length > 100) errors.push('Category name must be 100 characters or fewer');
  if (description.length > 500) errors.push('Description must be 500 characters or fewer');
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) errors.push('Accent color must be #RRGGBB');

  return {
    errors,
    payload: { name, description, icon, accent_color: accent || null, banner_url: banner, sort_order: sortOrder, officer_only: officerOnly, age_restricted: ageRestricted, officer_post_only: officerPostOnly },
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
         (name, description, sort_order, created_by, officer_only, age_restricted, officer_post_only, icon, accent_color, banner_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.name, payload.description, payload.sort_order, req.user.id, payload.officer_only,
       payload.age_restricted, payload.officer_post_only, payload.icon, payload.accent_color, payload.banner_url]
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
         SET name = ?, description = ?, sort_order = ?, officer_only = ?, age_restricted = ?, officer_post_only = ?,
             icon = ?, accent_color = ?, banner_url = ?
       WHERE id = ?`,
      [payload.name, payload.description, payload.sort_order, payload.officer_only, payload.age_restricted,
       payload.officer_post_only, payload.icon, payload.accent_color, payload.banner_url, id]
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

    // Accept either a numeric id or a name-derived slug. Slug normalization
    // mirrors the SELECT in /categories above so the URL the frontend emits
    // matches what the lookup expects.
    const param = String(req.params.id || '');
    const isNumeric = /^\d+$/.test(param);
    const [catRows] = await pool.execute(
      isNumeric
        ? 'SELECT * FROM forum_categories WHERE id = ?'
        : "SELECT * FROM forum_categories WHERE LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^A-Za-z0-9 -]', ''), ' +', '-')) = ? LIMIT 1",
      [isNumeric ? parseInt(param, 10) : param.toLowerCase()]
    );
    if (catRows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (catRows[0].officer_only && !hasOfficerCategoryAccess(viewer)) {
      return res.status(403).json({ error: 'You do not have access to this category' });
    }
    const resolvedCategoryId = catRows[0].id;

    let orderClause;
    if (sort === 'new') {
      orderClause = 'fp.pinned DESC, fp.created_at DESC';
    } else if (sort === 'top') {
      orderClause = 'fp.pinned DESC, net_votes DESC, fp.created_at DESC';
    } else {
      // Hot: Reddit-style — log(score) + age_bonus
      orderClause = 'fp.pinned DESC, (LOG10(GREATEST(ABS(COALESCE(vote_sum.net_votes, 0)) + 1, 1)) + UNIX_TIMESTAMP(fp.created_at) / 45000) DESC';
    }

    // last_activity = newest of post.updated_at and the most recent live
    // comment. is_unread compares that to the viewer's recorded view time.
    // Anonymous viewers always see is_unread = 0 (no per-user tracking).
    const viewerIdForQuery = viewer ? viewer.id : 0;
    const publishGate = canSeeScheduled(viewer) ? '' : `AND ${PUBLISH_FILTER_SQL}`;
    const [posts] = await pool.execute(`
      SELECT fp.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        gm_main.guild_id AS main_guild_id,
        g_main.faction AS main_guild_faction,
        uc_main.realm_slug AS main_realm_slug,
        (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.deleted_at IS NULL) AS comment_count,
        COALESCE(vote_sum.net_votes, 0) AS net_votes,
        COALESCE(vote_sum.upvotes, 0) AS upvotes,
        COALESCE(vote_sum.downvotes, 0) AS downvotes,
        GREATEST(
          fp.updated_at,
          COALESCE((SELECT MAX(fc.created_at) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.deleted_at IS NULL), fp.updated_at)
        ) AS last_activity_at,
        CASE
          WHEN ? = 0 THEN 0
          WHEN view_row.viewed_at IS NULL THEN 1
          WHEN view_row.viewed_at < GREATEST(
            fp.updated_at,
            COALESCE((SELECT MAX(fc.created_at) FROM forum_comments fc WHERE fc.post_id = fp.id AND fc.deleted_at IS NULL), fp.updated_at)
          ) THEN 1
          ELSE 0
        END AS is_unread
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      LEFT JOIN guild_members gm_main ON gm_main.linked_character_id = uc_main.id
      LEFT JOIN guilds g_main ON g_main.id = gm_main.guild_id
      LEFT JOIN (
        SELECT post_id,
          SUM(vote) AS net_votes,
          SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
          SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
        FROM forum_votes GROUP BY post_id
      ) vote_sum ON vote_sum.post_id = fp.id
      LEFT JOIN forum_post_views view_row ON view_row.post_id = fp.id AND view_row.user_id = ?
      WHERE fp.category_id = ? AND fp.deleted_at IS NULL ${publishGate}
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `, [viewerIdForQuery, viewerIdForQuery, resolvedCategoryId]);

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total FROM forum_posts fp
       WHERE category_id = ? AND deleted_at IS NULL ${publishGate}`,
      [resolvedCategoryId]
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
    const { categoryId, title, content, imageUrl, imageUrls, publishAt } = req.body;
    const cleanTitle = String(title || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    const cleanContent = String(content || '').replace(/\u0000/g, '').trim();

    if (!categoryId || !cleanTitle || !cleanContent) {
      return res.status(400).json({ error: 'categoryId, title, and content are required' });
    }
    if (cleanTitle.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }

    // Optional scheduled publish (rapazzini forum #39). Only officers /
    // forum.schedule_posts may push a future date; regular members get NULL.
    //
    // publishTimezone (optional): interprets publishAt as wall-clock time
    // in that IANA zone, so "8:30 PM" in America/New_York is preserved
    // regardless of server or viewer browser zone. Without it we fall
    // back to JS Date parsing (browser-local).
    let publishAtValue = null;
    if (publishAt) {
      let parsedMs;
      const tz = (req.body.publishTimezone || '').trim();
      if (tz) {
        const dt = DateTime.fromISO(String(publishAt).trim(), { zone: tz });
        if (!dt.isValid) return res.status(400).json({ error: 'Invalid publishAt / publishTimezone' });
        parsedMs = dt.toMillis();
        publishAtValue = dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
      } else {
        const parsed = new Date(publishAt);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: 'Invalid publishAt timestamp' });
        }
        parsedMs = parsed.getTime();
        publishAtValue = parsed.toISOString().slice(0, 19).replace('T', ' ');
      }
      if (parsedMs > Date.now() && !canSeeScheduled(req.user)) {
        return res.status(403).json({ error: 'Only officers can schedule posts for the future' });
      }
    }

    // Check category-level posting restrictions:
    //   officer_only        — fully gated; non-officers can't even see it
    //   officer_post_only   — public read/reply, only officers may start threads
    const [catRows] = await pool.execute(
      'SELECT officer_only, officer_post_only FROM forum_categories WHERE id = ?',
      [categoryId]
    );
    if (catRows.length > 0) {
      const cat = catRows[0];
      const canAccess = hasOfficerCategoryAccess(req.user);
      if (cat.officer_only && !canAccess) {
        return res.status(403).json({ error: 'You do not have permission to post in this category' });
      }
      if (cat.officer_post_only && !canAccess) {
        return res.status(403).json({ error: 'Only officers can start new threads in this category — you can still reply to existing posts.' });
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO forum_posts (category_id, user_id, title, content, image_url, publish_at) VALUES (?, ?, ?, ?, ?, ?)',
      [categoryId, req.user.id, cleanTitle, cleanContent, imageUrl || null, publishAtValue]
    );
    const newPostId = result.insertId;
    // Multi-image attachments (forum #29). The single image_url stays
    // populated above for back-compat with anything that reads the legacy
    // column; everything new reads from forum_post_images instead.
    const urls = Array.isArray(imageUrls) ? imageUrls : [];
    if (imageUrl && !urls.includes(imageUrl)) urls.unshift(imageUrl);
    const cleanUrls = urls
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter((u) => u && u.length <= 500)
      .slice(0, 10);
    if (cleanUrls.length > 0) {
      const values = cleanUrls.map((_, i) => '(?, ?, ?)').join(', ');
      const params = cleanUrls.flatMap((u, i) => [newPostId, u, i]);
      await pool.execute(`INSERT INTO forum_post_images (post_id, image_url, sort_order) VALUES ${values}`, params);
    }
    res.status(201).json({ id: newPostId, message: 'Post created' });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// GET /api/forum/posts/:id
// :id param can be either pure numeric ("11") or the friendly form
// "11-some-post-title". We always parse the leading digits as the
// authoritative post id and ignore anything after the first hyphen.
router.get('/posts/:id', async (req, res) => {
  try {
    const viewer = await getOptionalActiveUser(req);
    const viewerUserId = viewer ? viewer.id : null;
    let userVote = 0;
    const postIdMatch = String(req.params.id || '').match(/^(\d+)/);
    const postId = postIdMatch ? parseInt(postIdMatch[1], 10) : NaN;
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [postRows] = await pool.execute(`
      SELECT fp.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        gm_main.guild_id AS main_guild_id,
        g_main.faction AS main_guild_faction,
        uc_main.realm_slug AS main_realm_slug,
        fc_cat.officer_only, fc_cat.age_restricted AS category_age_restricted,
        fc_cat.name AS category_name,
        COALESCE(vote_sum.net_votes, 0) AS net_votes,
        COALESCE(vote_sum.upvotes, 0) AS upvotes,
        COALESCE(vote_sum.downvotes, 0) AS downvotes,
        (SELECT COUNT(*) FROM forum_post_revisions fpr WHERE fpr.post_id = fp.id) AS revision_count
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      LEFT JOIN guild_members gm_main ON gm_main.linked_character_id = uc_main.id
      LEFT JOIN guilds g_main ON g_main.id = gm_main.guild_id
      JOIN forum_categories fc_cat ON fc_cat.id = fp.category_id
      LEFT JOIN (
        SELECT post_id,
          SUM(vote) AS net_votes,
          SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
          SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
        FROM forum_votes GROUP BY post_id
      ) vote_sum ON vote_sum.post_id = fp.id
      WHERE fp.id = ? AND fp.deleted_at IS NULL
    `, [postId]);

    if (postRows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(viewer)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }
    // Scheduled-publish gate: hide future-dated posts from non-officers
    // UNLESS a drop-warning has already fired (members get sneak-peek
    // read access during the hype window; comments still locked until
    // publish_at — enforced in POST /comments).
    if (postRows[0].publish_at && new Date(postRows[0].publish_at) > new Date() && !canSeeScheduled(viewer)) {
      const [[warned]] = await pool.execute(
        `SELECT JSON_LENGTH(COALESCE(warnings_sent, JSON_OBJECT())) AS n
         FROM giveaway_configs WHERE post_id = ?`,
        [postId]
      );
      if (!warned || !warned.n || Number(warned.n) === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }
    }

    // Track view per (post, user) so we can compute unread state on the
    // index. INSERT bumps view_count on first view; ON DUPLICATE UPDATE
    // refreshes viewed_at so a revisit clears the unread flag.
    if (viewerUserId) {
      const [viewResult] = await pool.execute(
        `INSERT INTO forum_post_views (post_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP`,
        [postId, viewerUserId]
      );
      // mysql2 returns affectedRows=1 on insert, 2 on update (because of the
      // ON DUPLICATE clause). Only the insert bumps the public view counter.
      if (viewResult.affectedRows === 1) {
        await pool.execute('UPDATE forum_posts SET view_count = view_count + 1 WHERE id = ?', [postId]);
      }
    }

    // Get current user's vote
    if (viewerUserId) {
      const [voteRows] = await pool.execute(
        'SELECT vote FROM forum_votes WHERE post_id = ? AND user_id = ?',
        [postId, viewerUserId]
      );
      if (voteRows.length > 0) userVote = voteRows[0].vote;
    }

    const [comments] = await pool.execute(`
      SELECT fc.*, u.username, u.display_name, u.avatar_url, u.\`rank\`, u.display_rank, u.realm, u.character_name,
        u.status AS user_status,
        uc_main.character_name AS main_character_name,
        gm_main.guild_id AS main_guild_id,
        g_main.faction AS main_guild_faction,
        uc_main.realm_slug AS main_realm_slug,
        COALESCE(comment_vote_sum.net_votes, 0) AS net_votes,
        COALESCE(comment_vote_sum.upvotes, 0) AS upvotes,
        COALESCE(comment_vote_sum.downvotes, 0) AS downvotes,
        COALESCE(comment_user_vote.vote, 0) AS user_vote,
        (SELECT COUNT(*) FROM forum_comment_revisions fcr WHERE fcr.comment_id = fc.id) AS revision_count
      FROM forum_comments fc
      JOIN users u ON fc.user_id = u.id
      LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
      LEFT JOIN guild_members gm_main ON gm_main.linked_character_id = uc_main.id
      LEFT JOIN guilds g_main ON g_main.id = gm_main.guild_id
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
    `, [viewerUserId || 0, postId]);

    const post = { ...postRows[0] };
    delete post.officer_only;

    // Attach the multi-image array (forum #29). Empty array on legacy posts
    // with no images. The single image_url legacy field is also kept on the
    // post object for any old client that reads it.
    const [imgRows] = await pool.execute(
      'SELECT image_url FROM forum_post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC',
      [postId]
    );
    post.images = imgRows.map((r) => r.image_url);

    res.json({ post, comments, userVote });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});
// POST /api/forum/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const [postRows] = await pool.execute(`
      SELECT fp.locked, fp.publish_at, fc.officer_only
      FROM forum_posts fp
      JOIN forum_categories fc ON fc.id = fp.category_id
      WHERE fp.id = ?
    `, [postId]);
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (postRows[0].officer_only && !hasOfficerCategoryAccess(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }
    if (postRows[0].locked) return res.status(403).json({ error: 'This post is locked' });
    // Replies blocked until publish_at lands. On giveaway posts the lock
    // applies to EVERYONE (including officers / forum.schedule_posts
    // holders) so the kickoff message matches the actual gate. On
    // non-giveaway scheduled posts officers can still comment early
    // (e.g. for normal moderation / preview), matching prior behavior.
    if (postRows[0].publish_at && new Date(postRows[0].publish_at).getTime() > Date.now()) {
      const [[hasGiveaway]] = await pool.execute(
        'SELECT post_id FROM giveaway_configs WHERE post_id = ?',
        [postId]
      );
      if (hasGiveaway || !canSeeScheduled(req.user)) {
        return res.status(403).json({
          error: 'Replies are locked until the drop.',
          dropAt: new Date(postRows[0].publish_at).toISOString(),
        });
      }
    }

    const { content, imageUrl } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    // Check for an active giveaway config on this post. If one exists, we
    // (1) enforce the per-user rate limit before the INSERT, and (2) after
    // the INSERT, see whether this comment hits a winner slot.
    const [giveawayRows] = await pool.execute(
      'SELECT post_id, target_positions, valid_pattern, rate_limit_seconds, channel_id, winners, announced FROM giveaway_configs WHERE post_id = ?',
      [postId]
    );
    const giveaway = giveawayRows[0] || null;

    if (giveaway && giveaway.rate_limit_seconds > 0) {
      const [[recent]] = await pool.execute(
        `SELECT created_at FROM forum_comments
         WHERE post_id = ? AND user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [postId, req.user.id]
      );
      if (recent) {
        const elapsed = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
        if (elapsed < giveaway.rate_limit_seconds) {
          const wait = Math.ceil(giveaway.rate_limit_seconds - elapsed);
          return res.status(429).json({
            error: `This giveaway limits replies to once every ${giveaway.rate_limit_seconds} seconds. Try again in ${wait}s.`,
            retryAfter: wait,
          });
        }
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO forum_comments (post_id, user_id, content, image_url) VALUES (?, ?, ?, ?)',
      [postId, req.user.id, content, imageUrl || null]
    );
    const newCommentId = result.insertId;

    // Giveaway winner detection runs out-of-band so the user's POST stays
    // snappy even when a Discord round-trip is involved.
    if (giveaway) {
      setImmediate(() => checkGiveawayWinner(postId, newCommentId, giveaway, req.user).catch((err) =>
        console.error('Giveaway winner check failed:', err)
      ));
    }

    res.status(201).json({ id: newCommentId, message: 'Comment added' });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Background: after a comment lands on a giveaway-enabled post, walk the
// comment list, identify which valid comments occupy target positions,
// persist any newly-filled slot, and ping the officer channel once per
// slot (announced map prevents double-fire across restarts).
async function checkGiveawayWinner(postId, newCommentId, giveaway, actingUser) {
  let pattern;
  try {
    pattern = new RegExp(giveaway.valid_pattern);
  } catch (err) {
    console.warn(`Giveaway regex invalid for post ${postId}: ${giveaway.valid_pattern}`);
    return;
  }
  const targets = typeof giveaway.target_positions === 'string'
    ? JSON.parse(giveaway.target_positions) : giveaway.target_positions;
  const winners = typeof giveaway.winners === 'string'
    ? JSON.parse(giveaway.winners) : (giveaway.winners || {});
  const announced = typeof giveaway.announced === 'string'
    ? JSON.parse(giveaway.announced) : (giveaway.announced || {});

  // Pull every live comment in chronological order with author identity
  // attached so the announcement embed can name the winner properly.
  // excluded_from_giveaway is 1 when the author can manage giveaway configs
  // (officer/GM rank OR any role granting forum.manage_giveaway) — those
  // commenters land on the thread normally but do NOT tick the counter,
  // so the website guru can post "MDGA!" to test without consuming slots.
  const [comments] = await pool.execute(
    `SELECT fc.id, fc.content, fc.user_id, fc.created_at,
            u.username, u.display_name, u.discord_id, u.discord_username,
            uc_main.character_name AS main_character_name,
            (u.\`rank\` IN ('officer','guildmaster') OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN role_permissions rp ON rp.role_id = ur.role_id
              JOIN permissions p ON p.id = rp.permission_id
              WHERE ur.user_id = u.id AND p.key_name = 'forum.manage_giveaway'
            )) AS excluded_from_giveaway
     FROM forum_comments fc
     JOIN users u ON u.id = fc.user_id
     LEFT JOIN user_characters uc_main ON uc_main.user_id = u.id AND uc_main.is_main = TRUE
     WHERE fc.post_id = ? AND fc.deleted_at IS NULL
     ORDER BY fc.created_at ASC, fc.id ASC`,
    [postId]
  );

  // Look up the post title (for the friendly URL slug + embed title) and
  // first attached image (so Discord shows the prize inline, same as the
  // kickoff message).
  const [[postMeta]] = await pool.execute(
    'SELECT title, image_url FROM forum_posts WHERE id = ?',
    [postId]
  );
  const postTitle = postMeta?.title || `#${postId}`;
  const slug = String(postTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const postPath = slug ? `${postId}-${slug}` : `${postId}`;
  // Up to 4 images for the winner embed gallery (same trick as kickoff).
  let postImages = [];
  const [imgRows] = await pool.execute(
    'SELECT image_url FROM forum_post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC LIMIT 4',
    [postId]
  );
  if (imgRows.length > 0) {
    postImages = imgRows.map((r) => r.image_url);
  } else if (postMeta?.image_url) {
    postImages = [postMeta.image_url];
  }
  const postUrl = `https://mdga.gg/forum/post/${postPath}`;

  let validIdx = 0;
  let dirty = false;
  const newlyAnnounced = [];
  for (const c of comments) {
    if (!pattern.test(c.content)) continue;
    if (c.excluded_from_giveaway) continue; // officers + giveaway managers don't tick the counter
    validIdx += 1;
    if (!targets.includes(validIdx)) continue;
    const key = String(validIdx);
    if (winners[key]) continue; // already recorded
    winners[key] = c.id;
    dirty = true;
    newlyAnnounced.push({ position: validIdx, comment: c });
  }

  if (dirty) {
    await pool.execute(
      `UPDATE giveaway_configs
       SET winners = ?
       WHERE post_id = ?`,
      [JSON.stringify(winners), postId]
    );
  }

  // Announce each freshly-filled slot exactly once. The announced map is
  // updated alongside the Discord send so a bot outage during the send
  // doesn't permanently mark the slot as already-announced.
  for (const win of newlyAnnounced) {
    const key = String(win.position);
    if (announced[key]) continue;
    const author = win.comment;
    const label = author.main_character_name || author.display_name || author.username;
    const discordTag = author.discord_username ? ` (Discord: ${author.discord_username})` : '';
    const mention = author.discord_id ? ` <@${author.discord_id}>` : '';
    try {
      const sent = await sendDiscordAnnouncement(
        giveaway.channel_id,
        `Giveaway winner — slot #${win.position}: ${postTitle}`,
        [
          `**Winner:** ${label}${discordTag}${mention}`,
          `**Slot:** ${win.position}`,
          `**Comment:** ${author.content.slice(0, 200)}`,
          ``,
          postUrl,
        ].join('\n'),
        0xD4AF37,
        { imageUrls: postImages, galleryUrl: postUrl }
      );
      if (sent) announced[key] = 1;
    } catch (err) {
      console.error(`Failed to announce giveaway winner for slot ${win.position}:`, err.message);
    }
  }
  if (Object.keys(announced).length > 0) {
    await pool.execute(
      `UPDATE giveaway_configs SET announced = ? WHERE post_id = ?`,
      [JSON.stringify(announced), postId]
    );
  }
}

// POST /api/forum/posts/:id/vote
router.post('/posts/:id/vote', requireAuth, async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const { vote } = req.body;
    if (vote !== 1 && vote !== -1 && vote !== 0) {
      return res.status(400).json({ error: 'Vote must be 1, -1, or 0' });
    }

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
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
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
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const [postRows] = await pool.execute(
      'SELECT user_id FROM forum_posts WHERE id = ? AND deleted_at IS NULL',
      [postId]
    );
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });
    const isOwner = postRows[0].user_id === req.user.id;
    const canDeleteAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_post'));
    if (!isOwner && !canDeleteAny) return res.status(403).json({ error: 'Not authorized' });

    await pool.execute(
      'UPDATE forum_posts SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, postId]
    );
    if (!isOwner || canDeleteAny) {
      logAdminAction({
        adminUserId: req.user.id, actionType: 'post.delete',
        targetType: 'forum_post', targetId: parseInt(postId, 10),
        summary: `Soft-deleted post #${postId}`,
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
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const id = parseInt(postId, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid post id' });

    const [[existing]] = await pool.execute(
      'SELECT id, user_id, title, content, publish_at FROM forum_posts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const isOwner = existing.user_id === req.user.id;
    const canEditAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_post'));
    if (!isOwner && !canEditAny) return res.status(403).json({ error: 'Not authorized' });

    // Title: strip ALL control chars (single-line, no newlines allowed).
    // Content: strip control chars EXCEPT tab/newline/carriage-return so
    // paragraph breaks survive the round-trip.
    const TITLE_CTRL_RE = new RegExp('[\u0000-\u001F\u007F]', 'g');
    const CONTENT_CTRL_RE = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', 'g');
    const cleanTitle = String(req.body.title ?? existing.title).replace(TITLE_CTRL_RE, '').trim();
    const cleanContent = String(req.body.content ?? existing.content).replace(CONTENT_CTRL_RE, '').trim();
    if (!cleanTitle || !cleanContent) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    if (cleanTitle.length > 200) return res.status(400).json({ error: 'Title too long' });

    const titleChanged = cleanTitle !== existing.title;
    const contentChanged = cleanContent !== existing.content;

    // Optional schedule update — officers / forum.schedule_posts only.
    // Three states the client can send:
    //   undefined  -> don't touch publish_at (legacy edit, body-only)
    //   null/empty -> clear publish_at (publish immediately, also clears
    //                  the deferred-kickoff lock so the scheduler fires
    //                  the announcement next tick)
    //   string     -> new local wall-clock; needs publishTimezone too
    const wantsScheduleUpdate = Object.prototype.hasOwnProperty.call(req.body, 'publishAt');
    let newPublishAtSql = undefined;
    if (wantsScheduleUpdate) {
      if (!canSeeScheduled(req.user)) {
        return res.status(403).json({ error: 'Not authorized to change publish time' });
      }
      if (req.body.publishAt === null || req.body.publishAt === '') {
        newPublishAtSql = null;
      } else {
        const tz = (req.body.publishTimezone || '').trim();
        if (tz) {
          const dt = DateTime.fromISO(String(req.body.publishAt).trim(), { zone: tz });
          if (!dt.isValid) return res.status(400).json({ error: 'Invalid publishAt / publishTimezone' });
          newPublishAtSql = dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
        } else {
          const parsed = new Date(req.body.publishAt);
          if (Number.isNaN(parsed.getTime())) {
            return res.status(400).json({ error: 'Invalid publishAt' });
          }
          newPublishAtSql = parsed.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
    }
    const scheduleChanged = wantsScheduleUpdate && String(newPublishAtSql || '') !== String(existing.publish_at || '').slice(0, 19).replace('T', ' ');

    if (!titleChanged && !contentChanged && !scheduleChanged) return res.json({ message: 'No changes' });

    if (titleChanged || contentChanged) {
      await pool.execute(
        'INSERT INTO forum_post_revisions (post_id, edited_by, previous_title, previous_content) VALUES (?, ?, ?, ?)',
        [id, req.user.id, existing.title, existing.content]
      );
    }
    if (wantsScheduleUpdate) {
      await pool.execute(
        'UPDATE forum_posts SET title = ?, content = ?, publish_at = ?, updated_at = NOW() WHERE id = ?',
        [cleanTitle, cleanContent, newPublishAtSql, id]
      );
      // Reset kickoff/warning state so the scheduler can re-announce
      // against the new publish moment. (No-op if no giveaway config.)
      await pool.execute(
        `UPDATE giveaway_configs
         SET kickoff_announced_at = NULL, warnings_sent = JSON_OBJECT()
         WHERE post_id = ?`,
        [id]
      );
    } else {
      await pool.execute(
        'UPDATE forum_posts SET title = ?, content = ?, updated_at = NOW() WHERE id = ?',
        [cleanTitle, cleanContent, id]
      );
    }

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

// PUT /api/forum/comments/:id — edit a reply. Author can edit their own;
// users with forum.delete_any_comment can edit anyone's. Each edit snapshots
// the previous content into forum_comment_revisions so officers can audit.
router.put('/comments/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid comment id' });

    const [[existing]] = await pool.execute(
      'SELECT id, user_id, content FROM forum_comments WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Comment not found' });

    const isOwner = existing.user_id === req.user.id;
    const canEditAny = req.user.rank === 'guildmaster' ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_comment'));
    if (!isOwner && !canEditAny) return res.status(403).json({ error: 'Not authorized' });

    // Match the post-edit cleanup rules: strip control chars but preserve
    // tabs/newlines so paragraphs survive the round-trip.
    const CONTENT_CTRL_RE = new RegExp('[ --]', 'g');
    const cleanContent = String(req.body.content ?? existing.content).replace(CONTENT_CTRL_RE, '').trim();
    if (!cleanContent) return res.status(400).json({ error: 'Content is required' });
    if (cleanContent === existing.content) return res.json({ message: 'No changes' });

    await pool.execute(
      'INSERT INTO forum_comment_revisions (comment_id, edited_by, previous_content) VALUES (?, ?, ?)',
      [id, req.user.id, existing.content]
    );
    await pool.execute(
      'UPDATE forum_comments SET content = ?, updated_at = NOW() WHERE id = ?',
      [cleanContent, id]
    );

    if (!isOwner) {
      logAdminAction({
        adminUserId: req.user.id, actionType: 'comment.edit',
        targetType: 'forum_comment', targetId: id,
        summary: `Edited comment #${id}`,
      });
    }
    res.json({ message: 'Comment updated' });
  } catch (err) {
    console.error('Edit comment error:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// GET /api/forum/comments/:id/revisions — officer-only audit of a comment's
// edit history. Mirrors the post equivalent under /api/admin.
router.get('/comments/:id/revisions', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid comment id' });
    const isOfficer = ['officer', 'guildmaster'].includes(req.user.rank) ||
      (req.user.permissions && req.user.permissions.includes('forum.delete_any_comment'));
    if (!isOfficer) return res.status(403).json({ error: 'Not authorized' });
    const [rows] = await pool.execute(
      `SELECT r.id, r.comment_id, r.edited_by, r.previous_content, r.edited_at,
              u.username, u.display_name
       FROM forum_comment_revisions r
       LEFT JOIN users u ON u.id = r.edited_by
       WHERE r.comment_id = ?
       ORDER BY r.edited_at DESC`,
      [id]
    );
    res.json({ revisions: rows });
  } catch (err) {
    console.error('Get comment revisions error:', err);
    res.status(500).json({ error: 'Failed to load revisions' });
  }
});

// PUT /api/forum/posts/:id/pin
router.put('/posts/:id/pin', requireAuth, requirePermission('forum.pin_posts'), async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    await pool.execute('UPDATE forum_posts SET pinned = NOT pinned WHERE id = ?', [postId]);
    res.json({ message: 'Pin toggled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// PUT /api/forum/posts/:id/lock
router.put('/posts/:id/lock', requireAuth, requirePermission('forum.lock_posts'), async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    await pool.execute('UPDATE forum_posts SET locked = NOT locked WHERE id = ?', [postId]);
    res.json({ message: 'Lock toggled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle lock' });
  }
});


// POST /api/forum/categories/:id/mark-read — upsert a viewed_at = NOW() for
// every live post in the category, so the unread dot / category badge
// clears in one action (rapazzini follow-up: requiring users to click
// every post to clear unread isn't workable). Accepts numeric id only;
// slugs aren't worth supporting here since this is always triggered from
// a page that already has the resolved category id.
//
// Pass '0' or 'all' for the id to clear unread across every category the
// user can access (forum index Mark-all-read button).
router.post('/categories/:id/mark-read', requireAuth, async (req, res) => {
  try {
    const param = String(req.params.id || '');
    const isGlobal = param === '0' || param.toLowerCase() === 'all';
    const canAccessOfficer = hasOfficerCategoryAccess(req.user);
    const officerClause = canAccessOfficer ? '' : 'AND fc.officer_only = 0';

    let where, params;
    if (isGlobal) {
      where = 'WHERE fp.deleted_at IS NULL ' + officerClause;
      params = [];
    } else {
      const id = parseInt(param, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid category id' });
      }
      where = 'WHERE fp.category_id = ? AND fp.deleted_at IS NULL ' + officerClause;
      params = [id];
    }

    // Single round-trip: insert a view row for every post the user can see
    // in scope. ON DUPLICATE refreshes viewed_at on existing rows. We don't
    // bump fp.view_count here — that counter tracks first-time visits, not
    // bulk dismissals.
    const [result] = await pool.execute(
      `INSERT INTO forum_post_views (post_id, user_id, viewed_at)
       SELECT fp.id, ?, NOW()
       FROM forum_posts fp
       JOIN forum_categories fc ON fc.id = fp.category_id
       ${where}
       ON DUPLICATE KEY UPDATE viewed_at = NOW()`,
      [req.user.id, ...params]
    );
    res.json({ marked: result.affectedRows });
  } catch (err) {
    console.error('Mark category read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ── Giveaway config (forum #29-followup: automate "first / Nth comment wins") ──
// Officer / forum.manage_giveaway sets a per-post config; the comment
// creation route (above) checks for it and marks winners + announces.

function canManageGiveaway(user) {
  if (!user) return false;
  if (['officer', 'guildmaster'].includes(user.rank)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('forum.manage_giveaway');
}

function parsePositions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return raw.split(',').map((s) => parseInt(s.trim(), 10));
  }
  return [];
}

// GET /api/forum/posts/:id/giveaway — read config + winner state. Public
// read so officers can poll from the modal without re-auth bouncing; the
// only thing returned is metadata, no PII.
router.get('/posts/:id/giveaway', async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const [rows] = await pool.execute(
      'SELECT post_id, target_positions, valid_pattern, rate_limit_seconds, warning_minutes, channel_id, winners, announced, kickoff_announced_at, created_at, updated_at FROM giveaway_configs WHERE post_id = ?',
      [postId]
    );
    if (rows.length === 0) return res.json({ config: null });
    const r = rows[0];
    res.json({
      config: {
        post_id: r.post_id,
        target_positions: typeof r.target_positions === 'string' ? JSON.parse(r.target_positions) : r.target_positions,
        valid_pattern: r.valid_pattern,
        rate_limit_seconds: r.rate_limit_seconds,
        warning_minutes: typeof r.warning_minutes === 'string' ? JSON.parse(r.warning_minutes) : (r.warning_minutes || []),
        channel_id: r.channel_id,
        kickoff_announced_at: r.kickoff_announced_at,
        winners: typeof r.winners === 'string' ? JSON.parse(r.winners) : r.winners,
        announced: typeof r.announced === 'string' ? JSON.parse(r.announced) : r.announced,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
    });
  } catch (err) {
    console.error('Get giveaway error:', err);
    res.status(500).json({ error: 'Failed to load giveaway config' });
  }
});

// PUT /api/forum/posts/:id/giveaway — upsert config. Validates the regex
// before saving so a typo can't crash the comment hook later.
router.put('/posts/:id/giveaway', requireAuth, async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    if (!canManageGiveaway(req.user)) return res.status(403).json({ error: 'Not authorized' });

    const [[exists]] = await pool.execute('SELECT id FROM forum_posts WHERE id = ? AND deleted_at IS NULL', [postId]);
    if (!exists) return res.status(404).json({ error: 'Post not found' });

    const positions = parsePositions(req.body.target_positions);
    const cleanPositions = positions
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 100000);
    if (cleanPositions.length === 0) {
      return res.status(400).json({ error: 'At least one valid target position is required (positive integer).' });
    }
    const dedupSorted = Array.from(new Set(cleanPositions)).sort((a, b) => a - b);

    // Pattern + channel are now hard-coded server-side (see constants at
    // top of this file). The PUT route ignores whatever the client sends
    // for these — officers only configure positions + cooldown via the UI.
    const validPattern = GIVEAWAY_VALID_PATTERN;
    const channelId = GIVEAWAY_CHANNEL_ID;

    const rateLimitSeconds = Math.max(0, Math.min(3600, parseInt(req.body.rate_limit_seconds, 10) || 0));

    // Drop hype warnings: array of minutes-before-publish_at to fire a
    // Discord ping. Sanitized to integers in [1, 1440] (max 24h ahead),
    // deduped, sorted descending so the biggest warning fires first.
    const rawWarnings = Array.isArray(req.body.warning_minutes) ? req.body.warning_minutes : [];
    const cleanWarnings = Array.from(new Set(
      rawWarnings
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= 1440)
    )).sort((a, b) => b - a);

    // Detect whether this is the first config save for the post so we
    // only fire the "giveaway started" announcement once. Subsequent
    // edits (e.g. fixing the channel ID or extending positions) should
    // not re-announce.
    const [[existingCfg]] = await pool.execute(
      'SELECT post_id FROM giveaway_configs WHERE post_id = ?',
      [postId]
    );
    const isNewConfig = !existingCfg;

    await pool.execute(
      `INSERT INTO giveaway_configs (post_id, target_positions, valid_pattern, rate_limit_seconds, warning_minutes, channel_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         target_positions = VALUES(target_positions),
         valid_pattern = VALUES(valid_pattern),
         rate_limit_seconds = VALUES(rate_limit_seconds),
         warning_minutes = VALUES(warning_minutes),
         channel_id = VALUES(channel_id)`,
      [postId, JSON.stringify(dedupSorted), validPattern, rateLimitSeconds, JSON.stringify(cleanWarnings), channelId, req.user.id]
    );

    // Kickoff announcement (forum giveaway followup). Posts to the same
    // channel that winners will land in, so members see "drop started"
    // and "slot N filled" in the same conversation.
    //
    // For scheduled posts (publish_at in the future), defer the kickoff
    // to the publish moment — sending "Giveaway started" while the post
    // is still hidden would confuse anyone who clicks the link.
    const [[postSchedRow]] = await pool.execute(
      'SELECT publish_at FROM forum_posts WHERE id = ?',
      [postId]
    );
    const publishInFuture = postSchedRow?.publish_at && new Date(postSchedRow.publish_at).getTime() > Date.now();
    if (publishInFuture) {
      // Scheduler picks it up when publish_at is reached.
      await pool.execute(
        'UPDATE giveaway_configs SET kickoff_announced_at = NULL WHERE post_id = ?',
        [postId]
      );
    } else if (isNewConfig) {
      // Treat as kickoff-now even on edit-then-save-fresh by stamping
      // kickoff_announced_at when we actually fire the embed below.
    }

    if (isNewConfig && !publishInFuture) {
      const [[postRow]] = await pool.execute(
        'SELECT id, title, content, image_url FROM forum_posts WHERE id = ?',
        [postId]
      );
      // Pull up to 4 attached images (Discord renders that many as a
      // grouped gallery when embeds share a URL). multi-image table wins;
      // falls back to the legacy single image_url field.
      let postImages = [];
      if (postRow) {
        const [imgRows] = await pool.execute(
          'SELECT image_url FROM forum_post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC LIMIT 4',
          [postId]
        );
        if (imgRows.length > 0) {
          postImages = imgRows.map((r) => r.image_url);
        } else if (postRow.image_url) {
          postImages = [postRow.image_url];
        }
      }
      if (postRow) {
        // Build the friendly /forum/post/<id>-<slug> URL the same way the
        // frontend does (utils/forumUrls.slugifyTitle) so Discord readers
        // see "46-mdga-mousepad-drop" instead of a bare "/forum/post/46".
        const slug = String(postRow.title || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80);
        const postPath = slug ? `${postId}-${slug}` : `${postId}`;

        // Best-effort: pull literal alternations out of the regex so we
        // can show "MDGA!" / "MEGA!" instead of leaking the raw pattern
        // to non-technical Discord readers. Anything fancier than
        // ^(a|b|c)<optional suffix>$ falls through to a generic prompt.
        const altMatch = validPattern.match(/^\^\(([^)]+)\)([^()]*)\$$/);
        let replyHint;
        if (altMatch) {
          const alts = altMatch[1].split('|').map((a) => `\`${a}${altMatch[2] || ''}\``);
          replyHint = `Reply with ${alts.join(' or ')} to enter.`;
        } else {
          replyHint = 'See the post for entry rules.';
        }
        const cooldownNote = rateLimitSeconds > 0
          ? ` Replies are rate-limited to once every ${Math.round(rateLimitSeconds / 60)} minute(s) per account.`
          : '';
        const slotPhrase = dedupSorted.length === 1
          ? `Comment **#${dedupSorted[0]}** wins.`
          : `Comments at positions **${dedupSorted.join(', ')}** win.`;
        const postUrl = `https://mdga.gg/forum/post/${postPath}`;
        // The post body carries the full rules / prize description —
        // bring it into the Discord embed so members don't have to click
        // through to read what they're entering for. Markdown survives
        // Discord's renderer; we just strip horizontal-rule lines (---)
        // which Discord shows literally, and cap to 3500 chars to leave
        // room for the trailing call-to-action + link.
        const bodyForDiscord = String(postRow.content || '')
          .replace(/^\s*---+\s*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 3500);
        const summaryLine = `${slotPhrase} ${replyHint}${cooldownNote}`;
        const description = [
          bodyForDiscord,
          bodyForDiscord ? '' : null,
          `**${summaryLine}**`,
          postUrl,
        ].filter((s) => s !== null).join('\n');
        setImmediate(async () => {
          const sent = await sendDiscordAnnouncement(
            channelId,
            `Giveaway started: ${postRow.title}`,
            description,
            0xD4AF37,
            { imageUrls: postImages, galleryUrl: postUrl }
          ).catch((err) => { console.error('Giveaway kickoff announcement failed:', err.message); return false; });
          if (sent) {
            await pool.execute('UPDATE giveaway_configs SET kickoff_announced_at = NOW() WHERE post_id = ?', [postId])
              .catch(() => {});
          }
        });
      }
    }

    res.json({ message: 'Giveaway config saved', target_positions: dedupSorted, announced_start: isNewConfig });
  } catch (err) {
    console.error('Save giveaway error:', err);
    res.status(500).json({ error: 'Failed to save giveaway config' });
  }
});

// DELETE /api/forum/posts/:id/giveaway — remove giveaway config (does not
// touch any comments or already-awarded winners, just stops future ticks).
router.delete('/posts/:id/giveaway', requireAuth, async (req, res) => {
  try {
    const postId = parsePostId(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    if (!canManageGiveaway(req.user)) return res.status(403).json({ error: 'Not authorized' });
    await pool.execute('DELETE FROM giveaway_configs WHERE post_id = ?', [postId]);
    res.json({ message: 'Giveaway disabled' });
  } catch (err) {
    console.error('Delete giveaway error:', err);
    res.status(500).json({ error: 'Failed to disable giveaway' });
  }
});


// ────────────────────────────────────────────────────────────────────
// Giveaway scheduler: fires drop-warning + deferred-kickoff Discord
// messages for scheduled giveaway posts. Runs every 60s, picks up any
// (post + giveaway) pair where:
//   - publish_at is in the future and a warning_minutes interval has
//     elapsed without warnings_sent[interval] being set, OR
//   - publish_at is at/past now and kickoff_announced_at is NULL
// Both paths update the row before sending Discord so a crash mid-send
// doesn't fire the same message twice on next tick.
// ────────────────────────────────────────────────────────────────────

async function processGiveawaySchedule() {
  try {
    const [rows] = await pool.execute(
      `SELECT gc.post_id, gc.target_positions, gc.valid_pattern, gc.rate_limit_seconds,
              gc.warning_minutes, gc.warnings_sent, gc.kickoff_announced_at, gc.channel_id,
              fp.title, fp.content, fp.publish_at, fp.image_url
       FROM giveaway_configs gc
       JOIN forum_posts fp ON fp.id = gc.post_id
       WHERE fp.deleted_at IS NULL
         AND (
           gc.kickoff_announced_at IS NULL
           OR (fp.publish_at IS NOT NULL AND fp.publish_at > NOW() AND JSON_LENGTH(gc.warning_minutes) > 0)
         )`
    );

    for (const row of rows) {
      const publishMs = row.publish_at ? new Date(row.publish_at).getTime() : null;
      const channelId = row.channel_id || GIVEAWAY_CHANNEL_ID;
      const warnings = typeof row.warning_minutes === 'string'
        ? JSON.parse(row.warning_minutes) : (row.warning_minutes || []);
      const sentMap = typeof row.warnings_sent === 'string'
        ? JSON.parse(row.warnings_sent) : (row.warnings_sent || {});

      // Build the friendly post URL once per row.
      const slug = String(row.title || '')
        .toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const postUrl = `https://mdga.gg/forum/post/${slug ? `${row.post_id}-${slug}` : row.post_id}`;

      // Fetch images for both warnings + kickoff (Discord renders up to 4).
      const [imgRows] = await pool.execute(
        'SELECT image_url FROM forum_post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC LIMIT 4',
        [row.post_id]
      );
      let postImages = imgRows.map((r) => r.image_url);
      if (postImages.length === 0 && row.image_url) postImages = [row.image_url];

      // ── Drop-hint warnings ──
      if (publishMs && publishMs > Date.now()) {
        for (const minutes of warnings) {
          const key = String(minutes);
          if (sentMap[key]) continue;
          const fireAt = publishMs - minutes * 60 * 1000;
          if (Date.now() < fireAt) continue;

          const minsLeft = Math.max(1, Math.round((publishMs - Date.now()) / 60000));
          const sent = await sendDiscordAnnouncement(
            channelId,
            `Drop incoming: ${row.title}`,
            [
              `**${minsLeft} minute${minsLeft === 1 ? '' : 's'}** until the drop. Get ready.`,
              ``,
              postUrl,
            ].join('\n'),
            0xB91C1C, // red — feels like a countdown
            { imageUrls: postImages, galleryUrl: postUrl }
          ).catch((err) => { console.error(`Drop warning send failed (post ${row.post_id}, ${minutes}m):`, err.message); return false; });

          if (sent) {
            sentMap[key] = 1;
            await pool.execute(
              'UPDATE giveaway_configs SET warnings_sent = ? WHERE post_id = ?',
              [JSON.stringify(sentMap), row.post_id]
            );
          }
        }
      }

      // ── Deferred kickoff ──
      if (!row.kickoff_announced_at && publishMs && Date.now() >= publishMs) {
        const targets = typeof row.target_positions === 'string'
          ? JSON.parse(row.target_positions) : row.target_positions;
        const altMatch = String(row.valid_pattern || '').match(/^\^\(([^)]+)\)([^()]*)\$$/);
        let replyHint;
        if (altMatch) {
          const alts = altMatch[1].split('|').map((a) => `\`${a}${altMatch[2] || ''}\``);
          replyHint = `Reply with ${alts.join(' or ')} to enter.`;
        } else {
          replyHint = 'See the post for entry rules.';
        }
        const cooldownNote = row.rate_limit_seconds > 0
          ? ` Replies are rate-limited to once every ${Math.round(row.rate_limit_seconds / 60)} minute(s) per account.`
          : '';
        const slotPhrase = targets.length === 1
          ? `Comment **#${targets[0]}** wins.`
          : `Comments at positions **${targets.join(', ')}** win.`;
        const bodyForDiscord = String(row.content || '')
          .replace(/^\s*---+\s*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 3500);
        const description = [
          bodyForDiscord,
          bodyForDiscord ? '' : null,
          `**${slotPhrase} ${replyHint}${cooldownNote}**`,
          postUrl,
        ].filter((s) => s !== null).join('\n');

        const sent = await sendDiscordAnnouncement(
          channelId,
          `Giveaway started: ${row.title}`,
          description,
          0xD4AF37,
          { imageUrls: postImages, galleryUrl: postUrl }
        ).catch((err) => { console.error(`Deferred kickoff failed (post ${row.post_id}):`, err.message); return false; });

        if (sent) {
          await pool.execute(
            'UPDATE giveaway_configs SET kickoff_announced_at = NOW() WHERE post_id = ?',
            [row.post_id]
          );
        }
      }
    }
  } catch (err) {
    console.error('[Giveaway scheduler] cycle error:', err.message);
  }
}

// Kick the scheduler 30s after boot (lets DB pool warm up) then every 60s.
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    processGiveawaySchedule();
    setInterval(processGiveawaySchedule, 60 * 1000);
  }, 30 * 1000);
}

module.exports = router;
