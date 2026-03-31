const express = require('express');
const pool = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];
const USER_RANKS = ['recruit', 'member', 'veteran', 'officer', 'guildmaster'];
const USER_STATUSES = ['pending_discord', 'pending_approval', 'active', 'suspended', 'rejected'];
const USER_REPORT_SORTS = new Set([
  'created_at',
  'posts',
  'comments',
  'views',
  'characters',
  'top_rating',
  'open_violation_reports',
  'last_activity_at',
  'last_seen_at',
]);
const ACTIVITY_RANGE_PRESETS = new Map([
  ['24h', 1],
  ['7d', 7],
  ['14d', 14],
  ['30d', 30],
  ['60d', 60],
  ['90d', 90],
]);
const USER_REPORT_PRESET_ACTIVITY_RANGES = new Set([
  '24h',
  '7d',
  '14d',
  '30d',
  '60d',
  '90d',
  'all',
  'custom',
]);
const GUILD_GAP_LINK_STATES = new Set([
  'needs_discord',
  'no_site_account',
  'no_discord_link',
  'discord_not_active',
  'linked_active',
  'all',
]);
const USER_REPORT_VIEWS = new Set([
  'member_activity',
  'guild_discord_gaps',
]);
const GUILD_GAP_SORTS = new Set([
  'character_name',
  'guild_rank',
  'level',
  'link_state',
  'site_status',
  'last_guild_activity_at',
  'last_site_seen_at',
  'overall_last_seen_at',
  'top_rating',
]);
const DEFAULT_USER_REPORT_LIMIT = 100;
const DEFAULT_GUILD_GAP_LIMIT = 200;
const MAX_REPORT_ROWS = 500;
const MAX_EXPORT_ROWS = 5000;
const LAST_SEEN_EXPR = `GREATEST(
  IFNULL(fp.last_post_at, '1000-01-01'),
  IFNULL(fc.last_comment_at, '1000-01-01'),
  IFNULL(uc.last_character_login_at, '1000-01-01')
)`;
const GUILD_GAP_LAST_SITE_SEEN_EXPR = `GREATEST(
  IFNULL(fp.last_post_at, '1000-01-01'),
  IFNULL(fc.last_comment_at, '1000-01-01'),
  IFNULL(uca.last_character_login_at, '1000-01-01')
)`;
const GUILD_GAP_LAST_SEEN_EXPR = `GREATEST(
  IFNULL(ga.last_guild_activity_at, '1000-01-01'),
  ${GUILD_GAP_LAST_SITE_SEEN_EXPR}
)`;
const GUILD_GAP_LINK_STATE_EXPR = `CASE
  WHEN gm.linked_user_id IS NULL THEN 'no_site_account'
  WHEN u.discord_id IS NULL OR u.discord_id = '' THEN 'no_discord_link'
  WHEN u.status <> 'active' THEN 'discord_not_active'
  ELSE 'linked_active'
END`;

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function toSqlDateTime(date) {
  const iso = date.toISOString().slice(0, 19);
  return iso.replace('T', ' ');
}

