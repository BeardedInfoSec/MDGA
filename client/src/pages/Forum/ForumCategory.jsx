import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo } from '../../utils/helpers';
import { authorDisplayName, authorProfileLink, isFormerMember } from '../../utils/forumAuthor';
import AgeGate from '../../components/common/AgeGate';
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

const CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
function cleanForumTitle(value) {
  return String(value || '').replace(CTRL_RE, '').trim();
}

function getPerPage() {
  const stored = localStorage.getItem('forum_per_page');
  const val = parseInt(stored);
  return [10, 15, 20, 50].includes(val) ? val : 20;
}

export default function ForumCategory() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoggedIn, isOfficer, apiFetch } = useAuth();

  const [allCategories, setAllCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(searchParams.get('sort') || 'hot');
  const [perPage, setPerPage] = useState(getPerPage);
  const page = parseInt(searchParams.get('page')) || 1;

  useDocumentTitle(category ? `${category.name} | MDGA Forum` : 'Forum | MDGA');

  // Load all categories for the sidebar (separate from the category-specific load)
  useEffect(() => {
    (async () => {
      try {
        const res = isLoggedIn
          ? await apiFetch('/forum/categories')
          : await fetch('/api/forum/categories');
        const data = await res.json();
        setAllCategories(data.categories || []);
      } catch {
        setAllCategories([]);
      }
    })();
  }, [isLoggedIn, apiFetch]);

  const loadPosts = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const path = `/forum/categories/${slug}/posts?page=${page}&sort=${sort}&limit=${perPage}`;
      const res = isLoggedIn ? await apiFetch(path) : await fetch(`/api${path}`);
      const data = await res.json();
      setCategory(data.category || null);
      setPosts(data.posts || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Load posts error:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, page, sort, perPage, isLoggedIn, apiFetch]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleSort = (newSort) => {
    setSort(newSort);
    setSearchParams({ page: '1', sort: newSort });
  };

  const handlePerPage = (e) => {
    const val = parseInt(e.target.value);
    setPerPage(val);
    localStorage.setItem('forum_per_page', val);
    setSearchParams({ page: '1', sort });
  };

  // Posting (creating new threads) is gated by:
  //   officer_only       — already blocks all access; only officers see this
  //   officer_post_only  — anyone reads + replies, only officers create threads
  const canPost = isLoggedIn && category &&
    (!category.officer_only || isOfficer()) &&
    (!category.officer_post_only || isOfficer());
  const sortOptions = [
    { key: 'hot', label: 'Hot' },
    { key: 'newest', label: 'New' },
    { key: 'top', label: 'Top' },
  ];

  // Title band stats per-category
  const stats = [
    { value: String(category?.post_count ?? posts.length), label: 'Posts' },
    { value: category?.officer_only ? 'Officer-only' : 'Public', label: 'Visibility' },
    { value: pagination?.total != null ? String(pagination.total) : '—', label: 'Total threads' },
    { value: sort === 'hot' ? 'Hot' : sort === 'newest' ? 'New' : 'Top', label: 'Sorted by' },
  ];

  const accent = category?.accent_color || null;

  return (
    <div className={styles.forumPage}>
      <AgeGate
        active={!!category?.age_restricted}
        categoryId={category?.id}
        categoryName={category?.name}
      />
      <header
        className={styles.forumTitleBand}
        style={accent ? { borderBottomColor: accent } : undefined}
      >
        <div className={styles.forumTitleBandInner}>
          <span className={styles.forumEyebrow}>
            {category?.officer_only
              ? 'Officer-only category'
              : category?.officer_post_only
                ? 'Officers post • everyone replies'
                : category?.age_restricted
                  ? 'Age-restricted (18+) category'
                  : 'Forum category'}
          </span>
          <div className={styles.forumCategoryTitleAccent}>
            {category && (
              <span
                className={styles.forumCategoryTitleIcon}
                style={accent ? { borderColor: accent } : undefined}
                aria-hidden="true"
              >
                {category.icon || FALLBACK_ICONS[category.name] || '\u{1F4AC}'}
              </span>
            )}
            <h1 className={styles.forumPageTitle}>
              {category?.name || 'Category'}
            </h1>
          </div>
          {category?.description && (
            <p className={styles.forumPageSubtitle}>{category.description}</p>
          )}
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
        <ForumSidebar categories={allCategories} activeCategoryId={slug} />

        <main className={styles.forumContent}>
          <Link to="/forum" className={styles.forumBackLink}>← Back to forum</Link>

          {/* Toolbar: sort + per-page + new post */}
          <div className={styles.forumToolbar}>
            <div className={styles.forumSortGroup} role="tablist" aria-label="Sort posts">
              {sortOptions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={sort === s.key}
                  className={sort === s.key ? styles.forumSortBtnActive : styles.forumSortBtn}
                  onClick={() => handleSort(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <select className={styles.forumPerPage} value={perPage} onChange={handlePerPage} aria-label="Posts per page">
              <option value={10}>10 / page</option>
              <option value={15}>15 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
            {canPost && (
              <Link to={`/forum/new/${slug}`} className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }}>
                New Post
              </Link>
            )}
          </div>

          {/* Post list */}
          {loading ? (
            <p className={styles.forumEmptyState}>Loading…</p>
          ) : posts.length === 0 ? (
            <p className={styles.forumEmptyState}>No posts yet. Be the first to post!</p>
          ) : (
            <div className={styles.forumPostList}>
              {posts.map((post) => {
                const displayName = authorDisplayName(post);
                const profileLink = authorProfileLink(post);
                const authorIsFormer = isFormerMember(post);
                const netVotes = post.net_votes || 0;
                const voteCls = netVotes > 0 ? styles.forumPostStatPositive : netVotes < 0 ? styles.forumPostStatNegative : '';
                const cls = post.pinned
                  ? `${styles.forumPostRowPinned}${post.locked ? ` ${styles.forumPostRowLocked}` : ''}`
                  : `${styles.forumPostRow}${post.locked ? ` ${styles.forumPostRowLocked}` : ''}`;
                return (
                  <Link key={post.id} to={postUrl(post)} className={cls}>
                    <div className={styles.forumPostTitle}>
                      {cleanForumTitle(post.title)}
                      {post.pinned ? <span className={styles.forumPostTagPinned}>Pinned</span> : null}
                      {post.locked ? <span className={styles.forumPostTagLocked}>Locked</span> : null}
                    </div>
                    <div className={styles.forumPostMeta}>
                      {!authorIsFormer && <span className={`rank-badge rank-badge--${post.rank}`}>{post.display_rank || post.rank}</span>}
                      {profileLink ? (
                        <span
                          className={styles.profileLink}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(profileLink); }}
                        >
                          {displayName}
                        </span>
                      ) : (
                        <span className={styles.profileLink}>{displayName}</span>
                      )}
                      <span>·</span>
                      <span>{timeAgo(post.created_at)}</span>
                      <span className={styles.forumPostStats}>
                        <span className={`${styles.forumPostStat} ${voteCls}`} title="Net votes">▲ {netVotes}</span>
                        <span className={styles.forumPostStat} title="Views">{post.view_count || 0} views</span>
                        <span className={styles.forumPostStat} title="Replies">{post.comment_count || 0} replies</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className={styles.forumPagination}>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === pagination.page ? styles.forumPageBtnActive : styles.forumPageBtn}
                  onClick={() => setSearchParams({ page: String(p), sort })}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
