import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo } from '../../utils/helpers';
import PageHero from '../../components/common/PageHero';
import styles from './Forum.module.css';

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

  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(searchParams.get('sort') || 'hot');
  const [perPage, setPerPage] = useState(getPerPage);
  const page = parseInt(searchParams.get('page')) || 1;

  useDocumentTitle(category ? `${category.name} | MDGA Forum` : 'Forum | MDGA');

  const loadPosts = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const path = `/forum/categories/${slug}/posts?page=${page}&sort=${sort}&limit=${perPage}`;
      const res = isLoggedIn
        ? await apiFetch(path)
        : await fetch(`/api${path}`);
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

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

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

  const canPost = isLoggedIn && category && (!category.officer_only || isOfficer());

  const sortOptions = [
    { key: 'hot', label: 'Hot' },
    { key: 'newest', label: 'New' },
    { key: 'top', label: 'Top' },
  ];

  const cleanTitle = (value) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();

  return (
    <>
      <PageHero title={category?.name || 'Category'} subtitle={category?.description || ''} />
      <section className="section">
        <div className="container">
          <Link to="/forum" className={styles.backLink}>&larr; Back to Forum</Link>

          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerControls}>
              <div className={styles.sort}>
                {sortOptions.map(s => (
                  <button
                    key={s.key}
                    className={sort === s.key ? styles.sortBtnActive : styles.sortBtn}
                    onClick={() => handleSort(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <select className={styles.perPage} value={perPage} onChange={handlePerPage}>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
            {canPost && (
              <Link to={`/forum/new/${slug}`} className="btn btn--primary btn--sm">
                New Post
              </Link>
            )}
          </div>

          {/* Posts */}
          {loading ? (
            <p className={styles.empty}>Loading...</p>
          ) : posts.length === 0 ? (
            <p className={styles.empty}>No posts yet. Be the first to post!</p>
          ) : (
            <div className={styles.postList}>
              {posts.map(post => {
                const displayName = post.display_name || post.username;
                const netVotes = post.net_votes || 0;
                const voteToneClass = netVotes > 0 ? styles.votePositive : netVotes < 0 ? styles.voteNegative : styles.voteNeutral;
                const rowClass = post.pinned
                  ? `${styles.postRowPinned}${post.locked ? ` ${styles.postRowLocked}` : ''}`
                  : `${styles.postRow}${post.locked ? ` ${styles.postRowLocked}` : ''}`;

                return (
                  <Link key={post.id} to={`/forum/post/${post.id}`} className={rowClass}>
                    <div className={styles.postRowTitle}>
                      {cleanTitle(post.title)}
                      {post.pinned && <span className={styles.pinnedTag}>[PINNED]</span>}
                      {post.locked && <span className={styles.lockedTag}>[LOCKED]</span>}
                    </div>
                    <div className={styles.postRowMeta}>
                      <span className={`rank-badge rank-badge--${post.rank}`}>{post.rank}</span>
                      {' '}<span className={styles.profileLink} onClick={(e) => { e.preventDefault(); navigate(`/profile?id=${post.user_id}`); }}>{displayName}</span> &bull; {timeAgo(post.created_at)}
                      <span className={styles.inlineStats}>
                        <span className={voteToneClass} title="Votes">&#9650; {netVotes}</span>
                        <span title="Views">&#128065; {post.view_count || 0}</span>
                        <span title="Replies">&#128172; {post.comment_count || 0}</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className={styles.pagination}>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={p === pagination.page ? styles.pageBtnActive : styles.pageBtn}
                  onClick={() => setSearchParams({ page: String(p), sort })}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