function parseDateTimeParam(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveActivityWindow(rangeValue, customFromRaw, customToRaw) {
  const range = String(rangeValue || 'all').trim().toLowerCase();
  const now = new Date();

  if (ACTIVITY_RANGE_PRESETS.has(range)) {
    const days = ACTIVITY_RANGE_PRESETS.get(range);
    const from = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return {
      from: toSqlDateTime(from),
      to: toSqlDateTime(now),
      appliedRange: range,
    };
  }

  if (range === 'custom') {
    const customFrom = parseDateTimeParam(customFromRaw);
    const customTo = parseDateTimeParam(customToRaw);
    return {
      from: customFrom ? toSqlDateTime(customFrom) : null,
      to: customTo ? toSqlDateTime(customTo) : null,
      appliedRange: 'custom',
    };
  }

  return { from: null, to: null, appliedRange: 'all' };
}

function sanitizeDateTimeLocal(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : raw;
}

function parseBoolParam(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function normalizeUserReportPresetFilters(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const q = String(input.q || '').trim().slice(0, 120);
  const rankRaw = String(input.rank || '').trim().toLowerCase();
  const statusRaw = String(input.status || '').trim().toLowerCase();
  const dateFromRaw = String(input.date_from || '').trim();
  const dateToRaw = String(input.date_to || '').trim();
  const sortByRaw = String(input.sort_by || 'created_at').trim().toLowerCase();
  const sortDirRaw = String(input.sort_dir || 'desc').trim().toLowerCase();
  const activityRangeRaw = String(input.activity_range || 'all').trim().toLowerCase();
  const limitValue = Number(input.limit || DEFAULT_USER_REPORT_LIMIT);

  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.trunc(limitValue), 1), MAX_REPORT_ROWS)
    : DEFAULT_USER_REPORT_LIMIT;
  const activityRange = USER_REPORT_PRESET_ACTIVITY_RANGES.has(activityRangeRaw) ? activityRangeRaw : 'all';

  return {
    q,
    rank: USER_RANKS.includes(rankRaw) ? rankRaw : '',
    status: USER_STATUSES.includes(statusRaw) ? statusRaw : '',
    date_from: dateFromRaw && isIsoDate(dateFromRaw) ? dateFromRaw : '',
    date_to: dateToRaw && isIsoDate(dateToRaw) ? dateToRaw : '',
    activity_range: activityRange,
    activity_from: activityRange === 'custom' ? sanitizeDateTimeLocal(input.activity_from) : '',
    activity_to: activityRange === 'custom' ? sanitizeDateTimeLocal(input.activity_to) : '',
    sort_by: USER_REPORT_SORTS.has(sortByRaw) ? sortByRaw : 'created_at',
    sort_dir: sortDirRaw === 'asc' ? 'asc' : 'desc',
    limit,
  };
}

function normalizeGuildGapPresetFilters(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const q = String(input.q || '').trim().slice(0, 120);
  const linkStateRaw = String(input.link_state || 'needs_discord').trim().toLowerCase();
  const sortByRaw = String(input.sort_by || 'overall_last_seen_at').trim().toLowerCase();
  const sortDirRaw = String(input.sort_dir || 'desc').trim().toLowerCase();
  const activityRangeRaw = String(input.activity_range || 'all').trim().toLowerCase();
  const limitValue = Number(input.limit || DEFAULT_GUILD_GAP_LIMIT);

  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.trunc(limitValue), 1), MAX_REPORT_ROWS)
    : DEFAULT_GUILD_GAP_LIMIT;
  const activityRange = USER_REPORT_PRESET_ACTIVITY_RANGES.has(activityRangeRaw) ? activityRangeRaw : 'all';

  return {
    q,
    link_state: GUILD_GAP_LINK_STATES.has(linkStateRaw) ? linkStateRaw : 'needs_discord',
    activity_range: activityRange,
    activity_from: activityRange === 'custom' ? sanitizeDateTimeLocal(input.activity_from) : '',
    activity_to: activityRange === 'custom' ? sanitizeDateTimeLocal(input.activity_to) : '',
    sort_by: GUILD_GAP_SORTS.has(sortByRaw) ? sortByRaw : 'overall_last_seen_at',
    sort_dir: sortDirRaw === 'asc' ? 'asc' : 'desc',
    limit,
  };
}

function hasAnyKeys(source, keys) {
  if (!source || typeof source !== 'object') return false;
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

function normalizeUserReportPresetConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const modeRaw = String(source.mode || 'member_activity').trim().toLowerCase();
  const mode = USER_REPORT_VIEWS.has(modeRaw) ? modeRaw : 'member_activity';
  const userKeys = [
    'q',
    'rank',
    'status',
    'date_from',
    'date_to',
    'activity_range',
    'activity_from',
    'activity_to',
    'sort_by',
    'sort_dir',
    'limit',
  ];
  const guildKeys = [
    'q',
    'link_state',
    'activity_range',
    'activity_from',
    'activity_to',
    'sort_by',
    'sort_dir',
    'limit',
  ];
  const userSource = source.user_filters && typeof source.user_filters === 'object'
    ? source.user_filters
    : (hasAnyKeys(source, userKeys) ? source : {});
  const guildSource = source.guild_gap_filters && typeof source.guild_gap_filters === 'object'
    ? source.guild_gap_filters
    : (hasAnyKeys(source, guildKeys) ? source : {});

  return {
    mode,
    user_filters: normalizeUserReportPresetFilters(userSource),
    guild_gap_filters: normalizeGuildGapPresetFilters(guildSource),
  };
}

