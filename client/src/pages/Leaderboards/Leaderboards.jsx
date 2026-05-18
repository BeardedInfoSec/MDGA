import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { BRACKET_LABELS, FORMAT_NUMBER, SECTIONS } from '../../data/leaderboardData';
import { armoryUrl } from '../../utils/helpers';
import styles from './Leaderboards.module.css';

const PAGE_SIZES = [20, 50, 100];

// Flatten all brackets in a stable order so the title band can show the
// total count and the sidebar can render section dividers in order.
const ALL_BRACKETS = Object.entries(SECTIONS).flatMap(([sectionKey, sec]) =>
  sec.brackets.map((b) => ({ ...b, sectionKey, sectionLabel: sec.label }))
);

function findSectionByBracket(bracketKey) {
  for (const [key, sec] of Object.entries(SECTIONS)) {
    if (sec.brackets.some((b) => b.key === bracketKey)) return key;
  }
  return 'pvp';
}

export default function Leaderboards() {
  useDocumentTitle('Leaderboards | MDGA');
  const { user, isLoggedIn, apiFetch, hasPermission } = useAuth();

  const [bracket, setBracket] = useState('solo_shuffle');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Search state — debounced to avoid hammering the API on every keystroke
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);

  // Client-side column sort. null = use server order (which is bracket DESC).
  // Each column has a natural default direction picked when first selected.
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeSection = findSectionByBracket(bracket);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('bracket', bracket);
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (sortKey) {
        params.set('sort_by', sortKey);
        params.set('sort_dir', sortDir);
      }
      const res = await apiFetch(`/leaderboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      } else {
        setEntries([]);
        setTotal(0);
      }
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, bracket, page, pageSize, debouncedSearch, sortKey, sortDir]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  function handleBracketClick(bracketKey) {
    setBracket(bracketKey);
    setPage(1);
    // Different bracket → "value" / "winRate" mean different things; reset.
    setSortKey(null);
  }

  const SORT_DEFAULTS = {
    rank: 'asc',
    character: 'asc',
    player: 'asc',
    class: 'asc',
    value: 'desc',
    winRate: 'desc',
  };

  function handleSort(key) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(SORT_DEFAULTS[key] || 'asc');
    }
  }

  function SortHeader({ sortKey: key, label, align }) {
    const active = sortKey === key;
    const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <th
        className={`${styles.sortableHeader} ${active ? styles.sortableHeaderActive : ''} ${align === 'right' ? styles.sortableHeaderRight : ''}`}
        onClick={() => handleSort(key)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className={styles.sortHeaderInner}>
          <span>{label}</span>
          <Icon size={12} aria-hidden="true" className={styles.sortIcon} />
        </span>
      </th>
    );
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
  }

  async function handleRefreshGuild() {
    setRefreshing(true);
    try {
      const res = await apiFetch('/leaderboard/refresh-guild', { method: 'POST' });
      if (res.ok) fetchLeaderboard();
    } finally {
      setTimeout(() => setRefreshing(false), 1500);
    }
  }

  function clearSearch() {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  }

  const formatValue = (entry) => {
    const raw = entry[bracket] || entry.ps_item_level || 0;
    if (FORMAT_NUMBER.has(bracket)) return (raw || 0).toLocaleString();
    return raw;
  };

  const isWinRateBracket = bracket === 'arenas_won' || bracket === 'bgs_won';

  // Server stamps `leaderboard_rank` on every row (ROW_NUMBER over the
  // bracket metric DESC), so the Rank column stays meaningful regardless
  // of how the user re-sorts.
  const getRowClasses = (entry) => {
    const classes = [styles.row];
    if (!debouncedSearch) {
      if (entry.leaderboard_rank === 1) classes.push(styles.rowTop1);
      if (entry.leaderboard_rank === 2) classes.push(styles.rowTop2);
      if (entry.leaderboard_rank === 3) classes.push(styles.rowTop3);
    }
    if (user && entry.user_id === user.id) classes.push(styles.rowOwn);
    return classes.join(' ');
  };

  const getSpec = (entry) => entry.spec || entry.stats_spec || entry.uc_spec || '';

  const getWinRate = (entry) => {
    if (bracket === 'arenas_won') {
      const played = entry.arenas_played;
      const won = entry.arenas_won;
      return played > 0 ? `${((won / played) * 100).toFixed(1)}%` : '-';
    }
    if (bracket === 'bgs_won') {
      const played = entry.bgs_played;
      const won = entry.bgs_won;
      return played > 0 ? `${((won / played) * 100).toFixed(1)}%` : '-';
    }
    return '-';
  };

  const toggleExpand = (id) => setExpandedId((prev) => prev === id ? null : id);

  const fmt = (v) => (v || 0).toLocaleString();

  // Title band stats — derived from the current view + bracket totals.
  // "Top X" always pulls the actual bracket leader (leaderboard_rank === 1),
  // not the first row of whatever sort the user has applied.
  const stats = useMemo(() => {
    const leader = entries.find((e) => e.leaderboard_rank === 1) || null;
    const topRaw = leader ? (leader[bracket] || 0) : 0;
    const topDisplay = topRaw
      ? (FORMAT_NUMBER.has(bracket) ? topRaw.toLocaleString() : String(topRaw))
      : '—';
    return [
      { value: total ? total.toLocaleString() : '—', label: 'Ranked here' },
      { value: topDisplay, label: `Top ${BRACKET_LABELS[bracket] || ''}`.trim() },
      { value: String(ALL_BRACKETS.length), label: 'Brackets' },
      { value: refreshing ? 'Refreshing…' : 'Live', label: 'Status' },
    ];
  }, [entries, bracket, total, refreshing]);

  const renderExpandedRow = (entry, colSpan) => {
    const arenaWinRate = entry.arenas_played > 0
      ? `${((entry.arenas_won / entry.arenas_played) * 100).toFixed(1)}%` : '-';
    const bgWinRate = entry.bgs_played > 0
      ? `${((entry.bgs_won / entry.bgs_played) * 100).toFixed(1)}%` : '-';
    return (
      <tr className={styles.expandedRow}>
        <td colSpan={colSpan}>
          <div className={styles.expandedGrid}>
            <div className={styles.expandedSection}>
              <h4 className={styles.expandedHeading}>PvP</h4>
              <div className={styles.statGrid}>
                <div className={styles.stat}><span className={styles.statLabel}>Solo Shuffle</span><span className={styles.statValue}>{entry.solo_shuffle || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>3v3</span><span className={styles.statValue}>{entry.arena_3v3 || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>2v2</span><span className={styles.statValue}>{entry.arena_2v2 || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>RBG</span><span className={styles.statValue}>{entry.rbg_rating || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Honor Kills</span><span className={styles.statValue}>{fmt(entry.honorable_kills)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Killing Blows</span><span className={styles.statValue}>{fmt(entry.killing_blows)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Arenas</span><span className={styles.statValue}>{fmt(entry.arenas_won)} / {fmt(entry.arenas_played)} ({arenaWinRate})</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>BGs</span><span className={styles.statValue}>{fmt(entry.bgs_won)} / {fmt(entry.bgs_played)} ({bgWinRate})</span></div>
              </div>
            </div>
            <div className={styles.expandedSection}>
              <h4 className={styles.expandedHeading}>PvE</h4>
              <div className={styles.statGrid}>
                <div className={styles.stat}><span className={styles.statLabel}>Item Level</span><span className={styles.statValue}>{entry.ps_item_level || '-'}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>M+ Rating</span><span className={styles.statValue}>{entry.mythic_plus_rating || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Highest Key</span><span className={styles.statValue}>+{entry.highest_mplus_key || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Mythic Bosses</span><span className={styles.statValue}>{entry.mythic_bosses_killed || 0}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Dungeons</span><span className={styles.statValue}>{fmt(entry.dungeons_entered)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Raids</span><span className={styles.statValue}>{fmt(entry.raids_entered)}</span></div>
              </div>
            </div>
            <div className={styles.expandedSection}>
              <h4 className={styles.expandedHeading}>General</h4>
              <div className={styles.statGrid}>
                <div className={styles.stat}><span className={styles.statLabel}>Achievements</span><span className={styles.statValue}>{fmt(entry.achievement_points)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Quests</span><span className={styles.statValue}>{fmt(entry.quests_completed)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Mob Kills</span><span className={styles.statValue}>{fmt(entry.creatures_killed)}</span></div>
                <div className={styles.stat}><span className={styles.statLabel}>Deaths</span><span className={styles.statValue}>{fmt(entry.total_deaths)}</span></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const colSpan = isWinRateBracket ? 7 : 6;

  return (
    <div className={styles.page}>
      <header className={styles.titleBand}>
        <div className={styles.titleBandInner}>
          <span className={styles.eyebrow}>Guild Rankings</span>
          <h1 className={styles.pageTitle}>Leaderboards</h1>
          <p className={styles.pageSubtitle}>
            PvP, PvE, and achievement standings across the warband. Click any row to
            expand a member&apos;s full stat sheet.
            {!isLoggedIn && (
              <>
                {' '}<Link to="/login" className={styles.signInNudge}>Sign in</Link> to see
                the player behind each character.
              </>
            )}
          </p>
          <div className={styles.statsInline}>
            {stats.map((s) => (
              <div key={s.label} className={styles.statsItem}>
                <span className={styles.statsValue}>{s.value}</span>
                <span className={styles.statsLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Sticky bracket sidebar */}
        <aside className={styles.sidebar} aria-label="Bracket categories">
          <div className={styles.sidebarSticky}>
            <span className={styles.sidebarLabel}>Brackets</span>
            <nav className={styles.sidebarNav}>
              {Object.entries(SECTIONS).map(([sectionKey, sec]) => (
                <div key={sectionKey} className={styles.sidebarGroup}>
                  <span className={`${styles.sidebarGroupLabel} ${activeSection === sectionKey ? styles.sidebarGroupLabelActive : ''}`}>
                    {sec.label}
                  </span>
                  {sec.brackets.map((b) => {
                    const isActive = bracket === b.key;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                        onClick={() => handleBracketClick(b.key)}
                      >
                        <span className={styles.sidebarItemTitle}>{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className={styles.content}>
          {/* Search + officer controls */}
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={isLoggedIn ? 'Search by character or Discord name…' : 'Search by character name…'}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={clearSearch}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {hasPermission('leaderboard.bulk_refresh') ? (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleRefreshGuild}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing…' : 'Refresh Guild Stats'}
              </button>
            ) : null}
          </div>

          {debouncedSearch ? (
            <div className={styles.searchSummary}>
              <span>
                {total.toLocaleString()} match{total === 1 ? '' : 'es'} for{' '}
                <strong>&ldquo;{debouncedSearch}&rdquo;</strong> in {BRACKET_LABELS[bracket] || bracket}
              </span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={clearSearch}>
                Clear search
              </button>
            </div>
          ) : null}

          {/* Table */}
          {loading ? (
            <p className={styles.empty}>Loading leaderboard…</p>
          ) : entries.length === 0 ? (
            <p className={styles.empty}>
              {debouncedSearch
                ? `No matches for "${debouncedSearch}" in this bracket.`
                : 'No entries yet for this bracket.'}
            </p>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <SortHeader sortKey="rank" label="Rank" />
                      <SortHeader sortKey="character" label="Character" />
                      <SortHeader sortKey="player" label="Player" />
                      <SortHeader sortKey="class" label="Class / Spec" />
                      <SortHeader sortKey="value" label={BRACKET_LABELS[bracket] || 'Value'} />
                      {isWinRateBracket ? <SortHeader sortKey="winRate" label="Win Rate" /> : null}
                      <th>Armory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => {
                      const id = entry.id || index;
                      const isExpanded = expandedId === id;
                      return (
                        <React.Fragment key={id}>
                          <tr
                            className={`${getRowClasses(entry)} ${styles.clickableRow} ${isExpanded ? styles.rowExpanded : ''}`}
                            onClick={() => toggleExpand(id)}
                          >
                            <td className={styles.rank}>{entry.leaderboard_rank}</td>
                            <td>
                              <span className={styles.charLink}>{entry.character_name}</span>
                              {entry.realm_slug ? (
                                <span className={styles.realmMeta}>
                                  {' '}— {entry.realm || entry.realm_slug}
                                </span>
                              ) : null}
                              {entry.user_id && entry.is_main ? <span className={styles.mainTag}>Main</span> : null}
                            </td>
                            <td>
                              {entry.user_id ? (
                                <Link
                                  to={`/profile?id=${entry.user_id}`}
                                  className={styles.playerLink}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className={`rank-badge rank-badge--${entry.user_rank}`}>
                                    {entry.display_name}
                                  </span>
                                </Link>
                              ) : (
                                <span className={styles.emptyCell}>—</span>
                              )}
                            </td>
                            <td>{`${entry.class || ''}${getSpec(entry) ? ` — ${getSpec(entry)}` : ''}`}</td>
                            <td className={styles.rating}>{formatValue(entry)}</td>
                            {isWinRateBracket ? <td>{getWinRate(entry)}</td> : null}
                            <td>
                              {entry.realm_slug && entry.character_name ? (
                                <a
                                  href={armoryUrl(entry.realm_slug, entry.character_name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.armoryLink}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Armory
                                </a>
                              ) : null}
                            </td>
                          </tr>
                          {isExpanded ? renderExpandedRow(entry, colSpan) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className={styles.pagination}>
                <div className={styles.pageSizeWrap}>
                  <span className={styles.pageSizeLabel}>Show:</span>
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={pageSize === size ? styles.pageSizeBtnActive : styles.pageSizeBtn}
                      onClick={() => handlePageSizeChange(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <div className={styles.pageControls}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Prev
                  </button>
                  <span className={styles.pageInfo}>
                    Page {page} of {totalPages} ({total.toLocaleString()} total)
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
