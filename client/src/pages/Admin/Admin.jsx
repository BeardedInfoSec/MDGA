import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatEventTime, utcToLocalInput, getTimezoneOptions } from '../../utils/timezone';
import PageHero from '../../components/common/PageHero';
import styles from './Admin.module.css';

const RANK_ORDER = ['recruit', 'member', 'veteran', 'officer', 'guildmaster'];
const CATEGORY_OPTIONS = [
  { value: 'pvp', label: 'PvP', color: 'var(--color-red)' },
  { value: 'defense', label: 'Defense', color: 'var(--color-gold)' },
  { value: 'social', label: 'Social', color: 'var(--color-discord)' },
  { value: 'raid', label: 'Raid', color: 'var(--color-raid)' },
];
const CATEGORY_COLORS = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.color]));

function computeDuration(startsAt, endsAt) {
  if (!startsAt || !endsAt) return '';
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const diff = end - start;
  if (diff <= 0 || !Number.isFinite(diff)) return '';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0 && mins > 0) return `Duration: ${hours}h ${mins}m`;
  if (hours > 0) return `Duration: ${hours}h`;
  return `Duration: ${mins}m`;
}

function computePreviewDates(startsAt, type, count, customDays) {
  if (!startsAt || !count || count < 2) return [];
  const base = new Date(startsAt);
  if (isNaN(base.getTime())) return [];
  let dayInterval;
  if (type === 'weekly') dayInterval = 7;
  else if (type === 'biweekly') dayInterval = 14;
  else dayInterval = Number(customDays) || 7;
  const dates = [];
  for (let i = 0; i < Math.min(count, 12); i++) {
    const d = new Date(base.getTime() + dayInterval * i * 86400000);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  if (count > 12) dates.push('...');
  return dates;
}
const USER_REPORT_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '14d', label: 'Last 14 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '60d', label: 'Last 60 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];
const DEFAULT_USER_REPORT_FILTERS = {
  q: '',
  rank: '',
  status: '',
  date_from: '',
  date_to: '',
  activity_range: 'all',
  activity_from: '',
  activity_to: '',
  sort_by: 'created_at',
  sort_dir: 'desc',
  limit: 100,
};
const GUILD_GAP_LINK_OPTIONS = [
  { value: 'needs_discord', label: 'Needs Discord Link' },
  { value: 'no_site_account', label: 'No Website Account' },
  { value: 'no_discord_link', label: 'Website Account, No Discord' },
  { value: 'discord_not_active', label: 'Discord Not Active' },
  { value: 'linked_active', label: 'Fully Linked + Active' },
  { value: 'all', label: 'All Guild Members' },
];
const DEFAULT_GUILD_GAP_FILTERS = {
  q: '',
  link_state: 'needs_discord',
  activity_range: 'all',
  activity_from: '',
  activity_to: '',
  sort_by: 'overall_last_seen_at',
  sort_dir: 'desc',
  limit: 200,
};
const USER_REPORT_VIEW_OPTIONS = [
  { value: 'member_activity', label: 'Member Activity' },
  { value: 'guild_discord_gaps', label: 'Guild vs Discord Gaps' },
];
const DEFAULT_HOME_BACKGROUND_IMAGE = '/images/Screenshot_2026-02-06_18-21-39.png';

function normalizeUserReportFilters(raw) {
  const next = { ...DEFAULT_USER_REPORT_FILTERS, ...(raw || {}) };
  const parsedLimit = Number(next.limit);
  next.limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 500)
    : DEFAULT_USER_REPORT_FILTERS.limit;
  if (!USER_REPORT_RANGE_OPTIONS.some((opt) => opt.value === next.activity_range)) {
    next.activity_range = 'all';
  }
  if (next.activity_range !== 'custom') {
    next.activity_from = '';
    next.activity_to = '';
  }
  return next;
}

function normalizeGuildGapFilters(raw) {
  const next = { ...DEFAULT_GUILD_GAP_FILTERS, ...(raw || {}) };
  const parsedLimit = Number(next.limit);
  next.limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 500)
    : DEFAULT_GUILD_GAP_FILTERS.limit;
  if (!GUILD_GAP_LINK_OPTIONS.some((opt) => opt.value === next.link_state)) {
    next.link_state = 'needs_discord';
  }
  if (!USER_REPORT_RANGE_OPTIONS.some((opt) => opt.value === next.activity_range)) {
    next.activity_range = 'all';
  }
  if (next.activity_range !== 'custom') {
    next.activity_from = '';
    next.activity_to = '';
  }
  return next;
}

function normalizeReportView(value) {
  return USER_REPORT_VIEW_OPTIONS.some((option) => option.value === value)
    ? value
    : USER_REPORT_VIEW_OPTIONS[0].value;
}

function pickFilterValues(raw, defaults) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.keys(defaults).reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      acc[key] = source[key];
    }
    return acc;
  }, {});
}

function normalizeSavedReportConfig(rawFilters) {
  const source = rawFilters && typeof rawFilters === 'object' ? rawFilters : {};
  const mode = normalizeReportView(source.mode || 'member_activity');
  const legacyUserFilters = Object.keys(DEFAULT_USER_REPORT_FILTERS).some((key) => Object.prototype.hasOwnProperty.call(source, key));
  const legacyGuildFilters = Object.keys(DEFAULT_GUILD_GAP_FILTERS).some((key) => Object.prototype.hasOwnProperty.call(source, key));

  const userFiltersSource = source.user_filters || (legacyUserFilters ? source : {});
  const guildGapFiltersSource = source.guild_gap_filters || (legacyGuildFilters ? source : {});

  return {
    mode,
    userFilters: normalizeUserReportFilters(pickFilterValues(userFiltersSource, DEFAULT_USER_REPORT_FILTERS)),
    guildGapFilters: normalizeGuildGapFilters(pickFilterValues(guildGapFiltersSource, DEFAULT_GUILD_GAP_FILTERS)),
  };
}