function mapPresetRow(row) {
  let parsedFilters = {};
  try {
    parsedFilters = typeof row.filters_json === 'string'
      ? JSON.parse(row.filters_json)
      : (row.filters_json || {});
  } catch (_) {
    parsedFilters = {};
  }
  return {
    id: row.id,
    name: row.name,
    filters: normalizeUserReportPresetConfig(parsedFilters),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by_user_id: row.created_by_user_id,
    created_by_username: row.created_by_username || '',
    created_by_display_name: row.created_by_display_name || '',
  };
}

// GET /api/reports/users/presets
router.get('/users/presets', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.filters_json, p.created_at, p.updated_at, p.created_by_user_id,
              u.username AS created_by_username, u.display_name AS created_by_display_name
       FROM user_report_presets p
       LEFT JOIN users u ON u.id = p.created_by_user_id
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT 250`
    );

    res.json({ presets: rows.map(mapPresetRow) });
  } catch (err) {
    console.error('Get user report presets error:', err);
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'User report preset table missing. Run migrations.' });
    }
    res.status(500).json({ error: 'Failed to fetch saved reports' });
  }
});

// POST /api/reports/users/presets
router.post('/users/presets', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Preset name is required' });
    }
    if (name.length > 120) {
      return res.status(400).json({ error: 'Preset name must be 120 characters or less' });
    }

    const filters = normalizeUserReportPresetConfig(req.body.filters);
    const [result] = await pool.execute(
      `INSERT INTO user_report_presets (name, filters_json, created_by_user_id)
       VALUES (?, ?, ?)`,
      [name, JSON.stringify(filters), req.user.id]
    );

    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.filters_json, p.created_at, p.updated_at, p.created_by_user_id,
              u.username AS created_by_username, u.display_name AS created_by_display_name
       FROM user_report_presets p
       LEFT JOIN users u ON u.id = p.created_by_user_id
       WHERE p.id = ?
       LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Saved report created',
      preset: rows[0] ? mapPresetRow(rows[0]) : null,
    });
  } catch (err) {
    console.error('Create user report preset error:', err);
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'User report preset table missing. Run migrations.' });
    }
    res.status(500).json({ error: 'Failed to save report preset' });
  }
});

// DELETE /api/reports/users/presets/:id
router.delete('/users/presets/:id', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid preset id' });
    }

    const [rows] = await pool.execute(
      'SELECT id FROM user_report_presets WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Saved report not found' });
    }

    await pool.execute(
      'DELETE FROM user_report_presets WHERE id = ?',
      [id]
    );

    res.json({ message: 'Saved report deleted' });
  } catch (err) {
    console.error('Delete user report preset error:', err);
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'User report preset table missing. Run migrations.' });
    }
    res.status(500).json({ error: 'Failed to delete saved report' });
  }
});

// GET /api/reports/users
router.get('/users', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rank = String(req.query.rank || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();
    const activityRangeRaw = String(req.query.activity_range || 'all').trim().toLowerCase();
    const activityFromRaw = String(req.query.activity_from || '').trim();
    const activityToRaw = String(req.query.activity_to || '').trim();
    const sortByRaw = String(req.query.sort_by || 'created_at').trim().toLowerCase();
    const sortDir = String(req.query.sort_dir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const exportAll = parseBoolParam(req.query.export_all);
    const limitValue = Number(req.query.limit || DEFAULT_USER_REPORT_LIMIT);
    const requestedLimit = Number.isFinite(limitValue)
      ? Math.min(Math.max(Math.trunc(limitValue), 1), MAX_REPORT_ROWS)
      : DEFAULT_USER_REPORT_LIMIT;
    const limit = exportAll ? MAX_EXPORT_ROWS : requestedLimit;
    const sortBy = USER_REPORT_SORTS.has(sortByRaw) ? sortByRaw : 'created_at';

    const filters = [];
    const params = [];

    if (q) {
      const term = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      filters.push(`(
        u.username LIKE ? OR
        u.display_name LIKE ? OR
        u.discord_username LIKE ? OR
        EXISTS (
          SELECT 1
          FROM user_characters uq
          WHERE uq.user_id = u.id
            AND (
              uq.character_name LIKE ? OR
              uq.realm LIKE ? OR
              uq.class LIKE ? OR
              uq.spec LIKE ?
            )
        )
      )`);
      params.push(term, term, term, term, term, term, term);
    }
    if (USER_RANKS.includes(rank)) {
      filters.push('u.`rank` = ?');
      params.push(rank);
    }
    if (USER_STATUSES.includes(status)) {
      filters.push('u.status = ?');
      params.push(status);
    }
    if (dateFrom && isIsoDate(dateFrom)) {
      filters.push('u.created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo && isIsoDate(dateTo)) {
      filters.push('u.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(dateTo);
    }

    const activityWindow = resolveActivityWindow(activityRangeRaw, activityFromRaw, activityToRaw);
    if (activityWindow.from) {
      filters.push(`${LAST_SEEN_EXPR} >= ?`);
      params.push(activityWindow.from);
    }
    if (activityWindow.to) {
      filters.push(`${LAST_SEEN_EXPR} < ?`);
      params.push(activityWindow.to);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const fromClause = `
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS posts, COALESCE(SUM(view_count), 0) AS views, MAX(created_at) AS last_post_at
        FROM forum_posts
        GROUP BY user_id
      ) fp ON fp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS comments, MAX(created_at) AS last_comment_at
        FROM forum_comments
        GROUP BY user_id
      ) fc ON fc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS characters, MAX(last_login) AS last_character_login_at
        FROM user_characters
        GROUP BY user_id
      ) uc ON uc.user_id = u.id
      LEFT JOIN (
        SELECT uc.user_id,
               MAX(GREATEST(
                 COALESCE(ps.solo_shuffle, 0),
                 COALESCE(ps.arena_3v3, 0),
                 COALESCE(ps.arena_2v2, 0),
                 COALESCE(ps.rbg_rating, 0)
               )) AS top_rating
        FROM user_characters uc
        LEFT JOIN pvp_stats ps ON ps.character_id = uc.id
        GROUP BY uc.user_id
      ) pr ON pr.user_id = u.id
      LEFT JOIN (
        SELECT target_user_id AS user_id,
               SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_violation_reports,
               COUNT(*) AS total_violation_reports
        FROM forum_reports
        WHERE target_user_id IS NOT NULL
        GROUP BY target_user_id
      ) fr ON fr.user_id = u.id
    `;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total_matches
       ${fromClause}
       ${whereClause}`,
      params
    );
    const totalMatches = Number(countRows?.[0]?.total_matches || 0);

    const [rows] = await pool.execute(
      `SELECT
          u.id,
          u.username,
          u.display_name,
          u.discord_username,
          u.avatar_url,
          u.\`rank\`,
          u.status,
          u.created_at,
          COALESCE(fp.posts, 0) AS posts,
          COALESCE(fc.comments, 0) AS comments,
          COALESCE(fp.views, 0) AS views,
          COALESCE(uc.characters, 0) AS characters,
          COALESCE(pr.top_rating, 0) AS top_rating,
          COALESCE(fr.open_violation_reports, 0) AS open_violation_reports,
          COALESCE(fr.total_violation_reports, 0) AS total_violation_reports,
          fp.last_post_at,
          fc.last_comment_at,
          uc.last_character_login_at,
          GREATEST(
            IFNULL(fp.last_post_at, '1000-01-01'),
            IFNULL(fc.last_comment_at, '1000-01-01')
          ) AS last_activity_at,
          ${LAST_SEEN_EXPR} AS last_seen_at
       ${fromClause}
      ${whereClause}
      ORDER BY ${sortBy} ${sortDir}, u.id DESC
      LIMIT ${limit}`,
      params
    );

    const userIds = rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    const characterMap = new Map();
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(', ');
      const [characterRows] = await pool.execute(
        `SELECT
            uc.user_id,
            uc.id AS character_id,
            uc.character_name,
            uc.realm,
            uc.realm_slug,
            uc.class,
            uc.spec,
            uc.level,
            uc.item_level,
            uc.is_main,
            uc.last_login,
            COALESCE(ps.solo_shuffle, 0) AS solo_shuffle,
            COALESCE(ps.arena_3v3, 0) AS arena_3v3,
            COALESCE(ps.arena_2v2, 0) AS arena_2v2,
            COALESCE(ps.rbg_rating, 0) AS rbg_rating,
            GREATEST(
              COALESCE(ps.solo_shuffle, 0),
              COALESCE(ps.arena_3v3, 0),
              COALESCE(ps.arena_2v2, 0),
              COALESCE(ps.rbg_rating, 0)
            ) AS top_rating
         FROM user_characters uc
         LEFT JOIN pvp_stats ps ON ps.character_id = uc.id
         WHERE uc.user_id IN (${placeholders})
         ORDER BY uc.user_id ASC, uc.is_main DESC, uc.character_name ASC`,
        userIds
      );

      characterRows.forEach((character) => {
        const key = Number(character.user_id);
        if (!characterMap.has(key)) {
          characterMap.set(key, []);
        }
        characterMap.get(key).push(character);
      });
    }

    rows.forEach((row) => {
      row.characters_detail = characterMap.get(Number(row.id)) || [];
    });

    const [summaryRows] = await pool.execute(
      `SELECT
          COUNT(*) AS total_users,
          SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS active_users,
          SUM(CASE WHEN u.status = 'suspended' THEN 1 ELSE 0 END) AS suspended_users,
          SUM(COALESCE(fp.posts, 0)) AS total_posts,
          SUM(COALESCE(fc.comments, 0)) AS total_comments,
          SUM(COALESCE(fp.views, 0)) AS total_views,
          SUM(COALESCE(uc.characters, 0)) AS total_characters,
          SUM(COALESCE(fr.open_violation_reports, 0)) AS open_violation_reports
       ${fromClause}
       ${whereClause}`,
      params
    );

    const [rankBreakdown] = await pool.execute(
      `SELECT u.\`rank\` AS rank_name, COUNT(*) AS count
       ${fromClause}
       ${whereClause}
       GROUP BY u.\`rank\`
       ORDER BY FIELD(u.\`rank\`, 'guildmaster','officer','veteran','member','recruit')`,
      params
    );

    const [statusBreakdown] = await pool.execute(
      `SELECT u.status AS status_name, COUNT(*) AS count
       ${fromClause}
       ${whereClause}
       GROUP BY u.status
       ORDER BY count DESC`,
      params
    );

    res.json({
      report: {
        type: 'user_activity',
        generated_at: new Date().toISOString(),
        filters: {
          q,
          rank: USER_RANKS.includes(rank) ? rank : '',
          status: USER_STATUSES.includes(status) ? status : '',
          date_from: dateFrom && isIsoDate(dateFrom) ? dateFrom : '',
          date_to: dateTo && isIsoDate(dateTo) ? dateTo : '',
          activity_range: activityWindow.appliedRange,
          activity_from: activityWindow.from || '',
          activity_to: activityWindow.to || '',
          sort_by: sortBy,
          sort_dir: sortDir.toLowerCase(),
          limit: requestedLimit,
          applied_limit: limit,
          export_all: exportAll,
        },
      },
      pagination: {
        total_matches: totalMatches,
        returned_rows: rows.length,
        limit,
        has_more: totalMatches > rows.length,
        export_all: exportAll,
        export_truncated: exportAll && totalMatches > rows.length,
      },
      summary: summaryRows[0] || {
        total_users: 0,
        active_users: 0,
        suspended_users: 0,
        total_posts: 0,
        total_comments: 0,
        total_views: 0,
        total_characters: 0,
        open_violation_reports: 0,
      },
      breakdowns: {
        by_rank: rankBreakdown || [],
        by_status: statusBreakdown || [],
      },
      rows,
    });
  } catch (err) {
    console.error('User report error:', err);
    res.status(500).json({ error: 'Failed to generate user report' });
  }
});

