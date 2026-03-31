import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { BRACKET_LABELS, FORMAT_NUMBER, SECTIONS } from '../../data/leaderboardData';
import { armoryUrl } from '../../utils/helpers';
import PageHero from '../../components/common/PageHero';
import { Table, TableWrap } from '../../components/ui';
import styles from './Leaderboards.module.css';

const PAGE_SIZES = [20, 50, 100];

export default function Leaderboards() {
  useDocumentTitle('Leaderboards | MDGA');

  const { user, apiFetch, hasPermission } = useAuth();

  const [section, setSection] = useState('pvp');
  const [bracket, setBracket] = useState('solo_shuffle');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLeaderboard = useCallback(async (bracketKey, pg, ps) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/leaderboard?bracket=${bracketKey}&page=${pg}&page_size=${ps}`);
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
  }, [apiFetch]);

  useEffect(() => {
    fetchLeaderboard(bracket, page, pageSize);
  }, [bracket, page, pageSize, fetchLeaderboard]);

  const handleSectionClick = (sectionKey) => {
    setSection(sectionKey);
    const firstBracket = SECTIONS[sectionKey].brackets[0].key;
    setBracket(firstBracket);
    setPage(1);
  };

  const handleBracketClick = (bracketKey) => {
    setBracket(bracketKey);
    setPage(1);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleRefreshGuild = async () => {
    try {
      const res = await apiFetch('/leaderboard/refresh-guild', { method: 'POST' });
      if (res.ok) {
        fetchLeaderboard(bracket, page, pageSize);
      }
    } catch {
      // silent
    }
  };

  const formatValue = (entry) => {
    const raw = entry[bracket] || entry.ps_item_level || 0;
    if (FORMAT_NUMBER.has(bracket)) {
      return (raw || 0).toLocaleString();
    }
    return raw;
  };

  const isWinRateBracket = bracket === 'arenas_won' || bracket === 'bgs_won';

  const getRowClasses = (entry, index) => {
    const classes = [styles.row];
    const globalRank = (page - 1) * pageSize + index;
    if (globalRank === 0) classes.push(styles.rowTop1);
    if (globalRank === 1) classes.push(styles.rowTop2);
    if (globalRank === 2) classes.push(styles.rowTop3);
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

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const fmt = (v) => (v || 0).toLocaleString();

  const renderExpandedRow = (entry, colSpan) => {
    const arenaWinRate = entry.arenas_played > 0
      ? `${((entry.arenas_won / entry.arenas_played) * 100).toFixed(1)}%`
      : '-';
    const bgWinRate = entry.bgs_played > 0
      ? `${((entry.bgs_won / entry.bgs_played) * 100).toFixed(1)}%`
      : '-';

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

  return (
    <>
      <PageHero title="Leaderboards" subtitle="Guild rankings across PvP, PvE, and more" />

      <div className="container section">
        {/* Section Tabs */}
        <div className={styles.sections}>
          {Object.entries(SECTIONS).map(([key, sec]) => (
            <button
              key={key}
              className={section === key ? styles.sectionTabActive : styles.sectionTab}
              onClick={() => handleSectionClick(key)}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Bracket Tabs */}
        <div className={styles.brackets}>
          {SECTIONS[section].brackets.map((b) => (
            <button
              key={b.key}
              className={bracket === b.key ? styles.bracketTabActive : styles.bracketTab}
              onClick={() => handleBracketClick(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Officer Controls */}
        {hasPermission('leaderboard.bulk_refresh') && (
          <div className={styles.officerControls}>
            <button className="btn btn--primary" onClick={handleRefreshGuild}>
              Refresh Guild Stats
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p className={styles.empty}>Loading leaderboard...</p>
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No entries found for this bracket.</p>
        ) : (
          <>
            <TableWrap className={styles.tableWrap}>
              <Table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Character</th>
                    <th>Player</th>
                    <th>Class / Spec</th>
                    <th>{BRACKET_LABELS[bracket] || 'Value'}</th>
                    {isWinRateBracket && <th>Win Rate</th>}
                    <th>Armory</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => {
                    const isExpanded = expandedId === (entry.id || index);
                    const colSpan = isWinRateBracket ? 7 : 6;
                    return (
                      <React.Fragment key={entry.id || index}>
                        <tr
                          className={`${getRowClasses(entry, index)} ${styles.clickableRow} ${isExpanded ? styles.rowExpanded : ''}`}
                          onClick={() => toggleExpand(entry.id || index)}
                        >
                          <td className={styles.rank}>{(page - 1) * pageSize + index + 1}</td>
                          <td>
                            <span className={styles.charLink}>{entry.character_name}</span>
                            {entry.realm_slug && (
                              <span className={styles.realmMeta}>
                                {' '}- {entry.realm || entry.realm_slug}
                              </span>
                            )}
                            {entry.user_id && entry.is_main && <span className={styles.mainTag}>Main</span>}
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
                              <span className={styles.emptyCell}>-</span>
                            )}
                          </td>
                          <td>{`${entry.class || ''}${getSpec(entry) ? ` - ${getSpec(entry)}` : ''}`}</td>
                          <td className={styles.rating}>{formatValue(entry)}</td>
                          {isWinRateBracket && <td>{getWinRate(entry)}</td>}
                          <td>
                            {entry.realm_slug && entry.character_name && (
                              <a
                                href={armoryUrl(entry.realm_slug, entry.character_name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.armoryLink}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Armory
                              </a>
                            )}
                          </td>
                        </tr>
                        {isExpanded && renderExpandedRow(entry, colSpan)}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>

            {/* Pagination */}
            <div className={styles.pagination}>
              <div className={styles.pageSizeWrap}>
                <span className={styles.pageSizeLabel}>Show:</span>
                {PAGE_SIZES.map((size) => (
                  <button
                    key={size}
                    className={pageSize === size ? styles.pageSizeBtnActive : styles.pageSizeBtn}
                    onClick={() => handlePageSizeChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <div className={styles.pageControls}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <span className={styles.pageInfo}>
                  Page {page} of {totalPages} ({total} total)
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
