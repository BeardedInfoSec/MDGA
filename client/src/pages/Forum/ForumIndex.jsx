import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo } from '../../utils/helpers';
import { authorDisplayName, authorProfileLink, isFormerMember } from '../../utils/forumAuthor';
import ForumSidebar from './ForumSidebar';
import styles from './Forum.module.css';
import { postUrl } from '../../utils/forumUrls';

const FALLBACK_ICONS = {
  'General Discussion': '\u{1F4AC}',
  'PvP Strategy': '⚔️',
  'Recruitment': '\u{1F4CB}',
  'Off-Topic': '\u{1F3AE}',
  'Guild Announcements': '\u{1F4E2}',
};

const SUGGEST_LABELS = { title: 'Title', body: 'Body', reply: 'Reply', user: 'User' };
const MATCH_LABELS = { title: 'Title match', body: 'Body match', reply: 'Reply match', user: 'User match' };

// Strip control characters (U+0000–U+001F + U+007F DEL) that can leak in
// from copy-paste; safer than a literal regex range.
const CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
function cleanForumTitle(value) {
  return String(value || '').replace(CTRL_RE, '').trim();
}


export default function ForumIndex() {
  useDocumentTitle('Forum | MDGA');
  const navigate = useNavigate();
  const { isLoggedIn, apiFetch } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = isLoggedIn
          ? await apiFetch('/forum/categories')
          : await fetch('/api/forum/categories');
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (err) {
        console.error('Load categories error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoggedIn, apiFetch]);

  const doSearch = useCallback(async () => {
    if (searchQuery.length < 2) { setSearchResults(null); return; }
    try {
      const res = isLoggedIn
        ? await apiFetch(`/forum/search?q=${encodeURIComponent(searchQuery)}`)
        : await fetch(`/api/forum/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
      setSuggestions(null);
    } catch (err) {
      console.error('Search error:', err);
    }
  }, [searchQuery, isLoggedIn, apiFetch]);

  const doSuggest = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions(null); return; }
    try {
      const res = isLoggedIn
        ? await apiFetch(`/forum/search?q=${encodeURIComponent(q)}`)
        : await fetch(`/api/forum/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions((data.results || []).slice(0, 6));
    } catch {
      setSuggestions(null);
    }
  }, [isLoggedIn, apiFetch]);

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) { setSearchResults(null); setSuggestions(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSuggest(val.trim()), 300);
  };

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') { setSuggestions(null); doSearch(); }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSuggestions(null);
  };

  // Aggregate stats for the title band
  const stats = useMemo(() => {
    const totalPosts = categories.reduce((s, c) => s + (c.post_count || 0), 0);
    const officerCount = categories.filter((c) => c.officer_only).length;
    return [
      { value: String(categories.length), label: 'Categories' },
      { value: String(totalPosts), label: 'Total posts' },
      { value: String(officerCount), label: 'Officer-only' },
      isLoggedIn
        ? { value: 'Active', label: 'Member access' }
        : { value: 'Public', label: 'Browse mode' },
    ];
  }, [categories, isLoggedIn]);

  return (
    <div className={styles.forumPage}>
      {/* Title band */}
      <header className={styles.forumTitleBand}>
        <div className={styles.forumTitleBandInner}>
          <span className={styles.forumEyebrow}>Guild Discussion</span>
          <h1 className={styles.forumPageTitle}>Forum</h1>
          <p className={styles.forumPageSubtitle}>
            Strategy, recruitment, recaps, off-topic — the guild's open channel. Use the
            sidebar to jump into any category, or search across every post.
          </p>
          <div className={styles.forumStatsInline}>
            {stats.map((s) => (
              <div key={s.label} className={styles.forumStatsItem}>
                <span className={styles.forumStatsValue}>{s.value}</span>
                <span className={styles.forumStatsLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.forumLayout}>
        <ForumSidebar categories={categories} activeCategoryId={null} />

        <main className={styles.forumContent}>
          {/* Search toolbar */}
          <div className={styles.forumToolbar}>
            <div className={styles.forumSearchWrap}>
              <input
                className={styles.forumSearchInput}
                type="text"
                placeholder="Search posts, comments, users…"
                value={searchQuery}
                onChange={handleSearchInput}
                onKeyDown={handleSearchKey}
                onFocus={() => { if (searchQuery.length >= 2) doSuggest(searchQuery); }}
                onBlur={() => setTimeout(() => setSuggestions(null), 200)}
              />
              {suggestions && suggestions.length > 0 && (
                <div className={styles.forumSuggest}>
                  {suggestions.map(r => (
                    <Link key={r.id} to={postUrl(r)} className={styles.forumSuggestItem}>
                      <span className={styles.forumSuggestTitle}>{cleanForumTitle(r.title)}</span>
                      <span className={styles.forumSuggestMeta}>{r.category_name} &middot; {SUGGEST_LABELS[r.match_type] || r.match_type}</span>
                    </Link>
                  ))}
                </div>
              )}
              {suggestions && suggestions.length === 0 && (
                <div className={styles.forumSuggest}>
                  <div className={styles.forumSuggestEmpty}>No matches.</div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => { setSuggestions(null); doSearch(); }}
            >
              Search
            </button>
          </div>

          {/* Search results OR welcome / categories grid */}
          {searchResults !== null ? (
            <>
              <div className={styles.forumSectionHeader}>
                <div>
                  <span className={styles.forumSectionEyebrow}>Search</span>
                  <h2 className={styles.forumSectionTitle}>
                    {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for &ldquo;{searchQuery}&rdquo;
                  </h2>
                </div>
                <button type="button" className="btn btn--secondary btn--sm" onClick={clearSearch}>Clear</button>
              </div>
              {searchResults.length > 0 ? (
                <div className={styles.forumPostList}>
                  {searchResults.map((r) => {
                    const netVotes = r.net_votes || 0;
                    const voteCls = netVotes > 0 ? styles.forumPostStatPositive : netVotes < 0 ? styles.forumPostStatNegative : '';
                    return (
                      <Link key={r.id} to={postUrl(r)} className={styles.forumPostRow}>
                        <div className={styles.forumPostTitle}>
                          {cleanForumTitle(r.title)}
                          <span className={styles.forumPostTagMatch}>{MATCH_LABELS[r.match_type] || r.match_type}</span>
                        </div>
                        <div className={styles.forumPostMeta}>
                          {!isFormerMember(r) && <span className={`rank-badge rank-badge--${r.rank}`}>{r.display_rank || r.rank}</span>}
                          {authorProfileLink(r) ? (
                            <span
                              className={styles.profileLink}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(authorProfileLink(r)); }}
                            >
                              {authorDisplayName(r)}
                            </span>
                          ) : (
                            <span className={styles.profileLink}>{authorDisplayName(r)}</span>
                          )}
                          <span>&middot;</span>
                          <span>{timeAgo(r.created_at)}</span>
                          <span>&middot;</span>
                          <span>{r.category_name}</span>
                          <span className={styles.forumPostStats}>
                            <span className={`${styles.forumPostStat} ${voteCls}`} title="Net votes">▲ {netVotes}</span>
                            <span className={styles.forumPostStat} title="Views">{r.view_count || 0} views</span>
                            <span className={styles.forumPostStat} title="Replies">{r.comment_count || 0} replies</span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.forumEmptyState}>No results found.</p>
              )}
            </>
          ) : (
            <>
              <div className={styles.forumSectionHeader}>
                <div>
                  <span className={styles.forumSectionEyebrow}>Browse</span>
                  <h2 className={styles.forumSectionTitle}>Categories</h2>
                </div>
              </div>

              {loading ? (
                <p className={styles.forumEmptyState}>Loading…</p>
              ) : categories.length === 0 ? (
                <p className={styles.forumEmptyState}>No categories yet.</p>
              ) : (
                <div className={styles.forumPostList}>
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/forum/category/${cat.slug || cat.id}`}
                      className={styles.forumPostRow}
                      style={cat.accent_color ? { borderLeft: `3px solid ${cat.accent_color}` } : undefined}
                    >
                      <div className={styles.forumPostTitle}>
                        <span style={{ fontSize: 18 }} aria-hidden="true">
                          {cat.icon || FALLBACK_ICONS[cat.name] || '\u{1F4AC}'}
                        </span>
                        <span>{cat.name}</span>
                        {cat.officer_only ? (
                          <span className={styles.forumPostTagPinned}>Officer-only</span>
                        ) : null}
                        {cat.officer_post_only ? (
                          <span className={styles.forumPostTagPinned} title="Only officers can start threads here; replies are open to everyone.">Officers post</span>
                        ) : null}
                        {cat.age_restricted ? (
                          <span className={styles.forumTagSensitive} title="Age-restricted: viewers see an 18+ confirmation modal">18+</span>
                        ) : null}
                      </div>
                      <div className={styles.forumPostMeta}>
                        <span>{cat.description || 'No description'}</span>
                        <span className={styles.forumPostStats}>
                          <span className={styles.forumPostStat}>{cat.post_count || 0} posts</span>
                          {cat.latest_post_title && (
                            <span className={styles.forumPostStat} title={cleanForumTitle(cat.latest_post_title)}>
                              Latest: {timeAgo(cat.latest_post_date)}
                            </span>
                          )}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