// GET /api/reports/guild-gaps
router.get('/guild-gaps', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const linkStateRaw = String(req.query.link_state || 'needs_discord').trim().toLowerCase();
    const activityRangeRaw = String(req.query.activity_range || 'all').trim().toLowerCase();
    const activityFromRaw = String(req.query.activity_from || '').trim();
    const activityToRaw = String(req.query.activity_to || '').trim();
    const sortByRaw = String(req.query.sort_by || 'overall_last_seen_at').trim().toLowerCase();
    const sortDir = String(req.query.sort_dir || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const exportAll = parseBoolParam(req.query.export_all);
    const limitValue = Number(req.query.limit || DEFAULT_GUILD_GAP_LIMIT);
    const requestedLimit = Number.isFinite(limitValue)
      ? Math.min(Math.max(Math.trunc(limitValue), 1), MAX_REPORT_ROWS)
      : DEFAULT_GUILD_GAP_LIMIT;
    const limit = exportAll ? MAX_EXPORT_ROWS : requestedLimit;
    const guildIdRaw = Number(req.query.guild_id || 0);
    const guildId = Number.isFinite(guildIdRaw) && guildIdRaw > 0 ? Math.trunc(guildIdRaw) : null;
    const linkState = GUILD_GAP_LINK_STATES.has(linkStateRaw) ? linkStateRaw : 'needs_discord';

    const sortMap = {
      character_name: 'gm.character_name',
      guild_rank: 'gm.guild_rank',
      level: 'gm.level',
      link_state: GUILD_GAP_LINK_STATE_EXPR,
      site_status: 'u.status',
      last_guild_activity_at: 'ga.last_guild_activity_at',
      last_site_seen_at: GUILD_GAP_LAST_SITE_SEEN_EXPR,
      overall_last_seen_at: GUILD_GAP_LAST_SEEN_EXPR,
      top_rating: `GREATEST(
        COALESCE(gms.solo_shuffle, 0),
        COALESCE(gms.arena_3v3, 0),
        COALESCE(gms.arena_2v2, 0),
        COALESCE(gms.rbg_rating, 0)
      )`,
    };
    const sortExpr = sortMap[sortByRaw] || sortMap.overall_last_seen_at;

    const filters = [];
    const params = [];

    if (guildId) {
      filters.push('gm.guild_id = ?');
      params.push(guildId);
    } else {
      filters.push('g.is_primary = TRUE');
    }

    if (q) {
      const term = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
      filters.push(`(
        gm.character_name LIKE ? OR gm.realm_name LIKE ? OR gm.class LIKE ? OR gm.spec LIKE ? OR
        u.username LIKE ? OR u.display_name LIKE ? OR u.discord_username LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }

    if (linkState === 'no_site_account') {
      filters.push('gm.linked_user_id IS NULL');
    } else if (linkState === 'no_discord_link') {
      filters.push('gm.linked_user_id IS NOT NULL AND (u.discord_id IS NULL OR u.discord_id = \'\')');
    } else if (linkState === 'discord_not_active') {
      filters.push('gm.linked_user_id IS NOT NULL AND u.status <> \'active\'');
    } else if (linkState === 'linked_active') {
      filters.push('gm.linked_user_id IS NOT NULL AND u.discord_id IS NOT NULL AND u.discord_id <> \'\' AND u.status = \'active\'');
    } else if (linkState === 'needs_discord') {
      filters.push('(gm.linked_user_id IS NULL OR u.discord_id IS NULL OR u.discord_id = \'\' OR u.status <> \'active\')');
    }

    const activityWindow = resolveActivityWindow(activityRangeRaw, activityFromRaw, activityToRaw);
    if (activityWindow.from) {
      filters.push(`${GUILD_GAP_LAST_SEEN_EXPR} >= ?`);
      params.push(activityWindow.from);
    }
    if (activityWindow.to) {
      filters.push(`${GUILD_GAP_LAST_SEEN_EXPR} < ?`);
      params.push(activityWindow.to);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const fromClause = `
      FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      LEFT JOIN users u ON u.id = gm.linked_user_id
      LEFT JOIN guild_member_stats gms ON gms.guild_member_id = gm.id
      LEFT JOIN (
        SELECT guild_id, character_name, MAX(occurred_at) AS last_guild_activity_at, COUNT(*) AS guild_activity_events
        FROM guild_activity
        GROUP BY guild_id, character_name
      ) ga ON ga.guild_id = gm.guild_id AND ga.character_name = gm.character_name
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS posts, COALESCE(SUM(view_count), 0) AS views, MAX(created_at) AS last_post_at
        FROM forum_posts
        GROUP BY user_id
      ) fp ON fp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS comments, MAX(created_at) AS last_comment_at
        FROM forum_comments
        GROUP BY user_id
      ) fc ON fc.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(last_login) AS last_character_login_at
        FROM user_characters
        GROUP BY user_id
      ) uca ON uca.user_id = u.id
    `;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total_matches
       ${fromClause}
       ${whereClause}`,
      params
    );
    const totalMatches = Number(countRows?.[0]?.total_matches || 0);

    const [rows] = await pool.execute(
      `SELECT
          gm.id AS guild_member_id,
          gm.guild_id,
          g.name AS guild_name,
          gm.character_name,
          gm.realm_slug,
          gm.realm_name,
          gm.class,
          gm.spec,
          gm.level,
          gm.guild_rank,
          gm.guild_rank_name,
          gm.last_synced_at,
          gm.linked_user_id,
          gm.linked_character_id,
          u.id AS site_user_id,
          u.username AS site_username,
          u.display_name AS site_display_name,
          u.status AS site_status,
          u.created_at AS site_created_at,
          u.discord_id,
          u.discord_username,
          COALESCE(fp.posts, 0) AS site_posts,
          COALESCE(fc.comments, 0) AS site_comments,
          COALESCE(fp.views, 0) AS site_views,
          ga.last_guild_activity_at,
          COALESCE(ga.guild_activity_events, 0) AS guild_activity_events,
          ${GUILD_GAP_LAST_SITE_SEEN_EXPR} AS last_site_seen_at,
          ${GUILD_GAP_LAST_SEEN_EXPR} AS overall_last_seen_at,
          ${GUILD_GAP_LINK_STATE_EXPR} AS link_state,
          GREATEST(
            COALESCE(gms.solo_shuffle, 0),
            COALESCE(gms.arena_3v3, 0),
            COALESCE(gms.arena_2v2, 0),
            COALESCE(gms.rbg_rating, 0)
          ) AS top_rating,
          COALESCE(gms.honorable_kills, 0) AS honorable_kills,
          COALESCE(gms.item_level, 0) AS item_level,
          gms.fetched_at AS stats_fetched_at
       ${fromClause}
       ${whereClause}
       ORDER BY ${sortExpr} ${sortDir}, gm.character_name ASC
       LIMIT ${limit}`,
      params
    );

    const [summaryRows] = await pool.execute(
      `SELECT
          COUNT(*) AS total_members,
          SUM(CASE WHEN gm.linked_user_id IS NULL OR u.discord_id IS NULL OR u.discord_id = '' OR u.status <> 'active' THEN 1 ELSE 0 END) AS needs_discord,
          SUM(CASE WHEN gm.linked_user_id IS NULL THEN 1 ELSE 0 END) AS no_site_account,
          SUM(CASE WHEN gm.linked_user_id IS NOT NULL AND (u.discord_id IS NULL OR u.discord_id = '') THEN 1 ELSE 0 END) AS no_discord_link,
          SUM(CASE WHEN gm.linked_user_id IS NOT NULL AND u.status <> 'active' THEN 1 ELSE 0 END) AS discord_not_active,
          SUM(CASE WHEN gm.linked_user_id IS NOT NULL AND u.discord_id IS NOT NULL AND u.discord_id <> '' AND u.status = 'active' THEN 1 ELSE 0 END) AS linked_active,
          SUM(CASE WHEN ${GUILD_GAP_LAST_SEEN_EXPR} >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN 1 ELSE 0 END) AS active_14d,
          SUM(CASE WHEN ${GUILD_GAP_LAST_SEEN_EXPR} >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS active_30d,
          SUM(CASE WHEN ${GUILD_GAP_LAST_SEEN_EXPR} < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS inactive_30d,
          SUM(CASE WHEN ${GUILD_GAP_LAST_SEEN_EXPR} = '1000-01-01 00:00:00' THEN 1 ELSE 0 END) AS unknown_activity
       ${fromClause}
       ${whereClause}`,
      params
    );

    const [linkStateBreakdown] = await pool.execute(
      `SELECT
          ${GUILD_GAP_LINK_STATE_EXPR} AS link_state,
          COUNT(*) AS count
       ${fromClause}
       ${whereClause}
       GROUP BY link_state
       ORDER BY count DESC`,
      params
    );

    res.json({
      report: {
        type: 'guild_discord_gaps',
        generated_at: new Date().toISOString(),
        filters: {
          q,
          link_state: linkState,
          guild_id: guildId || '',
          activity_range: activityWindow.appliedRange,
          activity_from: activityWindow.from || '',
          activity_to: activityWindow.to || '',
          sort_by: Object.prototype.hasOwnProperty.call(sortMap, sortByRaw) ? sortByRaw : 'overall_last_seen_at',
          sort_dir: sortDir.toLowerCase(),
          limit: requestedLimit,
          applied_limit: limit,
          export_all: exportAll,
        },
      },
      pagination: {
        total_matches: totalMatches,
        returned_rows: rows.length,
        limit,
        has_more: totalMatches > rows.length,
        export_all: exportAll,
        export_truncated: exportAll && totalMatches > rows.length,
      },
      summary: summaryRows[0] || {
        total_members: 0,
        needs_discord: 0,
        no_site_account: 0,
        no_discord_link: 0,
        discord_not_active: 0,
        linked_active: 0,
        active_14d: 0,
        active_30d: 0,
        inactive_30d: 0,
        unknown_activity: 0,
      },
      breakdowns: {
        by_link_state: linkStateBreakdown || [],
      },
      rows,
    });
  } catch (err) {
    console.error('Guild gap report error:', err);
    res.status(500).json({ error: 'Failed to generate guild gap report' });
  }
});