export default function Admin() {
  const { isGuildMaster, hasPermission, apiFetch, user, userTimezone } = useAuth();
  const gm = isGuildMaster();
  useDocumentTitle(gm ? 'Admin Panel' : 'Officer Panel');

  // ── Shared state ──
  const [activeTab, setActiveTab] = useState('events');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ── Events state ──
  const [events, setEvents] = useState([]);
  const [eventModal, setEventModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', event }
  const [eventForm, setEventForm] = useState({ title: '', startsAt: '', endsAt: '', timezone: userTimezone, category: 'pvp', description: '', recurrence: { enabled: false, type: 'weekly', count: 4, customDays: 7 } });

  // ── Applications state ──
  const [appFilter, setAppFilter] = useState('pending');
  const [applications, setApplications] = useState([]);

  // ── Users state ──
  const [users, setUsers] = useState([]);
  const [userRolesSearch, setUserRolesSearch] = useState('');

  // ── Banned Users state ──
  const [bannedUsers, setBannedUsers] = useState([]);
  const [banModal, setBanModal] = useState(null); // null | { userId, displayName }
  const [banReason, setBanReason] = useState('');
  const [unbanModal, setUnbanModal] = useState(null); // null | { userId, displayName }
  const [unbanReason, setUnbanReason] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [bannedPage, setBannedPage] = useState(1);
  const USERS_PER_PAGE = 10;

  // ── Roles state ──
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [roleModal, setRoleModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', role }
  const [roleForm, setRoleForm] = useState({ name: '', display_name: '', color: '#ffffff', description: '', discord_role_id: '', permissions: [] });

  // ── User Roles state ──
  const [userRoleModal, setUserRoleModal] = useState(null); // null | { userId, username }
  const [userRoleList, setUserRoleList] = useState([]); // all roles for checkbox list
  const [userCurrentRoles, setUserCurrentRoles] = useState([]); // selected role IDs

  // ── Discord Roles state ──
  const [discordGuildRoles, setDiscordGuildRoles] = useState([]);
  const [discordMappings, setDiscordMappings] = useState({}); // { discordRoleId: { rank, roleId } }
  const [reportFilter, setReportFilter] = useState('open');
  const [reports, setReports] = useState([]);
  const [reportCounts, setReportCounts] = useState({
    open: 0,
    reviewing: 0,
    resolved: 0,
    dismissed: 0,
  });
  // ── Guild state ──
  const [guildProfile, setGuildProfile] = useState(null);
  const [guildMembers, setGuildMembers] = useState([]);
  const [guildClassCounts, setGuildClassCounts] = useState([]);
  const [guildTotal, setGuildTotal] = useState(0);
  const [guildPage, setGuildPage] = useState(1);
  const [guildPageSize, setGuildPageSize] = useState(20);
  const [guildSearch, setGuildSearch] = useState('');
  const [guildClassFilter, setGuildClassFilter] = useState('');
  const [guildRankFilter, setGuildRankFilter] = useState('');
  const [guildSort, setGuildSort] = useState('guild_rank');
  const [guildSortOrder, setGuildSortOrder] = useState('ASC');
  const [guildSyncing, setGuildSyncing] = useState(false);
  const [trackedGuilds, setTrackedGuilds] = useState([]);
  const [gameRankRosterRanks, setGameRankRosterRanks] = useState([]); // distinct ranks from guild roster
  const [gameRankMappingState, setGameRankMappingState] = useState({}); // { gameRank: { discord_role_id, site_rank, game_rank_name } }
  const [gameRankDiscordRoles, setGameRankDiscordRoles] = useState([]); // Discord roles from bot cache
  const [selectedMember, setSelectedMember] = useState(null); // guild member detail modal
  const [unbanGuildModal, setUnbanGuildModal] = useState(null); // null | { memberId, displayName }
  const [unbanGuildReason, setUnbanGuildReason] = useState('');
  const [guildBannedFilter, setGuildBannedFilter] = useState(false);

  const [userReportFilters, setUserReportFilters] = useState(DEFAULT_USER_REPORT_FILTERS);
  const [userReportView, setUserReportView] = useState('member_activity');
  const [userReportRows, setUserReportRows] = useState([]);
  const [userReportSummary, setUserReportSummary] = useState(null);
  const [userReportBreakdowns, setUserReportBreakdowns] = useState({ by_rank: [], by_status: [] });
  const [userReportMeta, setUserReportMeta] = useState(null);
  const [userReportPagination, setUserReportPagination] = useState(null);
  const [userReportLoading, setUserReportLoading] = useState(false);
  const [hasSearchedUserReports, setHasSearchedUserReports] = useState(false);
  const [savedUserReports, setSavedUserReports] = useState([]);
  const [selectedSavedUserReportId, setSelectedSavedUserReportId] = useState('');
  const [guildGapFilters, setGuildGapFilters] = useState(DEFAULT_GUILD_GAP_FILTERS);
  const [guildGapRows, setGuildGapRows] = useState([]);
  const [guildGapSummary, setGuildGapSummary] = useState(null);
  const [guildGapBreakdowns, setGuildGapBreakdowns] = useState({ by_link_state: [] });
  const [guildGapMeta, setGuildGapMeta] = useState(null);
  const [guildGapPagination, setGuildGapPagination] = useState(null);
  const [guildGapLoading, setGuildGapLoading] = useState(false);
  const [hasSearchedGuildGaps, setHasSearchedGuildGaps] = useState(false);
  const [reportCsvExporting, setReportCsvExporting] = useState(false);
  const [savedReportCsvExporting, setSavedReportCsvExporting] = useState(false);
  const isGuildGapView = userReportView === 'guild_discord_gaps';

  // ── Carousel state ──
  const [carouselImages, setCarouselImages] = useState([]);
  const [carouselForm, setCarouselForm] = useState({ imageUrl: '', altText: '', file: null, sortOrder: '' });
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(DEFAULT_HOME_BACKGROUND_IMAGE);
  const [backgroundForm, setBackgroundForm] = useState({ imageUrl: '', file: null });

  // ── Toast helper ──
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // ── Data loaders ──
  const loadEvents = useCallback(async () => {
    try {
      const res = await apiFetch('/events');
      if (res.ok) { const data = await res.json(); setEvents(data.events); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadApplications = useCallback(async (status) => {
    try {
      const res = await apiFetch(`/applications?status=${status}`);
      if (res.ok) { const data = await res.json(); setApplications(data.applications); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/users');
      if (res.ok) { const data = await res.json(); setUsers(data.users); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadBannedUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/users/banned');
      if (res.ok) { const data = await res.json(); setBannedUsers(data.users); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await apiFetch('/roles');
      if (res.ok) { const data = await res.json(); setRoles(data.roles); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await apiFetch('/roles/permissions');
      if (res.ok) { const data = await res.json(); setAllPermissions(data.permissions); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadDiscordGuildRoles = useCallback(async () => {
    try {
      const res = await apiFetch('/discord-roles/guild-roles');
      if (res.ok) { const data = await res.json(); setDiscordGuildRoles(data.roles); }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadDiscordMappings = useCallback(async () => {
    try {
      const res = await apiFetch('/discord-roles/mappings');
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.mappings || []).forEach((m) => {
          map[m.discord_role_id] = {
            rank: m.site_rank || m.rank || '',
            roleId: m.site_role_id || m.role_id || '',
          };
        });
        setDiscordMappings(map);
      }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadReports = useCallback(async (status) => {
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await apiFetch(`/reports${query}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setReportCounts({
          open: data.counts?.open || 0,
          reviewing: data.counts?.reviewing || 0,
          resolved: data.counts?.resolved || 0,
          dismissed: data.counts?.dismissed || 0,
        });
      }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const buildUserReportQuery = useCallback((filters, options = {}) => {
    const { exportAll = false } = options;
    const normalizedFilters = normalizeUserReportFilters(filters);
    const params = new URLSearchParams();
    if (normalizedFilters.q) params.set('q', normalizedFilters.q);
    if (normalizedFilters.rank) params.set('rank', normalizedFilters.rank);
    if (normalizedFilters.status) params.set('status', normalizedFilters.status);
    if (normalizedFilters.date_from) params.set('date_from', normalizedFilters.date_from);
    if (normalizedFilters.date_to) params.set('date_to', normalizedFilters.date_to);
    if (normalizedFilters.activity_range) params.set('activity_range', normalizedFilters.activity_range);
    if (normalizedFilters.activity_range === 'custom') {
      if (normalizedFilters.activity_from) params.set('activity_from', normalizedFilters.activity_from);
      if (normalizedFilters.activity_to) params.set('activity_to', normalizedFilters.activity_to);
    }
    if (normalizedFilters.sort_by) params.set('sort_by', normalizedFilters.sort_by);
    if (normalizedFilters.sort_dir) params.set('sort_dir', normalizedFilters.sort_dir);
    if (normalizedFilters.limit) params.set('limit', String(normalizedFilters.limit));
    if (exportAll) params.set('export_all', '1');
    return { normalizedFilters, params };
  }, []);

  const buildGuildGapQuery = useCallback((filters, options = {}) => {
    const { exportAll = false } = options;
    const normalizedFilters = normalizeGuildGapFilters(filters);
    const params = new URLSearchParams();
    if (normalizedFilters.q) params.set('q', normalizedFilters.q);
    if (normalizedFilters.link_state) params.set('link_state', normalizedFilters.link_state);
    if (normalizedFilters.activity_range) params.set('activity_range', normalizedFilters.activity_range);
    if (normalizedFilters.activity_range === 'custom') {
      if (normalizedFilters.activity_from) params.set('activity_from', normalizedFilters.activity_from);
      if (normalizedFilters.activity_to) params.set('activity_to', normalizedFilters.activity_to);
    }
    if (normalizedFilters.sort_by) params.set('sort_by', normalizedFilters.sort_by);
    if (normalizedFilters.sort_dir) params.set('sort_dir', normalizedFilters.sort_dir);
    if (normalizedFilters.limit) params.set('limit', String(normalizedFilters.limit));
    if (exportAll) params.set('export_all', '1');
    return { normalizedFilters, params };
  }, []);

  const loadUserReports = useCallback(async (filters = userReportFilters, options = {}) => {
    const { asReport = false } = options;
    setUserReportLoading(true);
    try {
      const { params } = buildUserReportQuery(filters);

      const res = await apiFetch(`/reports/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUserReportRows(data.rows || []);
        setUserReportSummary(data.summary || null);
        setUserReportBreakdowns(data.breakdowns || { by_rank: [], by_status: [] });
        setUserReportMeta(data.report || null);
        setUserReportPagination(data.pagination || null);
        setHasSearchedUserReports(true);
      } else {
        const data = await res.json();
        showToast(data.error || (asReport ? 'Failed to generate user report' : 'Failed to search users'));
      }
    } catch {
      showToast(asReport ? 'Failed to generate user report' : 'Failed to search users');
    } finally {
      setUserReportLoading(false);
    }
  }, [apiFetch, showToast, userReportFilters, buildUserReportQuery]);

  const loadGuildGapReports = useCallback(async (filters = guildGapFilters) => {
    setGuildGapLoading(true);
    try {
      const { params } = buildGuildGapQuery(filters);
      const res = await apiFetch(`/reports/guild-gaps?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to generate guild gap report');
        return;
      }
      const data = await res.json();
      setGuildGapRows(data.rows || []);
      setGuildGapSummary(data.summary || null);
      setGuildGapBreakdowns(data.breakdowns || { by_link_state: [] });
      setGuildGapMeta(data.report || null);
      setGuildGapPagination(data.pagination || null);
      setHasSearchedGuildGaps(true);
    } catch {
      showToast('Failed to generate guild gap report');
    } finally {
      setGuildGapLoading(false);
    }
  }, [apiFetch, showToast, guildGapFilters, buildGuildGapQuery]);

  const loadUserReportPresets = useCallback(async () => {
    try {
      const res = await apiFetch('/reports/users/presets');
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to load saved reports');
        return;
      }
      const data = await res.json();
      const presets = data.presets || [];
      setSavedUserReports(presets);
      setSelectedSavedUserReportId((prev) => (
        presets.some((item) => String(item.id) === String(prev)) ? prev : ''
      ));
    } catch {
      showToast('Failed to load saved reports');
    }
  }, [apiFetch, showToast]);

  // ── Guild loaders ──
  const loadGuildProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/guild/summary');
      if (res.ok) {
        const data = await res.json();
        setGuildProfile(data.guild);
      }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadGuildRoster = useCallback(async (search, classF, rankF, sort, order, pg, pgSize, bannedFilter) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (classF) params.set('class', classF);
      if (rankF !== '') params.set('rank', rankF);
      if (bannedFilter) params.set('banned', '1');
      params.set('sort', sort || 'guild_rank');
      params.set('order', order || 'ASC');
      params.set('page', String(pg || 1));
      params.set('page_size', pgSize === 'all' ? 'all' : String(pgSize || 20));
      const res = await apiFetch(`/guild/roster?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setGuildMembers(data.members || []);
        setGuildClassCounts(data.classCounts || []);
        setGuildTotal(data.total || 0);
      }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const loadTrackedGuilds = useCallback(async () => {
    try {
      const res = await apiFetch('/guild/guilds');
      if (res.ok) {
        const data = await res.json();
        setTrackedGuilds(data.guilds || []);
      }
    } catch { /* swallow */ }
  }, [apiFetch]);

  const triggerGuildSync = useCallback(async () => {
    setGuildSyncing(true);
    try {
      await apiFetch('/guild/sync', { method: 'POST', body: JSON.stringify({}) });
      showToast('Guild sync started');
      setTimeout(() => {
        loadGuildProfile();
        loadGuildRoster(guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter);
        setGuildSyncing(false);
      }, 3000);
    } catch {
      showToast('Failed to trigger sync');
      setGuildSyncing(false);
    }
  }, [apiFetch, showToast, loadGuildProfile, loadGuildRoster, guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter]);

  // ── Game Rank Mappings ──
  const loadGameRankMappings = useCallback(async (guildId) => {
    if (!guildId) return;
    try {
      const [mappingsRes, rolesRes] = await Promise.all([
        apiFetch(`/guild/game-rank-mappings/${guildId}`),
        apiFetch('/discord-roles/guild-roles'),
      ]);
      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setGameRankRosterRanks(data.rosterRanks || []);
        // Build editable state keyed by game_rank
        const state = {};
        for (const m of data.mappings) {
          state[m.game_rank] = {
            discord_role_id: m.discord_role_id || '',
            site_rank: m.site_rank || '',
            game_rank_name: m.game_rank_name || '',
          };
        }
        // Also ensure all roster ranks have an entry
        for (const r of data.rosterRanks) {
          if (!state[r.rank]) {
            state[r.rank] = { discord_role_id: '', site_rank: '', game_rank_name: '' };
          }
        }
        setGameRankMappingState(state);
      }
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setGameRankDiscordRoles(data.roles || []);
      }
    } catch (err) {
      console.error('Failed to load game rank mappings:', err);
    }
  }, [apiFetch]);

  const updateGameRankMapping = useCallback((gameRank, field, value) => {
    setGameRankMappingState((prev) => ({
      ...prev,
      [gameRank]: { ...prev[gameRank], [field]: value },
    }));
  }, []);

  const saveGameRankMappings = useCallback(async (guildId) => {
    const mappings = Object.entries(gameRankMappingState).map(([gameRank, m]) => ({
      game_rank: parseInt(gameRank, 10),
      game_rank_name: m.game_rank_name || null,
      discord_role_id: m.discord_role_id || null,
      site_rank: m.site_rank || null,
    }));
    try {
      const res = await apiFetch(`/guild/game-rank-mappings/${guildId}`, {
        method: 'PUT',
        body: JSON.stringify({ mappings }),
      });
      if (res.ok) showToast('Game rank mappings saved');
      else showToast('Failed to save mappings');
    } catch {
      showToast('Failed to save mappings');
    }
  }, [apiFetch, showToast, gameRankMappingState]);

  // ── Carousel loaders & handlers ──
  const loadCarouselImages = useCallback(async () => {
    try {
      const res = await apiFetch('/carousel');
      if (res.ok) { const data = await res.json(); setCarouselImages(data.images || []); }
    } catch { /* silent */ }
  }, [apiFetch]);

  const loadCarouselSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/carousel/settings');
      if (!res.ok) return;
      const data = await res.json();
      setBackgroundImageUrl(data.backgroundImageUrl || DEFAULT_HOME_BACKGROUND_IMAGE);
    } catch { /* silent */ }
  }, [apiFetch]);

  const addCarouselImage = useCallback(async () => {
    try {
      let res;
      const orderVal = carouselForm.sortOrder !== '' ? parseInt(carouselForm.sortOrder, 10) : undefined;
      if (carouselForm.file) {
        const fd = new FormData();
        fd.append('image', carouselForm.file);
        fd.append('altText', carouselForm.altText);
        if (orderVal !== undefined) fd.append('sortOrder', orderVal);
        res = await apiFetch('/carousel', { method: 'POST', headers: {}, body: fd });
      } else if (carouselForm.imageUrl) {
        const payload = { imageUrl: carouselForm.imageUrl, altText: carouselForm.altText };
        if (orderVal !== undefined) payload.sortOrder = orderVal;
        res = await apiFetch('/carousel', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        return showToast('Provide an image file or URL');
      }
      if (!res.ok) { const e = await res.json(); return showToast(e.error || 'Failed to add'); }
      showToast('Image added');
      setCarouselForm({ imageUrl: '', altText: '', file: null, sortOrder: '' });
      loadCarouselImages();
    } catch { showToast('Failed to add image'); }
  }, [apiFetch, carouselForm, showToast, loadCarouselImages]);

  const updateCarouselImage = useCallback(async (id, altText, sortOrder) => {
    try {
      const res = await apiFetch(`/carousel/${id}`, { method: 'PUT', body: JSON.stringify({ altText, sortOrder }) });
      if (!res.ok) { const e = await res.json(); return showToast(e.error || 'Failed to update'); }
      showToast('Image updated');
      loadCarouselImages();
    } catch { showToast('Failed to update'); }
  }, [apiFetch, showToast, loadCarouselImages]);

  const deleteCarouselImage = useCallback(async (id) => {
    if (!confirm('Delete this carousel image?')) return;
    try {
      const res = await apiFetch(`/carousel/${id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); return showToast(e.error || 'Failed to delete'); }
      showToast('Image deleted');
      loadCarouselImages();
    } catch { showToast('Failed to delete'); }
  }, [apiFetch, showToast, loadCarouselImages]);

  const saveBackgroundImage = useCallback(async () => {
    try {
      let res;
      if (backgroundForm.file) {
        const fd = new FormData();
        fd.append('image', backgroundForm.file);
        res = await apiFetch('/carousel/settings/background', { method: 'PUT', headers: {}, body: fd });
      } else if (backgroundForm.imageUrl) {
        res = await apiFetch('/carousel/settings/background', {
          method: 'PUT',
          body: JSON.stringify({ imageUrl: backgroundForm.imageUrl }),
        });
      } else {
        showToast('Provide an image file or URL');
        return;
      }

      if (!res.ok) {
        const e = await res.json();
        showToast(e.error || 'Failed to update background');
        return;
      }

      const data = await res.json();
      setBackgroundImageUrl(data.backgroundImageUrl || DEFAULT_HOME_BACKGROUND_IMAGE);
      setBackgroundForm({ imageUrl: '', file: null });
      showToast('Background image updated');
    } catch {
      showToast('Failed to update background');
    }
  }, [apiFetch, backgroundForm, showToast]);

  // ── Tab switching loads data ──
  useEffect(() => {
    if (activeTab === 'events') loadEvents();
    else if (activeTab === 'carousel') { loadCarouselImages(); loadCarouselSettings(); }
    else if (activeTab === 'applications') loadApplications(appFilter);
    else if (activeTab === 'reports') loadReports(reportFilter);
    else if (activeTab === 'user-reports') {
      loadUserReportPresets();
      setHasSearchedUserReports(false);
      setUserReportRows([]);
      setUserReportSummary(null);
      setUserReportBreakdowns({ by_rank: [], by_status: [] });
      setUserReportMeta(null);
      setHasSearchedGuildGaps(false);
      setGuildGapRows([]);
      setGuildGapSummary(null);
      setGuildGapBreakdowns({ by_link_state: [] });
      setGuildGapMeta(null);
    }
    else if (activeTab === 'roles') { loadRoles(); loadPermissions(); loadGuildProfile(); }
    else if (activeTab === 'user-roles') loadUsers();
    else if (activeTab === 'discord-roles') { loadDiscordGuildRoles(); loadDiscordMappings(); loadRoles(); }
    else if (activeTab === 'guild') { loadGuildProfile(); loadGuildRoster(guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter); loadTrackedGuilds(); loadBannedUsers(); }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load game rank mappings when guild profile is available
  useEffect(() => {
    if ((activeTab === 'guild' || activeTab === 'roles') && guildProfile?.id) loadGameRankMappings(guildProfile.id);
  }, [activeTab, guildProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload applications when filter changes
  useEffect(() => {
    if (activeTab === 'applications') loadApplications(appFilter);
  }, [appFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'reports') loadReports(reportFilter);
  }, [reportFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when search/filter/sort changes
  useEffect(() => {
    setGuildPage(1);
  }, [guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPageSize, guildBannedFilter]);

  // Reload guild roster when search/filter/sort/page changes
  useEffect(() => {
    if (activeTab === 'guild') loadGuildRoster(guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter);
  }, [guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event handlers ──
  const openAddEvent = () => {
    setEventForm({ title: '', startsAt: '', endsAt: '', timezone: userTimezone, category: 'pvp', description: '', recurrence: { enabled: false, type: 'weekly', count: 4, customDays: 7 } });
    setEventModal({ mode: 'add' });
  };

  const openEditEvent = (ev) => {
    const tz = ev.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    setEventForm({
      title: ev.title,
      startsAt: utcToLocalInput(ev.starts_at, tz),
      endsAt: utcToLocalInput(ev.ends_at, tz),
      timezone: tz,
      category: ev.category,
      description: ev.description || '',
    });
    setEventModal({ mode: 'edit', event: ev });
  };

  const submitEvent = async (e) => {
    e.preventDefault();
    try {
      const isEdit = eventModal.mode === 'edit';
      const url = isEdit ? `/events/${eventModal.event.id}` : '/events';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = { ...eventForm };
      // Only send recurrence on create, and only if enabled
      if (isEdit || !payload.recurrence?.enabled) {
        delete payload.recurrence;
      }
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = await res.json();
        const msg = data.message || (isEdit ? 'Event updated' : 'Event created');
        showToast(msg);
        setEventModal(null);
        loadEvents();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save event');
      }
    } catch {
      showToast('Failed to save event');
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      const res = await apiFetch(`/events/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Event deleted'); loadEvents(); }
      else showToast('Failed to delete event');
    } catch { showToast('Failed to delete event'); }
  };

  const deleteEventSeries = async (seriesId) => {
    if (!window.confirm('Delete all future events in this series?')) return;
    try {
      const res = await apiFetch(`/events/series/${seriesId}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Series deleted');
        loadEvents();
      } else showToast('Failed to delete series');
    } catch { showToast('Failed to delete series'); }
  };

  // ── Application handlers ──
  const reviewApplication = async (id, status) => {
    try {
      const res = await apiFetch(`/applications/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      if (res.ok) { showToast(`Application ${status}`); loadApplications(appFilter); }
      else showToast('Failed to review application');
    } catch { showToast('Failed to review application'); }
  };

  // ── User handlers ──
  const refreshGuild = () => loadGuildRoster(guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter);

  const changeRank = async (userId, newRank) => {
    try {
      const res = await apiFetch(`/users/${userId}/rank`, { method: 'PUT', body: JSON.stringify({ rank: newRank }) });
      if (res.ok) { showToast('Rank updated'); loadUsers(); refreshGuild(); }
      else { const data = await res.json(); showToast(data.error || 'Failed to update rank'); }
    } catch { showToast('Failed to update rank'); }
  };

  const deleteUser = async (userId, displayName) => {
    if (!window.confirm(`Delete user "${displayName}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/users/${userId}`, { method: 'DELETE' });
      if (res.ok) { showToast('User deleted'); loadUsers(); refreshGuild(); }
      else showToast('Failed to delete user');
    } catch { showToast('Failed to delete user'); }
  };

  const resendInviteEmail = async (userId) => {
    try {
      const res = await apiFetch(`/users/${userId}/resend-invite`, { method: 'POST' });
      if (res.ok) showToast('Invite email sent');
      else { const data = await res.json(); showToast(data.error || 'Failed to send invite email'); }
    } catch { showToast('Failed to send invite email'); }
  };

  // ── Ban handlers ──
  const banUser = async () => {
    if (!banModal || !banReason.trim()) return;
    try {
      const res = await apiFetch(`/users/${banModal.userId}/ban`, {
        method: 'PUT',
        body: JSON.stringify({ reason: banReason.trim() }),
      });
      if (res.ok) {
        showToast(`${banModal.displayName} has been banned`);
        setBanModal(null);
        setBanReason('');
        loadBannedUsers();
        loadGuildRoster(guildSearch, guildClassFilter, guildRankFilter, guildSort, guildSortOrder, guildPage, guildPageSize, guildBannedFilter);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to ban user');
      }
    } catch { showToast('Failed to ban user'); }
  };

  const requestUnban = async () => {
    if (!unbanModal) return;
    try {
      const res = await apiFetch(`/users/${unbanModal.userId}/unban-request`, {
        method: 'PUT',
        body: JSON.stringify({ reason: unbanReason.trim() }),
      });
      if (res.ok) {
        showToast('Unban request sent to officer channel');
        setUnbanModal(null);
        setUnbanReason('');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to request unban');
      }
    } catch { showToast('Failed to request unban'); }
  };

  // ── Guild member ban/unban ──
  const banGuildMember = async () => {
    if (!banModal || !banReason.trim()) return;
    try {
      const res = await apiFetch(`/guild/members/${banModal.guildMemberId}/ban`, {
        method: 'PUT',
        body: JSON.stringify({ reason: banReason.trim() }),
      });
      if (res.ok) {
        showToast(`${banModal.displayName} has been banned`);
        setBanModal(null);
        setBanReason('');
        refreshGuild();
        loadBannedUsers();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to ban member');
      }
    } catch { showToast('Failed to ban member'); }
  };

  const unbanGuildMember = (memberId, name) => {
    setUnbanGuildModal({ memberId, displayName: name });
    setUnbanGuildReason('');
    setSelectedMember(null);
  };

  const submitUnbanGuildMember = async () => {
    if (!unbanGuildModal) return;
    try {
      const res = await apiFetch(`/guild/members/${unbanGuildModal.memberId}/unban`, {
        method: 'PUT',
        body: JSON.stringify({ reason: unbanGuildReason.trim() }),
      });
      if (res.ok) {
        showToast(`${unbanGuildModal.displayName} has been unbanned`);
        setUnbanGuildModal(null);
        setUnbanGuildReason('');
        refreshGuild();
        loadBannedUsers();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to unban member');
      }
    } catch { showToast('Failed to unban member'); }
  };

  // ── Role handlers ──
  const openAddRole = () => {
    setRoleForm({ name: '', display_name: '', color: '#ffffff', description: '', discord_role_id: '', permissions: [] });
    setRoleModal({ mode: 'add' });
  };

  const openEditRole = (role) => {
    setRoleForm({
      name: role.name,
      display_name: role.display_name,
      color: role.color || '#ffffff',
      description: role.description || '',
      discord_role_id: role.discord_role_id || '',
      permissions: role.permissions ? role.permissions.map((p) => (typeof p === 'string' ? p : p.key_name)) : [],
    });
    setRoleModal({ mode: 'edit', role });
  };

  const toggleRolePermission = (key) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((k) => k !== key)
        : [...prev.permissions, key],
    }));
  };

  const submitRole = async (e) => {
    e.preventDefault();
    try {
      const isEdit = roleModal.mode === 'edit';
      const url = isEdit ? `/roles/${roleModal.role.id}` : '/roles';
      const method = isEdit ? 'PUT' : 'POST';
      // Transform form fields to match backend API expectations
      const permissionIds = roleForm.permissions.map((key) => {
        const p = allPermissions.find((ap) => ap.key_name === key);
        return p ? p.id : null;
      }).filter(Boolean);
      const payload = {
        name: roleForm.name,
        displayName: roleForm.display_name,
        color: roleForm.color,
        description: roleForm.description,
        discordRoleId: roleForm.discord_role_id || null,
        permissionIds,
      };
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (res.ok) {
        showToast(isEdit ? 'Role updated' : 'Role created');
        setRoleModal(null);
        loadRoles();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save role');
      }
    } catch { showToast('Failed to save role'); }
  };

  const deleteRole = async (id) => {
    if (!window.confirm('Delete this role?')) return;
    try {
      const res = await apiFetch(`/roles/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Role deleted'); loadRoles(); }
      else showToast('Failed to delete role');
    } catch { showToast('Failed to delete role'); }
  };

  // ── User Roles handlers ──
  const openUserRoleModal = async (u) => {
    setUserRoleModal({ userId: u.id, username: u.display_name || u.username });
    try {
      const [rolesRes, userRolesRes] = await Promise.all([
        apiFetch('/roles'),
        apiFetch(`/roles/users/${u.id}`),
      ]);
      if (rolesRes.ok) { const data = await rolesRes.json(); setUserRoleList(data.roles); }
      if (userRolesRes.ok) {
        const data = await userRolesRes.json();
        setUserCurrentRoles(data.roles.map((r) => r.id));
      }
    } catch { /* swallow */ }
  };

  const toggleUserRole = (roleId) => {
    setUserCurrentRoles((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const saveUserRoles = async () => {
    try {
      const res = await apiFetch(`/roles/users/${userRoleModal.userId}`, {
        method: 'PUT',
        body: JSON.stringify({ roleIds: userCurrentRoles }),
      });
      if (res.ok) { showToast('User roles updated'); setUserRoleModal(null); }
      else showToast('Failed to update user roles');
    } catch { showToast('Failed to update user roles'); }
  };

  // ── Discord Roles handlers ──
  const updateDiscordMapping = (discordRoleId, field, value) => {
    setDiscordMappings((prev) => ({
      ...prev,
      [discordRoleId]: { ...prev[discordRoleId], [field]: value },
    }));
  };

  const saveDiscordMappings = async () => {
    try {
      const mappings = Object.entries(discordMappings)
        .filter(([, v]) => v.rank || v.roleId)
        .map(([discordRoleId, v]) => ({
          discordRoleId,
          siteRank: v.rank || null,
          siteRoleId: v.roleId || null,
        }));
      const res = await apiFetch('/discord-roles/mappings', {
        method: 'PUT',
        body: JSON.stringify({ mappings }),
      });
      if (res.ok) showToast('Discord mappings saved');
      else showToast('Failed to save mappings');
    } catch { showToast('Failed to save mappings'); }
  };

  const updateReportStatus = async (reportId, status) => {
    try {
      let reviewedNote = '';
      if (status === 'resolved' || status === 'dismissed') {
        const response = window.prompt('Optional moderator note:', '');
        if (response === null) return;
        reviewedNote = response.trim();
      }

      const res = await apiFetch(`/reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({ status, reviewedNote }),
      });
      if (res.ok) {
        showToast('Report updated');
        loadReports(reportFilter);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update report');
      }
    } catch {
      showToast('Failed to update report');
    }
  };

  const updateUserReportFilter = (key, value) => {
    setUserReportFilters((prev) => {
      const next = normalizeUserReportFilters({ ...prev, [key]: value });
      return next;
    });
  };

  const setUserReportActivityRange = (rangeValue) => {
    setUserReportFilters((prev) => normalizeUserReportFilters({
      ...prev,
      activity_range: rangeValue,
      ...(rangeValue === 'custom' ? {} : { activity_from: '', activity_to: '' }),
    }));
  };

  const updateGuildGapFilter = (key, value) => {
    setGuildGapFilters((prev) => normalizeGuildGapFilters({ ...prev, [key]: value }));
  };

  const setGuildGapActivityRange = (rangeValue) => {
    setGuildGapFilters((prev) => normalizeGuildGapFilters({
      ...prev,
      activity_range: rangeValue,
      ...(rangeValue === 'custom' ? {} : { activity_from: '', activity_to: '' }),
    }));
  };

  const saveUserReportPreset = async () => {
    const suggestedName = `Report ${new Date().toLocaleDateString()}`;
    const nameInput = window.prompt('Save report as:', suggestedName);
    if (!nameInput) return;
    const name = nameInput.trim();
    if (!name) return;
    try {
      const res = await apiFetch('/reports/users/presets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          filters: {
            mode: normalizeReportView(userReportView),
            user_filters: normalizeUserReportFilters(userReportFilters),
            guild_gap_filters: normalizeGuildGapFilters(guildGapFilters),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to save report preset');
        return;
      }
      await loadUserReportPresets();
      if (data.preset?.id) {
        setSelectedSavedUserReportId(String(data.preset.id));
      }
      showToast('Report preset saved');
    } catch {
      showToast('Failed to save report preset');
    }
  };

  const applySavedUserReportPreset = async (presetId) => {
    const preset = savedUserReports.find((item) => String(item.id) === String(presetId));
    if (!preset) return;
    const normalized = normalizeSavedReportConfig(preset.filters);
    setUserReportView(normalized.mode);
    setUserReportFilters(normalized.userFilters);
    setGuildGapFilters(normalized.guildGapFilters);
    setSelectedSavedUserReportId(String(preset.id));
    if (normalized.mode === 'guild_discord_gaps') {
      await loadGuildGapReports(normalized.guildGapFilters);
    } else {
      await loadUserReports(normalized.userFilters, { asReport: false });
    }
    showToast(`Loaded preset: ${preset.name}`);
  };

  const deleteSavedUserReportPreset = async () => {
    if (!selectedSavedUserReportId) return;
    const selected = savedUserReports.find((item) => String(item.id) === String(selectedSavedUserReportId));
    if (!selected) return;
    if (!window.confirm(`Delete saved report "${selected.name}"?`)) return;
    try {
      const res = await apiFetch(`/reports/users/presets/${selected.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to delete saved report');
        return;
      }
      await loadUserReportPresets();
      setSelectedSavedUserReportId('');
      showToast('Saved report removed');
    } catch {
      showToast('Failed to delete saved report');
    }
  };

  const runUserReport = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (isGuildGapView) {
      const normalizedGapFilters = normalizeGuildGapFilters(guildGapFilters);
      setGuildGapFilters(normalizedGapFilters);
      await loadGuildGapReports(normalizedGapFilters);
      return;
    }
    const normalizedUserFilters = normalizeUserReportFilters(userReportFilters);
    setUserReportFilters(normalizedUserFilters);
    await loadUserReports(normalizedUserFilters, { asReport: true });
  };

  const resetUserReportFilters = async () => {
    const defaultUserFilters = normalizeUserReportFilters(DEFAULT_USER_REPORT_FILTERS);
    const defaultGuildGapFilters = normalizeGuildGapFilters(DEFAULT_GUILD_GAP_FILTERS);
    setUserReportFilters(defaultUserFilters);
    setGuildGapFilters(defaultGuildGapFilters);
    setSelectedSavedUserReportId('');
    if (isGuildGapView) {
      await loadGuildGapReports(defaultGuildGapFilters);
    } else {
      await loadUserReports(defaultUserFilters, { asReport: false });
    }
  };

  const parseReportDate = (value) => {
    if (!value) return null;
    const raw = String(value);
    if (raw.startsWith('1000-01-01')) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateOrDash = (value) => {
    const parsed = parseReportDate(value);
    return parsed ? parsed.toLocaleDateString() : '-';
  };

  const getActivityState = (row) => {
    const lastSeenDate = parseReportDate(row.last_seen_at)
      || parseReportDate(row.last_activity_at)
      || parseReportDate(row.last_character_login_at);

    if (!lastSeenDate) {
      return { label: 'Inactive', tone: 'inactive', detail: 'No post/comment or character login yet' };
    }

    const diffDays = Math.floor((Date.now() - lastSeenDate.getTime()) / 86400000);
    if (diffDays <= 14) {
      return { label: 'Active', tone: 'active', detail: `${diffDays}d since last seen` };
    }
    if (diffDays <= 30) {
      return { label: 'Watch', tone: 'watch', detail: `${diffDays}d since last seen` };
    }
    return { label: 'Inactive', tone: 'inactive', detail: `${diffDays}d since last seen` };
  };

  const guildGapLinkStateLabel = (value) => {
    if (value === 'no_site_account') return 'No Site Account';
    if (value === 'no_discord_link') return 'No Discord Link';
    if (value === 'discord_not_active') return 'Discord Not Active';
    if (value === 'linked_active') return 'Linked + Active';
    return 'Needs Discord';
  };

  const getGuildGapActivityState = (row) => {
    const lastSeenDate = parseReportDate(row.overall_last_seen_at)
      || parseReportDate(row.last_site_seen_at)
      || parseReportDate(row.last_guild_activity_at);

    if (!lastSeenDate) {
      return { label: 'Unknown', tone: 'inactive', detail: 'No guild/site activity seen' };
    }

    const diffDays = Math.floor((Date.now() - lastSeenDate.getTime()) / 86400000);
    if (diffDays <= 14) {
      return { label: 'Active', tone: 'active', detail: `${diffDays}d since activity` };
    }
    if (diffDays <= 30) {
      return { label: 'Watch', tone: 'watch', detail: `${diffDays}d since activity` };
    }
    return { label: 'Inactive', tone: 'inactive', detail: `${diffDays}d since activity` };
  };

  const downloadUserReportCsv = (rows, reportLabel = 'user-report') => {
    const headers = [
      'user_id',
      'username',
      'display_name',
      'rank',
      'status',
      'activity_state',
      'discord_username',
      'joined_at',
      'posts',
      'comments',
      'views',
      'characters',
      'character_details',
      'top_rating',
      'open_violation_reports',
      'total_violation_reports',
      'last_activity_at',
      'last_character_login_at',
      'last_seen_at',
    ];

    const csvEscape = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) => [
        row.id,
        row.username,
        row.display_name,
        row.rank,
        row.status,
        getActivityState(row).label,
        row.discord_username,
        row.created_at,
        row.posts,
        row.comments,
        row.views,
        row.characters,
        (row.characters_detail || []).map((character) => {
          const roleLabel = Number(character.is_main) ? 'main' : 'alt';
          const classSpec = [character.class, character.spec].filter(Boolean).join(' - ') || 'Unknown';
          const topRating = Number(character.top_rating || 0);
          return `${character.character_name} (${character.realm}) [${roleLabel}] ${classSpec} ilvl:${character.item_level || 0} top:${topRating}`;
        }).join(' | '),
        row.top_rating,
        row.open_violation_reports,
        row.total_violation_reports,
        row.last_activity_at,
        row.last_character_login_at,
        row.last_seen_at,
      ].map(csvEscape).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeLabel = String(reportLabel || 'user-report')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'user-report';
    a.download = `mdga-${safeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadGuildGapCsv = (rows, reportLabel = 'guild-gap-report') => {
    const headers = [
      'guild_member_id',
      'character_name',
      'realm_slug',
      'realm_name',
      'class',
      'spec',
      'level',
      'guild_rank',
      'guild_rank_name',
      'site_user_id',
      'site_username',
      'site_display_name',
      'site_status',
      'discord_username',
      'link_state',
      'last_guild_activity_at',
      'last_site_seen_at',
      'overall_last_seen_at',
      'top_rating',
      'honorable_kills',
      'stats_fetched_at',
    ];

    const csvEscape = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) => [
        row.guild_member_id,
        row.character_name,
        row.realm_slug,
        row.realm_name,
        row.class,
        row.spec,
        row.level,
        row.guild_rank,
        row.guild_rank_name,
        row.site_user_id,
        row.site_username,
        row.site_display_name,
        row.site_status,
        row.discord_username,
        row.link_state,
        row.last_guild_activity_at,
        row.last_site_seen_at,
        row.overall_last_seen_at,
        row.top_rating,
        row.honorable_kills,
        row.stats_fetched_at,
      ].map(csvEscape).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeLabel = String(reportLabel || 'guild-gap-report')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'guild-gap-report';
    a.download = `mdga-${safeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCurrentReportCsv = async () => {
    setReportCsvExporting(true);
    try {
      if (isGuildGapView) {
        const normalized = normalizeGuildGapFilters(guildGapFilters);
        const { params } = buildGuildGapQuery(normalized, { exportAll: true });
        const res = await apiFetch(`/reports/guild-gaps?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to export guild gap report');
          return;
        }
        const rows = data.rows || [];
        if (rows.length === 0) {
          showToast('No guild gap rows to export');
          return;
        }
        downloadGuildGapCsv(rows, 'current-guild-gap-report');
        if (data.pagination?.export_truncated) {
          showToast(`Exported ${rows.length} of ${data.pagination.total_matches} rows. Refine filters to export all.`);
        } else {
          showToast(`Exported ${rows.length} guild rows`);
        }
        return;
      }

      const normalized = normalizeUserReportFilters(userReportFilters);
      const { params } = buildUserReportQuery(normalized, { exportAll: true });
      const res = await apiFetch(`/reports/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to export user report');
        return;
      }
      const rows = data.rows || [];
      if (rows.length === 0) {
        showToast('No member report rows to export');
        return;
      }
      downloadUserReportCsv(rows, 'current-user-report');
      if (data.pagination?.export_truncated) {
        showToast(`Exported ${rows.length} of ${data.pagination.total_matches} rows. Refine filters to export all.`);
      } else {
        showToast(`Exported ${rows.length} user rows`);
      }
    } catch {
      showToast('Failed to export report');
    } finally {
      setReportCsvExporting(false);
    }
  };

  const exportSavedUserReportCsv = async () => {
    if (!selectedSavedUserReportId) {
      showToast('Select a saved report first');
      return;
    }
    const preset = savedUserReports.find((item) => String(item.id) === String(selectedSavedUserReportId));
    if (!preset) {
      showToast('Saved report not found');
      return;
    }
    setSavedReportCsvExporting(true);
    try {
      const normalized = normalizeSavedReportConfig(preset.filters);
      const endpoint = normalized.mode === 'guild_discord_gaps' ? '/reports/guild-gaps' : '/reports/users';
      const { params } = normalized.mode === 'guild_discord_gaps'
        ? buildGuildGapQuery(normalized.guildGapFilters, { exportAll: true })
        : buildUserReportQuery(normalized.userFilters, { exportAll: true });
      const res = await apiFetch(`${endpoint}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to export saved report');
        return;
      }
      const rows = data.rows || [];
      if (rows.length === 0) {
        showToast('Saved report has no rows to export');
        return;
      }
      if (normalized.mode === 'guild_discord_gaps') {
        downloadGuildGapCsv(rows, preset.name || 'saved-guild-gap-report');
      } else {
        downloadUserReportCsv(rows, preset.name || 'saved-user-report');
      }
      if (data.pagination?.export_truncated) {
        showToast(`Exported ${rows.length} of ${data.pagination.total_matches} rows from "${preset.name}"`);
      } else {
        showToast(`Exported saved report: ${preset.name}`);
      }
    } catch {
      showToast('Failed to export saved report');
    } finally {
      setSavedReportCsvExporting(false);
    }
  };

  // ── Helpers ──
  const userRankIndex = RANK_ORDER.indexOf(user?.rank);

  const canModifyUser = (targetRank) => {
    const targetIndex = RANK_ORDER.indexOf(targetRank);
    return targetIndex < userRankIndex;
  };

  const maxAssignableRank = gm ? 'guildmaster' : 'veteran';
  const maxAssignableIndex = RANK_ORDER.indexOf(maxAssignableRank);

  const groupPermissions = (perms) => {
    const groups = {};
    perms.forEach((p) => {
      const cat = p.category || p.key_name.split('.')[0];
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  };

  const reportStatusLabel = (status) => {
    if (status === 'open') return 'Open';
    if (status === 'reviewing') return 'Reviewing';
    if (status === 'resolved') return 'Resolved';
    if (status === 'dismissed') return 'Dismissed';
    return status;
  };

  const reportTargetLabel = (report) => {
    if (report.target_type === 'post') {
      return report.post_title ? `Post: ${report.post_title}` : `Post #${report.target_post_id}`;
    }
    if (report.target_type === 'comment') {
      const preview = (report.comment_content || '').slice(0, 80);
      return preview ? `Comment: ${preview}${preview.length >= 80 ? '...' : ''}` : `Comment #${report.target_comment_id}`;
    }
    return 'Content';
  };

  // ── Tab definitions ──
  const tabs = [
    { id: 'events', label: 'Events' },
    { id: 'carousel', label: 'Images' },
    { id: 'applications', label: 'Applications' },
    { id: 'reports', label: 'Forum Violations' },
    { id: 'user-reports', label: 'User Reports' },
    { id: 'guild', label: 'Guild' },
    { id: 'roles', label: 'Roles' },
    ...(gm ? [
      { id: 'user-roles', label: 'User Roles' },
      { id: 'discord-roles', label: 'Discord Roles' },
    ] : []),
  ];

  const toggleGuildSort = (col) => {
    if (guildSort === col) {
      setGuildSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setGuildSort(col);
      setGuildSortOrder('ASC');
    }
  };

  // ── Render ──
  return (
    <>
      <PageHero title={gm ? 'Admin Panel' : 'Officer Panel'} subtitle="Manage the guild" />

      <div className="container section">
        {/* Tabs */}
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={activeTab === t.id ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Events Tab ── */}
        {activeTab === 'events' && (
          <div>
            <div className={styles.header}>
              <h2>Guild Events</h2>
              <div className={styles.actions}>
                <button className="btn btn--primary" onClick={openAddEvent}>Add Event</button>
              </div>
            </div>

            {events.length === 0 ? (
              <p className={styles.empty}>No events scheduled.</p>
            ) : (
              <div className={styles.eventList}>
                {events.map((ev) => {
                  const catOpt = CATEGORY_OPTIONS.find((c) => c.value === ev.category);
                  return (
                    <div key={ev.id} className={styles.eventItem}>
                      <div className={styles.eventBar} style={{ background: CATEGORY_COLORS[ev.category] || 'var(--color-gray-400)' }} />
                      <div className={styles.eventInfo}>
                        <div className={styles.eventTitle}>
                          {ev.title}
                          {ev.series_id && <span className={styles.seriesBadge}>{ev.series_index}/{ev.series_total}</span>}
                        </div>
                        <div className={styles.eventMeta}>{ev.starts_at ? formatEventTime(ev.starts_at, ev.timezone || 'America/New_York') : 'Unscheduled'} &middot; {catOpt?.label || ev.category}</div>
                      </div>
                      <div className={styles.eventActions}>
                        <button className="btn btn--secondary btn--sm" onClick={() => openEditEvent(ev)}>Edit</button>
                        {ev.series_id && <button className="btn btn--danger btn--sm" onClick={() => deleteEventSeries(ev.series_id)}>Delete Series</button>}
                        <button className="btn btn--danger btn--sm" onClick={() => deleteEvent(ev.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Carousel Tab ── */}
        {activeTab === 'carousel' && (
          <div>
            <div className={styles.header}>
              <h2>Images</h2>
            </div>
            <p className={styles.desc}>Manage homepage background and carousel images.</p>

            <div className={styles.imageManagerPanel}>
              <h3 className={styles.imageManagerTitle}>Home Background</h3>
              <p className={styles.imageManagerHint}>This image is used for the Home background hero/dashboard area.</p>
              <div className={styles.backgroundPreviewWrap}>
                <img src={backgroundImageUrl || DEFAULT_HOME_BACKGROUND_IMAGE} alt="Current Home background" className={styles.backgroundPreview} />
              </div>
              <div className={styles.carouselAddRow}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setBackgroundForm((f) => ({ ...f, file: e.target.files[0] || null, imageUrl: '' }))}
                />
                <span className={styles.carouselOr}>or</span>
                <input
                  type="text"
                  placeholder="Background URL (e.g. /images/background.png)"
                  value={backgroundForm.imageUrl}
                  onChange={(e) => setBackgroundForm((f) => ({ ...f, imageUrl: e.target.value, file: null }))}
                  className={styles.carouselUrlInput}
                />
                <button className="btn btn--primary btn--sm" onClick={saveBackgroundImage}>Save Background</button>
              </div>
            </div>

            {/* Add form */}
            <div className={styles.carouselAddForm}>
              <h3 className={styles.imageManagerTitle}>Carousel Images</h3>
              <div className={styles.carouselAddRow}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCarouselForm((f) => ({ ...f, file: e.target.files[0] || null, imageUrl: '' }))}
                />
                <span className={styles.carouselOr}>or</span>
                <input
                  type="text"
                  placeholder="Image URL (e.g. /images/photo.png)"
                  value={carouselForm.imageUrl}
                  onChange={(e) => setCarouselForm((f) => ({ ...f, imageUrl: e.target.value, file: null }))}
                  className={styles.carouselUrlInput}
                />
              </div>
              <div className={styles.carouselAddRow}>
                <input
                  type="text"
                  placeholder="Alt text (description)"
                  value={carouselForm.altText}
                  onChange={(e) => setCarouselForm((f) => ({ ...f, altText: e.target.value }))}
                  className={styles.carouselAltInput}
                />
                <input
                  type="number"
                  placeholder="Order (blank = end)"
                  value={carouselForm.sortOrder}
                  min="1"
                  onChange={(e) => setCarouselForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className={styles.carouselOrderInput}
                />
                <button className="btn btn--primary btn--sm" onClick={addCarouselImage}>Add Image</button>
              </div>
            </div>

            {/* Image list */}
            {carouselImages.length === 0 ? (
              <p className={styles.empty}>No carousel images.</p>
            ) : (
              <div className={styles.carouselGrid}>
                {carouselImages.map((img) => (
                  <div key={`${img.id}-${img.sort_order}`} className={styles.carouselCard}>
                    <img src={img.image_url} alt={img.alt_text} className={styles.carouselThumb} />
                    <div className={styles.carouselCardBody}>
                      <input
                        type="text"
                        defaultValue={img.alt_text}
                        placeholder="Alt text"
                        className={styles.carouselAltInput}
                        onBlur={(e) => {
                          if (e.target.value !== img.alt_text) updateCarouselImage(img.id, e.target.value, img.sort_order);
                        }}
                      />
                      <div className={styles.carouselCardActions}>
                        <label className={styles.carouselOrderLabel}>
                          Order:
                          <input
                            type="number"
                            defaultValue={img.sort_order}
                            min="0"
                            className={styles.carouselOrderInput}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val !== img.sort_order) updateCarouselImage(img.id, img.alt_text, val);
                            }}
                          />
                        </label>
                        <button className="btn btn--danger btn--sm" onClick={() => deleteCarouselImage(img.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Applications Tab ── */}
        {activeTab === 'applications' && (
          <div>
            <div className={styles.header}>
              <h2>Applications</h2>
              <div className={styles.actions}>
                {['pending', 'approved', 'denied'].map((f) => (
                  <button
                    key={f}
                    className={appFilter === f ? styles.appFilterActive : styles.appFilter}
                    onClick={() => setAppFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {applications.length === 0 ? (
              <p className={styles.empty}>No {appFilter} applications.</p>
            ) : (
              applications.map((app) => (
                <div key={app.id} className={styles.appCard}>
                  <div className={styles.appHeader}>
                    <strong>{app.character_name}</strong>
                    <span className={styles.appServer}>{app.server}</span>
                    <span className={styles.appDate}>{new Date(app.submitted_at).toLocaleDateString()}</span>
                  </div>
                  <div className={styles.appBody}>
                    <div><strong>Class/Spec:</strong> {app.class_spec}</div>
                    <div><strong>Discord:</strong> {app.discord_tag}</div>
                    <div><strong>Experience:</strong> {app.experience}</div>
                    <div><strong>Why Join:</strong> {app.why_join}</div>
                  </div>
                  {app.status === 'pending' ? (
                    <div className={styles.appActions}>
                      <button className="btn btn--primary btn--sm" onClick={() => reviewApplication(app.id, 'approved')}>Approve</button>
                      <button className="btn btn--danger btn--sm" onClick={() => reviewApplication(app.id, 'denied')}>Deny</button>
                    </div>
                  ) : app.status === 'approved' ? (
                    <div className={styles.appStatusApproved}>
                      Approved {app.reviewed_by_name && `by ${app.reviewed_by_name}`}
                    </div>
                  ) : (
                    <div className={styles.appStatusDenied}>
                      Denied {app.reviewed_by_name && `by ${app.reviewed_by_name}`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Users Tab ── */}
        {activeTab === 'reports' && (
          <div>
            <div className={styles.header}>
              <h2>Forum Violations</h2>
              <div className={styles.actions}>
                {['open', 'reviewing', 'resolved', 'dismissed'].map((status) => (
                  <button
                    key={status}
                    className={reportFilter === status ? styles.appFilterActive : styles.appFilter}
                    onClick={() => setReportFilter(status)}
                  >
                    {reportStatusLabel(status)} ({reportCounts[status] || 0})
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.desc}>Moderate reported forum posts and comments from members.</p>

            {reports.length === 0 ? (
              <p className={styles.empty}>No {reportFilter} reports.</p>
            ) : (
              reports.map((report) => (
                <div key={report.id} className={styles.reportCard}>
                  <div className={styles.reportHeader}>
                    <div className={styles.reportTitle}>Report #{report.id}</div>
                    <span className={`${styles.reportStatus} ${styles[`reportStatus_${report.status}`] || ''}`}>
                      {reportStatusLabel(report.status)}
                    </span>
                  </div>
                  <div className={styles.reportMeta}>
                    <span>
                      Reporter: <strong>{report.reporter_display_name || report.reporter_username}</strong>
                    </span>
                    <span>
                      Target: <strong>{reportTargetLabel(report)}</strong>
                    </span>
                    <span>
                      Created: {new Date(report.created_at).toLocaleString()}
                    </span>
                    {report.reviewed_by_username && (
                      <span>
                        Reviewed by: <strong>{report.reviewed_by_display_name || report.reviewed_by_username}</strong>
                      </span>
                    )}
                  </div>
                  <div className={styles.reportReason}>{report.reason || 'No reason provided'}</div>
                  <div className={styles.reportLinks}>
                    {report.target_post_id && (
                      <Link to={`/forum/post/${report.target_post_id}`} className={styles.reportLink}>
                        View Post
                      </Link>
                    )}
                    {report.target_comment_id && (report.comment_post_id || report.target_post_id) && (
                      <Link
                        to={`/forum/post/${report.comment_post_id || report.target_post_id}`}
                        className={styles.reportLink}
                      >
                        View Comment Context
                      </Link>
                    )}
                    {report.target_user_id && (
                      <Link to={`/profile?id=${report.target_user_id}`} className={styles.reportLink}>
                        View Target Profile
                      </Link>
                    )}
                  </div>
                  <div className={styles.reportActions}>
                    {report.status === 'open' && (
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => updateReportStatus(report.id, 'reviewing')}
                      >
                        Mark Reviewing
                      </button>
                    )}
                    {(report.status === 'open' || report.status === 'reviewing') && (
                      <>
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => updateReportStatus(report.id, 'resolved')}
                        >
                          Resolve
                        </button>
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => updateReportStatus(report.id, 'dismissed')}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                    {(report.status === 'resolved' || report.status === 'dismissed') && (
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => updateReportStatus(report.id, 'open')}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                  {report.reviewed_note && (
                    <div className={styles.reportNote}>
                      <strong>Moderator note:</strong> {report.reviewed_note}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'user-reports' && (
          <div className={styles.userReportsSection}>
            <div className={styles.header}>
              <h2>User Reports</h2>
              <div className={styles.actions}>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={exportCurrentReportCsv}
                  disabled={isGuildGapView
                    ? (!hasSearchedGuildGaps || guildGapLoading || reportCsvExporting)
                    : (!hasSearchedUserReports || userReportLoading || reportCsvExporting)}
                >
                  {reportCsvExporting ? 'Exporting...' : 'Export CSV'}
                </button>
              </div>
            </div>
            <p className={styles.desc}>
              {isGuildGapView
                ? 'Find guild members missing website/Discord linkage and monitor activity from one place.'
                : 'Search member data and generate user activity reports.'}
            </p>
            <p className={styles.userReportHint}>
              {isGuildGapView
                ? 'Tip: set Link State to "All Guild Members" and leave Search blank to audit your full roster.'
                : 'Tip: leave Search blank and click Generate Report to return all users.'}
            </p>

            <form className={styles.userReportFilters} onSubmit={runUserReport}>
              <div className={styles.userReportModeRow}>
                <label className={styles.userReportField}>
                  <span>Report Type</span>
                  <select
                    value={userReportView}
                    onChange={(e) => setUserReportView(normalizeReportView(e.target.value))}
                  >
                    {USER_REPORT_VIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.userReportRangeButtons}>
                {USER_REPORT_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={(isGuildGapView ? guildGapFilters.activity_range : userReportFilters.activity_range) === option.value ? styles.userReportRangeBtnActive : styles.userReportRangeBtn}
                    onClick={() => (isGuildGapView ? setGuildGapActivityRange(option.value) : setUserReportActivityRange(option.value))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className={styles.userReportGrid}>
                {isGuildGapView ? (
                  <>
                    <label className={styles.userReportField}>
                      <span>Search</span>
                      <input
                        type="text"
                        placeholder="character, realm, class, site user"
                        value={guildGapFilters.q}
                        onChange={(e) => updateGuildGapFilter('q', e.target.value)}
                      />
                    </label>
                    <label className={styles.userReportField}>
                      <span>Link State</span>
                      <select
                        value={guildGapFilters.link_state}
                        onChange={(e) => updateGuildGapFilter('link_state', e.target.value)}
                      >
                        {GUILD_GAP_LINK_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {guildGapFilters.activity_range === 'custom' && (
                      <>
                        <label className={styles.userReportField}>
                          <span>Active From</span>
                          <input
                            type="datetime-local"
                            value={guildGapFilters.activity_from}
                            onChange={(e) => updateGuildGapFilter('activity_from', e.target.value)}
                          />
                        </label>
                        <label className={styles.userReportField}>
                          <span>Active To</span>
                          <input
                            type="datetime-local"
                            value={guildGapFilters.activity_to}
                            onChange={(e) => updateGuildGapFilter('activity_to', e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <label className={styles.userReportField}>
                      <span>Sort By</span>
                      <select
                        value={guildGapFilters.sort_by}
                        onChange={(e) => updateGuildGapFilter('sort_by', e.target.value)}
                      >
                        <option value="overall_last_seen_at">Last Seen</option>
                        <option value="last_guild_activity_at">Last Guild Activity</option>
                        <option value="last_site_seen_at">Last Site Activity</option>
                        <option value="guild_rank">Guild Rank</option>
                        <option value="character_name">Character Name</option>
                        <option value="level">Level</option>
                        <option value="top_rating">Top Rating</option>
                        <option value="site_status">Site Status</option>
                        <option value="link_state">Link State</option>
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Direction</span>
                      <select
                        value={guildGapFilters.sort_dir}
                        onChange={(e) => updateGuildGapFilter('sort_dir', e.target.value)}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Limit</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={guildGapFilters.limit}
                        onChange={(e) => updateGuildGapFilter('limit', Number(e.target.value || 200))}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className={styles.userReportField}>
                      <span>Search</span>
                      <input
                        type="text"
                        placeholder="username, display, discord, character, realm"
                        value={userReportFilters.q}
                        onChange={(e) => updateUserReportFilter('q', e.target.value)}
                      />
                    </label>
                    <label className={styles.userReportField}>
                      <span>Rank</span>
                      <select
                        value={userReportFilters.rank}
                        onChange={(e) => updateUserReportFilter('rank', e.target.value)}
                      >
                        <option value="">All ranks</option>
                        {RANK_ORDER.map((rank) => (
                          <option key={rank} value={rank}>{rank}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Status</span>
                      <select
                        value={userReportFilters.status}
                        onChange={(e) => updateUserReportFilter('status', e.target.value)}
                      >
                        <option value="">All statuses</option>
                        {['pending_discord', 'pending_approval', 'active', 'suspended', 'rejected'].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Account Joined From</span>
                      <input
                        type="date"
                        value={userReportFilters.date_from}
                        onChange={(e) => updateUserReportFilter('date_from', e.target.value)}
                      />
                    </label>
                    <label className={styles.userReportField}>
                      <span>Account Joined To</span>
                      <input
                        type="date"
                        value={userReportFilters.date_to}
                        onChange={(e) => updateUserReportFilter('date_to', e.target.value)}
                      />
                    </label>
                    {userReportFilters.activity_range === 'custom' && (
                      <>
                        <label className={styles.userReportField}>
                          <span>Active From</span>
                          <input
                            type="datetime-local"
                            value={userReportFilters.activity_from}
                            onChange={(e) => updateUserReportFilter('activity_from', e.target.value)}
                          />
                        </label>
                        <label className={styles.userReportField}>
                          <span>Active To</span>
                          <input
                            type="datetime-local"
                            value={userReportFilters.activity_to}
                            onChange={(e) => updateUserReportFilter('activity_to', e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <label className={styles.userReportField}>
                      <span>Sort By</span>
                      <select
                        value={userReportFilters.sort_by}
                        onChange={(e) => updateUserReportFilter('sort_by', e.target.value)}
                      >
                        <option value="created_at">Joined Date</option>
                        <option value="posts">Posts</option>
                        <option value="comments">Comments</option>
                        <option value="views">Views</option>
                        <option value="characters">Characters</option>
                        <option value="top_rating">Top Rating</option>
                        <option value="open_violation_reports">Open Violations</option>
                        <option value="last_activity_at">Last Activity</option>
                        <option value="last_seen_at">Last Seen</option>
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Direction</span>
                      <select
                        value={userReportFilters.sort_dir}
                        onChange={(e) => updateUserReportFilter('sort_dir', e.target.value)}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </label>
                    <label className={styles.userReportField}>
                      <span>Limit</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={userReportFilters.limit}
                        onChange={(e) => updateUserReportFilter('limit', Number(e.target.value || 100))}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className={styles.userReportActions}>
                <button className="btn btn--primary btn--sm" type="submit" disabled={isGuildGapView ? guildGapLoading : userReportLoading}>
                  {(isGuildGapView ? guildGapLoading : userReportLoading) ? 'Generating...' : 'Generate Report'}
                </button>
                <button className="btn btn--secondary btn--sm" type="button" onClick={saveUserReportPreset}>
                  Save Report
                </button>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  disabled={isGuildGapView ? guildGapLoading : userReportLoading}
                  onClick={resetUserReportFilters}
                >
                  Reset Filters
                </button>
              </div>
              <div className={styles.userReportSavedRow}>
                <select
                  className={styles.userReportSavedSelect}
                  value={selectedSavedUserReportId}
                  onChange={(e) => setSelectedSavedUserReportId(e.target.value)}
                >
                  <option value="">Saved reports...</option>
                  {savedUserReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.name} | {(report.created_by_display_name || report.created_by_username || 'Unknown')} | {new Date(report.updated_at || report.created_at || Date.now()).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  disabled={!selectedSavedUserReportId}
                  onClick={() => applySavedUserReportPreset(selectedSavedUserReportId)}
                >
                  Load Saved
                </button>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  disabled={!selectedSavedUserReportId || savedReportCsvExporting}
                  onClick={exportSavedUserReportCsv}
                >
                  {savedReportCsvExporting ? 'Exporting...' : 'Export Saved'}
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  disabled={!selectedSavedUserReportId}
                  onClick={deleteSavedUserReportPreset}
                >
                  Delete Saved
                </button>
              </div>
            </form>

            {!isGuildGapView && hasSearchedUserReports && userReportSummary && (
              <div className={styles.userReportSummary}>
                <div className={styles.userReportSummaryCard}><span>Total Users</span><strong>{userReportSummary.total_users || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Active</span><strong>{userReportSummary.active_users || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Suspended</span><strong>{userReportSummary.suspended_users || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Total Posts</span><strong>{userReportSummary.total_posts || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Total Comments</span><strong>{userReportSummary.total_comments || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Total Views</span><strong>{userReportSummary.total_views || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Open Violations</span><strong>{userReportSummary.open_violation_reports || 0}</strong></div>
              </div>
            )}

            {!isGuildGapView && hasSearchedUserReports && (userReportBreakdowns.by_rank?.length > 0 || userReportBreakdowns.by_status?.length > 0) && (
              <div className={styles.userReportBreakdowns}>
                {userReportBreakdowns.by_rank?.length > 0 && (
                  <div className={styles.userReportBreakdownRow}>
                    <span className={styles.userReportBreakdownLabel}>By rank:</span>
                    {userReportBreakdowns.by_rank.map((item) => (
                      <span key={`rank-${item.rank_name}`} className={styles.userReportBreakdownPill}>
                        {item.rank_name}: {item.count}
                      </span>
                    ))}
                  </div>
                )}
                {userReportBreakdowns.by_status?.length > 0 && (
                  <div className={styles.userReportBreakdownRow}>
                    <span className={styles.userReportBreakdownLabel}>By status:</span>
                    {userReportBreakdowns.by_status.map((item) => (
                      <span key={`status-${item.status_name}`} className={styles.userReportBreakdownPill}>
                        {item.status_name}: {item.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isGuildGapView && hasSearchedUserReports && userReportMeta && (
              <p className={styles.userReportGenerated}>
                Generated: {new Date(userReportMeta.generated_at).toLocaleString()}
              </p>
            )}
            {!isGuildGapView && hasSearchedUserReports && userReportPagination && (
              <p className={styles.userReportPagination}>
                Showing {userReportPagination.returned_rows || 0} of {userReportPagination.total_matches || 0} matched users.
                {userReportPagination.has_more ? ' Increase limit or export CSV for more rows.' : ''}
              </p>
            )}

            {!isGuildGapView && (!hasSearchedUserReports ? (
              <p className={styles.userReportEmptyState}>Set your filters, then click Generate Report to load results.</p>
            ) : userReportRows.length === 0 ? (
              <p className={styles.empty}>No users matched these filters. Leave Search blank, then click Generate Report to load all users.</p>
            ) : (
              <div className={styles.userReportTableWrap}>
                <table className={styles.userReportTable}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Rank</th>
                      <th>Status</th>
                      <th>Activity</th>
                      <th>Account Joined</th>
                      <th>Posts</th>
                      <th>Comments</th>
                      <th>Views</th>
                      <th>Chars</th>
                      <th>Character Details</th>
                      <th>Top Rating</th>
                      <th>Open Violations</th>
                      <th>Last Activity</th>
                      <th>Last Char Login</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userReportRows.map((row) => {
                      const activity = getActivityState(row);
                      return (
                        <tr key={row.id}>
                          <td>
                            <Link to={`/profile?id=${row.id}`} className={styles.userReportProfileLink}>
                              {row.display_name || row.username}
                            </Link>
                            <div className={styles.userReportSub}>@{row.username}</div>
                          </td>
                          <td>{row.rank}</td>
                          <td>{row.status}</td>
                          <td className={styles.userReportActivityCell}>
                            <span className={`${styles.userReportActivityBadge} ${styles[`userReportActivityBadge_${activity.tone}`]}`}>
                              {activity.label}
                            </span>
                            <div className={styles.userReportSub}>{activity.detail}</div>
                          </td>
                          <td>{formatDateOrDash(row.created_at)}</td>
                          <td>{row.posts || 0}</td>
                          <td>{row.comments || 0}</td>
                          <td>{row.views || 0}</td>
                          <td>{row.characters || 0}</td>
                          <td className={styles.userReportCharactersCell}>
                            {row.characters_detail?.length > 0 ? row.characters_detail.map((character) => (
                              <div key={character.character_id} className={styles.userReportCharacterRow}>
                                <span className={styles.userReportCharacterName}>
                                  {character.character_name}
                                  {Number(character.is_main) ? ' (Main)' : ''}
                                </span>
                                <span className={styles.userReportCharacterMeta}>
                                  {character.realm || '-'} | {[character.class, character.spec].filter(Boolean).join(' - ') || 'Unknown'} | ilvl {character.item_level || 0} | top {character.top_rating || 0}
                                </span>
                              </div>
                            )) : (
                              <span className={styles.userReportSub}>No characters</span>
                            )}
                          </td>
                          <td>{row.top_rating || 0}</td>
                          <td>{row.open_violation_reports || 0}</td>
                          <td>{formatDateOrDash(row.last_activity_at)}</td>
                          <td>{formatDateOrDash(row.last_character_login_at)}</td>
                          <td>{formatDateOrDash(row.last_seen_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {isGuildGapView && hasSearchedGuildGaps && guildGapSummary && (
              <div className={styles.userReportSummary}>
                <div className={styles.userReportSummaryCard}><span>Total Members</span><strong>{guildGapSummary.total_members || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Need Discord</span><strong>{guildGapSummary.needs_discord || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>No Site Account</span><strong>{guildGapSummary.no_site_account || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>No Discord Link</span><strong>{guildGapSummary.no_discord_link || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Discord Not Active</span><strong>{guildGapSummary.discord_not_active || 0}</strong></div>
                <div className={styles.userReportSummaryCard}><span>Active 14d</span><strong>{guildGapSummary.active_14d || 0}</strong></div>
              </div>
            )}

            {isGuildGapView && hasSearchedGuildGaps && guildGapBreakdowns.by_link_state?.length > 0 && (
              <div className={styles.userReportBreakdowns}>
                <div className={styles.userReportBreakdownRow}>
                  <span className={styles.userReportBreakdownLabel}>By link state:</span>
                  {guildGapBreakdowns.by_link_state.map((item) => (
                    <span key={`gap-link-${item.link_state}`} className={styles.userReportBreakdownPill}>
                      {guildGapLinkStateLabel(item.link_state)}: {item.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isGuildGapView && hasSearchedGuildGaps && guildGapMeta && (
              <p className={styles.userReportGenerated}>
                Generated: {new Date(guildGapMeta.generated_at).toLocaleString()}
              </p>
            )}
            {isGuildGapView && hasSearchedGuildGaps && guildGapPagination && (
              <p className={styles.userReportPagination}>
                Showing {guildGapPagination.returned_rows || 0} of {guildGapPagination.total_matches || 0} matched guild members.
                {guildGapPagination.has_more ? ' Increase limit or export CSV for more rows.' : ''}
              </p>
            )}

            {isGuildGapView && (!hasSearchedGuildGaps ? (
              <p className={styles.userReportEmptyState}>Set your filters, then click Generate Report to load results.</p>
            ) : guildGapRows.length === 0 ? (
              <p className={styles.empty}>No guild members matched those gap filters.</p>
            ) : (
              <div className={styles.userReportTableWrap}>
                <table className={styles.userReportTable}>
                  <thead>
                    <tr>
                      <th>Character</th>
                      <th>Realm</th>
                      <th>Class / Spec</th>
                      <th>Guild Rank</th>
                      <th>Link State</th>
                      <th>Site User</th>
                      <th>Discord</th>
                      <th>Activity</th>
                      <th>Last Guild Activity</th>
                      <th>Last Site Seen</th>
                      <th>Last Seen</th>
                      <th>Top Rating</th>
                      <th>HKs</th>
                      <th>Stats Fetched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guildGapRows.map((row) => {
                      const activity = getGuildGapActivityState(row);
                      return (
                        <tr key={row.guild_member_id}>
                          <td>
                            <strong>{row.character_name}</strong>
                            <div className={styles.userReportSub}>Lvl {row.level || 0}</div>
                          </td>
                          <td>{row.realm_name || row.realm_slug || '-'}</td>
                          <td>{[row.class, row.spec].filter(Boolean).join(' - ') || row.class || '-'}</td>
                          <td>{row.guild_rank_name || `Rank ${row.guild_rank ?? '-'}`}</td>
                          <td><span className={styles.userReportBreakdownPill}>{guildGapLinkStateLabel(row.link_state)}</span></td>
                          <td>
                            {row.site_user_id ? (
                              <>
                                <Link to={`/profile?id=${row.site_user_id}`} className={styles.userReportProfileLink}>
                                  {row.site_display_name || row.site_username}
                                </Link>
                                <div className={styles.userReportSub}>@{row.site_username}</div>
                                <div className={styles.userReportSub}>{row.site_status || '-'}</div>
                              </>
                            ) : (
                              <span className={styles.userReportSub}>Not linked</span>
                            )}
                          </td>
                          <td>{row.discord_username || <span className={styles.userReportSub}>Not linked</span>}</td>
                          <td className={styles.userReportActivityCell}>
                            <span className={`${styles.userReportActivityBadge} ${styles[`userReportActivityBadge_${activity.tone}`]}`}>
                              {activity.label}
                            </span>
                            <div className={styles.userReportSub}>{activity.detail}</div>
                          </td>
                          <td>{formatDateOrDash(row.last_guild_activity_at)}</td>
                          <td>{formatDateOrDash(row.last_site_seen_at)}</td>
                          <td>{formatDateOrDash(row.overall_last_seen_at)}</td>
                          <td>{row.top_rating || 0}</td>
                          <td>{row.honorable_kills || 0}</td>
                          <td>{formatDateOrDash(row.stats_fetched_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        {/* ── Member Detail Modal ── */}
        {selectedMember && (() => {
          const m = selectedMember;
          const isLinked = !!m.site_user_id;
          const isSelf = m.site_user_id === user?.id;
          const isBanned = !!m.is_banned;
          const canModify = isLinked && !isSelf && canModifyUser(m.site_rank);
          return (
            <div className={styles.modalOverlay} onClick={() => setSelectedMember(null)}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <h3 style={{ marginBottom: 'var(--space-4)' }}>
                  {m.character_name}
                  {isBanned && <span className={styles.bannedBadge} style={{ marginLeft: 'var(--space-2)' }}>BANNED</span>}
                </h3>

                <div className={styles.memberDetailGrid}>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Realm</span>
                    <span>{m.realm_name || m.realm_slug}</span>
                  </div>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Level</span>
                    <span>{m.level || '-'}</span>
                  </div>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Class</span>
                    <span>{m.class || '-'}</span>
                  </div>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Race</span>
                    <span>{m.race || '-'}</span>
                  </div>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Guild Rank</span>
                    <span>{m.guild_rank_name || `Rank ${m.guild_rank}`}</span>
                  </div>
                  <div className={styles.memberDetailRow}>
                    <span className={styles.memberDetailLabel}>Site Account</span>
                    <span>
                      {isLinked ? (
                        <Link to={`/profile?id=${m.site_user_id}`} className={styles.adminProfileLink} onClick={() => setSelectedMember(null)}>
                          {m.site_display_name || 'Linked'}
                        </Link>
                      ) : 'Not linked'}
                    </span>
                  </div>
                  {isLinked && (
                    <>
                      <div className={styles.memberDetailRow}>
                        <span className={styles.memberDetailLabel}>Site Rank</span>
                        <span>{m.site_rank}</span>
                      </div>
                      <div className={styles.memberDetailRow}>
                        <span className={styles.memberDetailLabel}>Discord</span>
                        <span>{m.site_discord || '-'}</span>
                      </div>
                    </>
                  )}
                  {isBanned && (
                    <>
                      <div className={styles.memberDetailRow}>
                        <span className={styles.memberDetailLabel}>Ban Reason</span>
                        <span>{m.ban_reason || '-'}</span>
                      </div>
                      <div className={styles.memberDetailRow}>
                        <span className={styles.memberDetailLabel}>Banned By</span>
                        <span>{m.banned_by_name || '-'}</span>
                      </div>
                      <div className={styles.memberDetailRow}>
                        <span className={styles.memberDetailLabel}>Banned On</span>
                        <span>{m.banned_at ? new Date(m.banned_at).toLocaleDateString() : '-'}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Site rank change + delete — only for linked, non-self, non-banned, modifiable */}
                {isLinked && canModify && !isBanned && (
                  <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-gray-700)', paddingTop: 'var(--space-4)' }}>
                    <div className={styles.memberDetailRow} style={{ marginBottom: 'var(--space-3)' }}>
                      <span className={styles.memberDetailLabel}>Change Rank</span>
                      <select
                        className={styles.rankSelect}
                        value={m.site_rank}
                        onChange={(e) => { changeRank(m.site_user_id, e.target.value); setSelectedMember(null); }}
                      >
                        {RANK_ORDER.filter((_, i) => i <= maxAssignableIndex).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <button className="btn btn--danger btn--sm" onClick={() => { deleteUser(m.site_user_id, m.site_display_name || m.character_name); setSelectedMember(null); }}>Delete Site Account</button>
                  </div>
                )}

                {isSelf && (
                  <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-muted)', fontStyle: 'italic' }}>This is your account.</p>
                )}

                {/* Ban/Unban — available for any member except self */}
                {!isSelf && (
                  <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-gray-700)', paddingTop: 'var(--space-4)' }}>
                    {isBanned ? (
                      <button className="btn btn--primary" onClick={() => unbanGuildMember(m.id, m.character_name)}>Unban</button>
                    ) : (
                      <button className="btn btn--danger" onClick={() => { setBanModal({ guildMemberId: m.id, displayName: m.character_name }); setBanReason(''); setSelectedMember(null); }}>Ban</button>
                    )}
                  </div>
                )}

                <div className={styles.modalButtons} style={{ marginTop: 'var(--space-4)' }}>
                  <button className="btn btn--secondary" onClick={() => setSelectedMember(null)}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Ban Modal ── */}
        {banModal && (
          <div className={styles.modalOverlay} onClick={() => setBanModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>Ban {banModal.displayName}</h3>
              <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>This will ban the member and send an alert to the officer channel.{banModal.guildMemberId && banModal.userId ? ' Their site account will also be banned.' : ''}</p>
              <div className={styles.formGroup}>
                <label>Ban Reason (required)</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Why is this member being banned?"
                  rows={3}
                />
              </div>
              <div className={styles.modalButtons}>
                <button className="btn btn--secondary" onClick={() => setBanModal(null)}>Cancel</button>
                <button className="btn btn--danger" onClick={banModal.guildMemberId ? banGuildMember : banUser} disabled={!banReason.trim()}>Ban</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Unban Request Modal ── */}
        {unbanModal && (
          <div className={styles.modalOverlay} onClick={() => setUnbanModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>Request Unban for {unbanModal.displayName}</h3>
              <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>This will send an unban request to the Discord officer channel. Another officer must approve it before the ban is lifted.</p>
              <div className={styles.formGroup}>
                <label>Reason for Unban (optional)</label>
                <textarea
                  value={unbanReason}
                  onChange={(e) => setUnbanReason(e.target.value)}
                  placeholder="Why should this user be unbanned?"
                  rows={3}
                />
              </div>
              <div className={styles.modalButtons}>
                <button className="btn btn--secondary" onClick={() => setUnbanModal(null)}>Cancel</button>
                <button className="btn btn--primary" onClick={requestUnban}>Send Request</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Unban Guild Member Modal ── */}
        {unbanGuildModal && (
          <div className={styles.modalOverlay} onClick={() => setUnbanGuildModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3>Unban {unbanGuildModal.displayName}</h3>
              <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>This will unban the member and send an alert to the officer channel.</p>
              <div className={styles.formGroup}>
                <label>Unban Reason (optional)</label>
                <textarea
                  value={unbanGuildReason}
                  onChange={(e) => setUnbanGuildReason(e.target.value)}
                  placeholder="Why is this member being unbanned?"
                  rows={3}
                />
              </div>
              <div className={styles.modalButtons}>
                <button className="btn btn--secondary" onClick={() => setUnbanGuildModal(null)}>Cancel</button>
                <button className="btn btn--primary" onClick={submitUnbanGuildMember}>Unban</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Roles Tab ── */}
        {activeTab === 'roles' && (
          <div>
            <div className={styles.header}>
              <h2>Roles</h2>
              <div className={styles.actions}>
                <button className="btn btn--primary" onClick={openAddRole}>Add Role</button>
              </div>
            </div>

            {roles.length === 0 ? (
              <p className={styles.empty}>No roles defined.</p>
            ) : (
              roles.map((role) => (
                <div key={role.id} className={styles.roleCard}>
                  <div className={styles.roleHeader}>
                    <span className={styles.colorDot} style={{ background: role.color || '#fff' }} />
                    <strong>{role.display_name}</strong>
                    <span className={styles.roleName}>@{role.name}</span>
                    {role.is_default && <span className={styles.defaultBadge}>Default</span>}
                    {role.discord_role_id && <span className={styles.discordBadge} title={`Discord ID: ${role.discord_role_id}`}>Discord</span>}
                  </div>
                  {role.description && <p className={styles.roleDesc}>{role.description}</p>}
                  {role.permissions && role.permissions.length > 0 && (
                    <div className={styles.rolePerms}>
                      {role.permissions.map((p) => {
                        const key = typeof p === 'string' ? p : p.key_name;
                        return <span key={key} className={styles.permTag}>{key}</span>;
                      })}
                    </div>
                  )}
                  <div className={styles.roleActions}>
                    <button className="btn btn--secondary btn--sm" onClick={() => openEditRole(role)}>Edit</button>
                    <button className="btn btn--danger btn--sm" onClick={() => deleteRole(role.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}

            {/* Game Rank Mappings */}
            {guildProfile && (
              <div className={styles.gameRankSection}>
                <h3 className={styles.gameRankTitle}>Game Rank Mappings</h3>
                <p className={styles.gameRankDesc}>
                  Map in-game guild ranks to Discord roles and site ranks. When a rank change is detected during roster sync, the mapped Discord role and site rank will be applied automatically.
                </p>
                {gameRankRosterRanks.length === 0 ? (
                  <p className={styles.empty}>No roster data yet. Run a guild sync first.</p>
                ) : (
                  <>
                    <div className={styles.gameRankTable}>
                      <div className={`${styles.gameRankHeader} ${styles.gameRankRow}`}>
                        <span>Rank #</span>
                        <span>Label</span>
                        <span>Members</span>
                        <span>Discord Role</span>
                        <span>Site Rank</span>
                      </div>
                      {gameRankRosterRanks
                        .sort((a, b) => a.rank - b.rank)
                        .map((r) => {
                          const mapping = gameRankMappingState[r.rank] || { discord_role_id: '', site_rank: '', game_rank_name: '' };
                          return (
                            <div key={r.rank} className={styles.gameRankRow}>
                              <span className={styles.gameRankNum}>{r.rank}</span>
                              <input
                                type="text"
                                className={styles.gameRankNameInput}
                                placeholder={`Rank ${r.rank}`}
                                value={mapping.game_rank_name}
                                onChange={(e) => updateGameRankMapping(r.rank, 'game_rank_name', e.target.value)}
                              />
                              <span className={styles.gameRankCount}>{r.count}</span>
                              <select
                                value={mapping.discord_role_id}
                                onChange={(e) => updateGameRankMapping(r.rank, 'discord_role_id', e.target.value)}
                              >
                                <option value="">None</option>
                                {gameRankDiscordRoles.map((dr) => (
                                  <option key={dr.id} value={dr.id}>{dr.name}</option>
                                ))}
                              </select>
                              <select
                                value={mapping.site_rank}
                                onChange={(e) => updateGameRankMapping(r.rank, 'site_rank', e.target.value)}
                              >
                                <option value="">No change</option>
                                {RANK_ORDER.map((rank) => (
                                  <option key={rank} value={rank}>{rank}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                    </div>
                    <button
                      className="btn btn--primary"
                      style={{ marginTop: 'var(--space-4)' }}
                      onClick={() => saveGameRankMappings(guildProfile.id)}
                    >
                      Save Mappings
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── User Roles Tab (GM only) ── */}
        {activeTab === 'user-roles' && gm && (
          <div>
            <div className={styles.header}>
              <h2>User Roles</h2>
            </div>

            <div className={styles.guildFilters}>
              <input
                type="text"
                className={styles.guildSearchInput}
                placeholder="Search members..."
                value={userRolesSearch || ''}
                onChange={(e) => setUserRolesSearch(e.target.value)}
              />
            </div>

            {users.length === 0 ? (
              <p className={styles.empty}>No users found.</p>
            ) : (
              <div className={styles.guildRosterTable}>
                <div className={`${styles.guildRosterHeader} ${styles.userRolesRow}`}>
                  <span>Name</span>
                  <span>Username</span>
                  <span>Rank</span>
                  <span>Actions</span>
                </div>
                {users
                  .filter((u) => {
                    if (!userRolesSearch) return true;
                    const q = userRolesSearch.toLowerCase();
                    return (u.display_name || '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
                  })
                  .map((u) => (
                  <div key={u.id} className={styles.userRolesRow}>
                    <span>
                      <Link to={`/profile?id=${u.id}`} className={styles.adminProfileLink}><strong>{u.display_name || u.username}</strong></Link>
                    </span>
                    <span className={styles.username}>@{u.username}</span>
                    <span><span className={`rank-badge rank-badge--${u.rank}`}>{u.rank}</span></span>
                    <span className={styles.userActions}>
                      <button className="btn btn--secondary btn--sm" onClick={() => resendInviteEmail(u.id)}>Resend Invite</button>
                      <button className="btn btn--secondary btn--sm" onClick={() => openUserRoleModal(u)}>Manage Roles</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Discord Roles Tab (GM only) ── */}
        {activeTab === 'discord-roles' && gm && (
          <div>
            <div className={styles.header}>
              <h2>Discord Roles</h2>
              <div className={styles.actions}>
                <button className="btn btn--primary" onClick={saveDiscordMappings}>Save Mappings</button>
              </div>
            </div>
            <p className={styles.desc}>Map Discord server roles to member ranks and permission roles.</p>

            {discordGuildRoles.length === 0 ? (
              <p className={styles.empty}>No Discord roles found. Is the bot connected?</p>
            ) : (
              discordGuildRoles.map((dr) => {
                const mapping = discordMappings[dr.id] || { rank: '', roleId: '' };
                return (
                  <div key={dr.id} className={styles.discordRow}>
                    <div className={styles.discordInfo}>
                      <span className={styles.discordColor} style={{ background: dr.color ? `#${dr.color.toString(16).padStart(6, '0')}` : '#99AAB5' }} />
                      <span className={styles.discordName}>{dr.name}</span>
                      {dr.managed && <span className={styles.discordBotBadge}>Bot</span>}
                    </div>
                    <div className={styles.discordSelects}>
                      <label className={styles.discordLabel}>
                        <span>Rank</span>
                        <select
                          className={styles.discordSelect}
                          value={mapping.rank}
                          onChange={(e) => updateDiscordMapping(dr.id, 'rank', e.target.value)}
                        >
                          <option value="">None</option>
                          {RANK_ORDER.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.discordLabel}>
                        <span>Permission Role</span>
                        <select
                          className={styles.discordSelect}
                          value={mapping.roleId}
                          onChange={(e) => updateDiscordMapping(dr.id, 'roleId', e.target.value)}
                        >
                          <option value="">None</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.display_name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Guild Tab ── */}
        {activeTab === 'guild' && (
          <div>
            {/* Guild Profile Card */}
            {guildProfile ? (
              <div className={styles.guildProfileCard}>
                <div>
                  <h2 className={styles.guildName}>{guildProfile.name}</h2>
                  <div className={styles.guildMeta}>
                    <span>{guildProfile.faction}</span>
                    <span>{guildProfile.member_count} members</span>
                    <span>{guildProfile.achievement_points} achievement pts</span>
                    {guildProfile.last_synced_at && (
                      <span>Last synced: {new Date(guildProfile.last_synced_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    className="btn btn--primary"
                    onClick={triggerGuildSync}
                    disabled={guildSyncing}
                  >
                    {guildSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.guildProfileCard}>
                <p className={styles.empty}>No primary guild configured. Run a sync to populate data.</p>
                <div className={styles.actions}>
                  <button
                    className="btn btn--primary"
                    onClick={triggerGuildSync}
                    disabled={guildSyncing}
                  >
                    {guildSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            )}

            {/* Search & Filters */}
            <div className={styles.guildFilters}>
              <input
                type="text"
                placeholder="Search members..."
                className={styles.guildSearchInput}
                value={guildSearch}
                onChange={(e) => setGuildSearch(e.target.value)}
              />
              <div className={styles.actions}>
                <button
                  className={guildClassFilter === '' ? styles.appFilterActive : styles.appFilter}
                  onClick={() => setGuildClassFilter('')}
                >
                  All
                </button>
                {guildClassCounts.map((c) => (
                  <button
                    key={c.class}
                    className={guildClassFilter === c.class ? styles.appFilterActive : styles.appFilter}
                    onClick={() => setGuildClassFilter(c.class)}
                  >
                    {c.class} ({c.count})
                  </button>
                ))}
              </div>
              <button
                className={guildBannedFilter ? styles.appFilterActive : styles.appFilter}
                onClick={() => setGuildBannedFilter((v) => !v)}
                style={guildBannedFilter ? { background: 'var(--color-red)', borderColor: 'var(--color-red)', color: '#fff' } : {}}
              >
                Banned Only
              </button>
            </div>

            {/* Pagination Controls */}
            <div className={styles.guildPagination}>
              <div className={styles.guildPageInfo}>
                {guildTotal} member{guildTotal !== 1 ? 's' : ''} total
              </div>
              <div className={styles.guildPageSizes}>
                <span>Show:</span>
                {[10, 20, 50, 100, 'all'].map((size) => (
                  <button
                    key={size}
                    className={String(guildPageSize) === String(size) ? styles.appFilterActive : styles.appFilter}
                    onClick={() => setGuildPageSize(size)}
                  >
                    {size === 'all' ? 'All' : size}
                  </button>
                ))}
              </div>
              {guildPageSize !== 'all' && guildTotal > guildPageSize && (
                <div className={styles.guildPageNav}>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={guildPage <= 1}
                    onClick={() => setGuildPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span>Page {guildPage} of {Math.ceil(guildTotal / guildPageSize)}</span>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={guildPage >= Math.ceil(guildTotal / guildPageSize)}
                    onClick={() => setGuildPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Roster Table */}
            {guildMembers.length === 0 ? (
              <p className={styles.empty}>No members found.</p>
            ) : (
              <div className={styles.guildRosterTable}>
                <div className={`${styles.guildRosterHeader} ${styles.guildRow}`}>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('character_name')}>
                    Name {guildSort === 'character_name' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('level')}>
                    Lvl {guildSort === 'level' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('class')}>
                    Class {guildSort === 'class' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('race')}>
                    Race {guildSort === 'race' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('guild_rank')}>
                    Rank {guildSort === 'guild_rank' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('site_display_name')}>
                    Site Account {guildSort === 'site_display_name' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <button className={styles.guildSortBtn} onClick={() => toggleGuildSort('discord_username')}>
                    Discord {guildSort === 'discord_username' ? (guildSortOrder === 'ASC' ? '\u25B2' : '\u25BC') : ''}
                  </button>
                  <span>Status</span>
                </div>
                {guildMembers.map((m) => (
                  <div key={m.id} className={`${styles.guildRow} ${styles.guildRowClickable}${m.is_banned ? ' ' + styles.guildRowBanned : ''}`} onClick={() => setSelectedMember(m)}>
                    <span className={styles.guildMemberName}>{m.character_name}</span>
                    <span>{m.level}</span>
                    <span>{m.class || '-'}</span>
                    <span>{m.race || '-'}</span>
                    <span>{m.guild_rank_name || m.guild_rank}</span>
                    <span>
                      {m.site_user_id ? (
                        <span className={styles.adminProfileLink}>
                          {m.site_display_name || 'Linked'}
                        </span>
                      ) : (
                        <span className={styles.guildEmpty}>-</span>
                      )}
                    </span>
                    <span className={m.site_discord ? '' : styles.guildDiscordMissing}>
                      {m.site_discord || '-'}
                    </span>
                    <span>
                      {m.is_banned ? <span className={styles.bannedBadge}>BANNED</span> : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Banned Users */}
            {bannedUsers.length > 0 && (() => {
              const bannedTotalPages = Math.max(1, Math.ceil(bannedUsers.length / USERS_PER_PAGE));
              const pagedBanned = bannedUsers.slice((bannedPage - 1) * USERS_PER_PAGE, bannedPage * USERS_PER_PAGE);
              return (
                <div className={styles.usersColumn + ' ' + styles.bannedColumn} style={{ marginTop: 'var(--space-6)' }}>
                  <div className={styles.columnHeader + ' ' + styles.bannedHeader}>
                    <div className={styles.columnTitle}>
                      <span className={styles.columnIconBanned}>&#9888;</span>
                      <h2>Banned Users</h2>
                    </div>
                    <span className={styles.columnCount + ' ' + styles.bannedCount}>{bannedUsers.length}</span>
                  </div>
                  <div className={styles.columnBody}>
                    {pagedBanned.map((u) => (
                      <div key={u.id} className={styles.userCard + ' ' + styles.bannedCard}>
                        <div className={styles.userCardTop}>
                          <span className={styles.bannedBadge}>BANNED</span>
                          <div className={styles.userCardName}>
                            <strong>{u.display_name || u.username}</strong>
                            <span className={styles.username}>@{u.username}</span>
                          </div>
                        </div>
                        <div className={styles.banInfo}>
                          <span className={styles.banReason}>{u.ban_reason || 'No reason provided'}</span>
                          <span className={styles.banMeta}>
                            {u.banned_at ? new Date(u.banned_at).toLocaleDateString() : 'Unknown date'}
                            {u.banned_by_name && <> &middot; by {u.banned_by_name}</>}
                          </span>
                        </div>
                        <div className={styles.userCardActions}>
                          <button className="btn btn--primary btn--sm" onClick={() => { setUnbanModal({ userId: u.id, displayName: u.display_name || u.username }); setUnbanReason(''); }}>Request Unban</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {bannedTotalPages > 1 && (
                    <div className={styles.columnPager}>
                      <button className="btn btn--secondary btn--sm" onClick={() => setBannedPage((p) => Math.max(1, p - 1))} disabled={bannedPage <= 1}>&laquo; Prev</button>
                      <span className={styles.pageInfo}>Page {bannedPage} of {bannedTotalPages}</span>
                      <button className="btn btn--secondary btn--sm" onClick={() => setBannedPage((p) => Math.min(bannedTotalPages, p + 1))} disabled={bannedPage >= bannedTotalPages}>Next &raquo;</button>
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}
      </div>

      {/* ── Event Modal ── */}
      {eventModal && (
        <div className={styles.modalOverlay} onClick={() => setEventModal(null)}>
          <div className={styles.modalEvent} onClick={(e) => e.stopPropagation()}>
            <h3>{eventModal.mode === 'edit' ? 'Edit Event' : 'Add Event'}</h3>
            <form onSubmit={submitEvent}>
              <div className={styles.formGroup}>
                <label>Title</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Category</label>
                  <select
                    value={eventForm.category}
                    onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Timezone</label>
                  <select
                    value={eventForm.timezone}
                    onChange={(e) => setEventForm((f) => ({ ...f, timezone: e.target.value }))}
                  >
                    {getTimezoneOptions().map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Start Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(e) => setEventForm((f) => ({ ...f, startsAt: e.target.value }))}
                    required
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>End Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={eventForm.endsAt}
                    onChange={(e) => setEventForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                  {eventForm.startsAt && eventForm.endsAt && (
                    <span className={styles.durationHint}>{computeDuration(eventForm.startsAt, eventForm.endsAt)}</span>
                  )}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {eventModal.mode === 'add' && (
                <div className={styles.recurrenceSection}>
                  <label className={styles.recurrenceToggle}>
                    <input
                      type="checkbox"
                      checked={eventForm.recurrence.enabled}
                      onChange={(e) => setEventForm((f) => ({ ...f, recurrence: { ...f.recurrence, enabled: e.target.checked } }))}
                    />
                    Repeat this event
                  </label>

                  {eventForm.recurrence.enabled && (
                    <div className={styles.recurrenceFields}>
                      <div className={styles.formRow}>
                        <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                          <label>Frequency</label>
                          <select
                            value={eventForm.recurrence.type}
                            onChange={(e) => setEventForm((f) => ({ ...f, recurrence: { ...f.recurrence, type: e.target.value } }))}
                          >
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Biweekly</option>
                            <option value="custom">Custom interval</option>
                          </select>
                        </div>
                        <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                          <label>Occurrences</label>
                          <input
                            type="number"
                            min="2"
                            max="52"
                            value={eventForm.recurrence.count}
                            onChange={(e) => setEventForm((f) => ({ ...f, recurrence: { ...f.recurrence, count: Number(e.target.value) || 2 } }))}
                          />
                        </div>
                        {eventForm.recurrence.type === 'custom' && (
                          <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                            <label>Every __ days</label>
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={eventForm.recurrence.customDays}
                              onChange={(e) => setEventForm((f) => ({ ...f, recurrence: { ...f.recurrence, customDays: Number(e.target.value) || 1 } }))}
                            />
                          </div>
                        )}
                      </div>
                      {eventForm.startsAt && (
                        <div className={styles.recurrencePreview}>
                          Creates {eventForm.recurrence.count} events: {computePreviewDates(eventForm.startsAt, eventForm.recurrence.type, eventForm.recurrence.count, eventForm.recurrence.customDays).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.modalButtons}>
                <button type="button" className="btn btn--secondary" onClick={() => setEventModal(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary">
                  {eventModal.mode === 'edit' ? 'Save' : eventForm.recurrence.enabled ? `Create ${eventForm.recurrence.count} Events` : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Role Modal ── */}
      {roleModal && (
        <div className={styles.modalOverlay} onClick={() => setRoleModal(null)}>
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <h3>{roleModal.mode === 'edit' ? 'Edit Role' : 'Add Role'}</h3>
            <form onSubmit={submitRole}>
              <div className={styles.formRow}>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Name (slug)</label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={roleForm.display_name}
                    onChange={(e) => setRoleForm((f) => ({ ...f, display_name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Color</label>
                  <input
                    type="color"
                    value={roleForm.color}
                    onChange={(e) => setRoleForm((f) => ({ ...f, color: e.target.value }))}
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.formGroupGrow}`}>
                  <label>Discord Role ID</label>
                  <input
                    type="text"
                    value={roleForm.discord_role_id}
                    onChange={(e) => setRoleForm((f) => ({ ...f, discord_role_id: e.target.value }))}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Permission Grid */}
              {allPermissions.length > 0 && (
                <>
                  <label className={`${styles.permGroupTitle} ${styles.permLabel}`}>Permissions</label>
                  <div className={styles.permGrid}>
                    {Object.entries(groupPermissions(allPermissions)).map(([cat, perms]) => (
                      <div key={cat} className={styles.permGroup}>
                        <div className={styles.permGroupTitle}>{cat}</div>
                        {perms.map((p) => {
                          const canToggle = gm || hasPermission(p.key_name);
                          return (
                            <label
                              key={p.key_name}
                              className={`${styles.permCheckbox} ${!canToggle ? styles.permCheckboxDisabled : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={roleForm.permissions.includes(p.key_name)}
                                onChange={() => canToggle && toggleRolePermission(p.key_name)}
                                disabled={!canToggle}
                              />
                              <span className={styles.permCheckboxLabel}>{p.display_name || p.key_name}</span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className={styles.modalButtons}>
                <button type="button" className="btn btn--secondary" onClick={() => setRoleModal(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary">{roleModal.mode === 'edit' ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── User Role Modal ── */}
      {userRoleModal && (
        <div className={styles.modalOverlay} onClick={() => setUserRoleModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Roles for {userRoleModal.username}</h3>

            {userRoleList.length === 0 ? (
              <p className={styles.empty}>No roles available.</p>
            ) : (
              userRoleList.map((role) => (
                <label key={role.id} className={styles.roleAssign}>
                  <input
                    type="checkbox"
                    checked={userCurrentRoles.includes(role.id)}
                    onChange={() => toggleUserRole(role.id)}
                  />
                  <span className={styles.colorDot} style={{ background: role.color || '#fff' }} />
                  <span className={styles.roleAssignLabel}>{role.display_name}</span>
                </label>
              ))
            )}

            <div className={styles.modalButtons}>
              <button type="button" className="btn btn--secondary" onClick={() => setUserRoleModal(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={saveUserRoles}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
