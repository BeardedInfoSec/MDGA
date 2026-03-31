import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo } from '../../utils/helpers';
import PageHero from '../../components/common/PageHero';
import styles from './Forum.module.css';

const CATEGORY_ICONS = {
  'General Discussion': '\u{1F4AC}',
  'PvP Strategy': '\u2694\uFE0F',
  'Recruitment': '\u{1F4CB}',
  'Off-Topic': '\u{1F3AE}',
  'Guild Announcements': '\u{1F4E2}',
};

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
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
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
    if (!val.trim()) {
      setSearchResults(null);
      setSuggestions(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSuggest(val.trim()), 300);
  };

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') {
      setSuggestions(null);
      doSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSuggestions(null);
  };

  const cleanTitle = (value) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();

  const matchLabels = { title: 'Title match', body: 'Body match', reply: 'Reply match', user: 'User match' };
  const suggestLabels = { title: 'Title', body: 'Body', reply: 'Reply', user: 'User' };

  return (
    <>
      <PageHero title="Forum" subtitle="Guild discussion board" />
      <section className="section">
        <div className="container">
          {/* Search */}
          <div className={styles.search}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyDown={handleSearchKey}
              onFocus={() => { if (searchQuery.length >= 2) doSuggest(searchQuery); }}
              onBlur={() => setTimeout(() => setSuggestions(null), 200)}
            />
            <button className={styles.searchBtn} onClick={() => { setSuggestions(null); doSearch(); }}>
              Search
            </button>
            {suggestions && suggestions.length > 0 && (
              <div className={styles.suggest}>
                {suggestions.map(r => (
                  <Link key={r.id} to={`/forum/post/${r.id}`} className={styles.suggestItem}>
                    <span className={styles.suggestTitle}>{cleanTitle(r.title)}</span>
                    <span className={styles.suggestMeta}>{r.category_name} &bull; {suggestLabels[r.match_type] || r.match_type}</span>
                  </Link>
                ))}
              </div>
            )}
            {suggestions && suggestions.length === 0 && (
              <div className={styles.suggest}>
                <div className={styles.suggestEmpty}>No results</div>
              </div>
            )}
          </div>

          {/* Search Results */}
          {searchResults !== null ? (
            <>
              <div className={styles.searchResultsHeader}>
                <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;</span>
                <button className="btn btn--secondary btn--sm" onClick={clearSearch}>Clear</button>
              </div>
              {searchResults.length > 0 ? (
                <div className={styles.postList}>
                  {searchResults.map(r => {
                    const netVotes = r.net_votes || 0;
                    const voteToneClass = netVotes > 0 ? styles.votePositive : netVotes < 0 ? styles.voteNegative : styles.voteNeutral;
                    return (
                      <Link key={r.id} to={`/forum/post/${r.id}`} className={styles.postRow}>
                        <div className={styles.postRowTitle}>
                          {cleanTitle(r.title)}
                          <span className={styles.matchTag}>{matchLabels[r.match_type] || r.match_type}</span>
                        </div>
                        <div className={styles.postRowMeta}>
                          <span className={`rank-badge rank-badge--${r.rank}`}>{r.rank}</span>
                          {' '}<span className={styles.profileLink} onClick={(e) => { e.preventDefault(); navigate(`/profile?id=${r.user_id}`); }}>{r.display_name || r.username}</span> &bull; {timeAgo(r.created_at)} &bull; {r.category_name}
                          <span className={styles.inlineStats}>
                            <span className={voteToneClass} title="Votes">&#9650; {netVotes}</span>
                            <span title="Views">&#128065; {r.view_count || 0}</span>
                            <span title="Replies">&#128172; {r.comment_count || 0}</span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.empty}>No results found.</p>
              )}
            </>
          ) : (
            /* Categories */
            loading ? (
              <p className={styles.empty}>Loading...</p>
            ) : categories.length === 0 ? (
              <p className={styles.empty}>No categories yet.</p>
            ) : (
              <div className={styles.categories}>
                {categories.map(cat => (
                  <Link
                    key={cat.id}
                    to={`/forum/category/${cat.id}`}
                    className={cat.officer_only ? styles.categoryOfficer : styles.category}
                  >
                    <div className={styles.categoryIcon}>{CATEGORY_ICONS[cat.name] || '\u{1F4AC}'}</div>
                    <div className={styles.categoryInfo}>
                      <div className={styles.categoryName}>
                        {cat.name}
                        {cat.officer_only && <span className={styles.officerTag}>Officers Only</span>}
                      </div>
                      <div className={styles.categoryDesc}>{cat.description || ''}</div>
                    </div>
                    <div className={styles.categoryStats}>
                      <strong>{cat.post_count || 0}</strong>
                      posts
                      {cat.latest_post_title && (
                        <>
                          <br /><small>Latest: {cleanTitle(cat.latest_post_title)}</small>
                          <br /><small>{timeAgo(cat.latest_post_date)}</small>
                        </>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </section>
    </>
  );
}