// GET /api/reports?status=open&type=post
router.get('/', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const status = String(req.query.status || 'open').trim().toLowerCase();
    const type = String(req.query.type || '').trim().toLowerCase();

    const filters = [];
    const params = [];

    if (REPORT_STATUSES.includes(status)) {
      filters.push('fr.status = ?');
      params.push(status);
    }
    if (type === 'post' || type === 'comment') {
      filters.push('fr.target_type = ?');
      params.push(type);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [reports] = await pool.execute(
      `SELECT fr.id, fr.target_type, fr.target_post_id, fr.target_comment_id, fr.target_user_id,
              fr.reason, fr.status, fr.reviewed_note, fr.created_at, fr.updated_at, fr.reviewed_at,
              reporter.id AS reporter_id, reporter.username AS reporter_username, reporter.display_name AS reporter_display_name,
              reviewer.id AS reviewer_id, reviewer.username AS reviewer_username, reviewer.display_name AS reviewer_display_name,
              target.username AS target_username, target.display_name AS target_display_name,
              fp.title AS post_title, fp.category_id AS post_category_id,
              fc.post_id AS comment_post_id, fc.content AS comment_content
       FROM forum_reports fr
       JOIN users reporter ON reporter.id = fr.reporter_user_id
       LEFT JOIN users reviewer ON reviewer.id = fr.reviewed_by_user_id
       LEFT JOIN users target ON target.id = fr.target_user_id
       LEFT JOIN forum_posts fp ON fp.id = fr.target_post_id
       LEFT JOIN forum_comments fc ON fc.id = fr.target_comment_id
       ${whereClause}
       ORDER BY FIELD(fr.status, 'open', 'reviewing', 'resolved', 'dismissed'), fr.created_at DESC
       LIMIT 250`,
      params
    );

    const [countRows] = await pool.execute(
      `SELECT status, COUNT(*) AS count
       FROM forum_reports
       GROUP BY status`
    );

    const counts = { open: 0, reviewing: 0, resolved: 0, dismissed: 0 };
    countRows.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
        counts[row.status] = row.count;
      }
    });

    res.json({ reports, counts });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// PUT /api/reports/:id
router.put('/:id', requireAuth, requirePermission('admin.view_panel'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid report id' });
    }

    const status = String(req.body.status || '').trim().toLowerCase();
    const reviewedNoteRaw = req.body.reviewedNote;
    const reviewedNote = reviewedNoteRaw === undefined || reviewedNoteRaw === null
      ? null
      : String(reviewedNoteRaw).trim();

    if (!REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }
    if (reviewedNote && reviewedNote.length > 500) {
      return res.status(400).json({ error: 'Review note must be 500 characters or less' });
    }

    const [existingRows] = await pool.execute(
      'SELECT id FROM forum_reports WHERE id = ?',
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (status === 'open') {
      await pool.execute(
        `UPDATE forum_reports
         SET status = ?, reviewed_by_user_id = NULL, reviewed_note = NULL, reviewed_at = NULL
         WHERE id = ?`,
        [status, id]
      );
    } else {
      await pool.execute(
        `UPDATE forum_reports
         SET status = ?, reviewed_by_user_id = ?, reviewed_note = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [status, req.user.id, reviewedNote || null, id]
      );
    }

    res.json({ message: 'Report updated' });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

module.exports = router;
