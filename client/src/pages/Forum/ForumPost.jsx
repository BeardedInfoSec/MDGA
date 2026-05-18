import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo, armoryUrl } from '../../utils/helpers';
import {
  authorDisplayName, authorSecondaryName, authorProfileLink,
  authorRealmSlug, isFormerMember,
} from '../../utils/forumAuthor';
import { Alert } from '../../components/ui';
import MarkdownContent from '../../components/common/MarkdownContent';
import MarkdownEditor from '../../components/common/MarkdownEditor';
import AgeGate from '../../components/common/AgeGate';
import ForumSidebar from './ForumSidebar';
import styles from './Forum.module.css';

const CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
function cleanForumTitle(value) {
  return String(value || '').replace(CTRL_RE, '').trim();
}

const REPLY_MAX = 5000;

export default function ForumPost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, isOfficer, user, apiFetch } = useAuth();

  const [allCategories, setAllCategories] = useState([]);
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [userVote, setUserVote] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const commentImageRef = useRef(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const openEditPost = () => {
    if (!post) return;
    setEditTitle(post.title || '');
    setEditContent(post.content || '');
    setEditError('');
    setEditOpen(true);
  };

  const submitEditPost = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setEditError('Title and content are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/forum/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || 'Failed to save.');
        return;
      }
      setEditOpen(false);
      // Refetch the post so the visible content updates
      const refresh = await apiFetch(`/forum/posts/${post.id}`);
      if (refresh.ok) {
        const data = await refresh.json();
        if (data.post) setPost(data.post);
      }
    } catch {
      setEditError('Failed to save.');
    } finally {
      setEditSaving(false);
    }
  };

  const postTitle = cleanForumTitle(post?.title || '');
  useDocumentTitle(post ? `${postTitle} | MDGA Forum` : 'Forum | MDGA');

  // Load post edit history when officer opens the Revisions modal.
  useEffect(() => {
    if (!showRevisions || !post?.id) return;
    setRevisions(null);
    apiFetch(`/admin/posts/${post.id}/revisions`).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setRevisions(data.revisions || []);
      } else {
        setRevisions([]);
      }
    }).catch(() => setRevisions([]));
  }, [showRevisions, post?.id, apiFetch]);

  // Load category list for the sidebar
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

  const loadPost = useCallback(async () => {
    if (!id) return;
    try {
      const path = `/forum/posts/${id}`;
      const res = isLoggedIn
        ? await apiFetch(path)
        : await fetch(`/api${path}`);
      if (!res.ok) { setPost(null); return; }
      const data = await res.json();
      setPost(data.post);
      setComments(data.comments || []);
      setUserVote(data.userVote || 0);
    } catch (err) {
      console.error('Load post error:', err);
    } finally {
      setLoading(false);
    }
  }, [id, isLoggedIn, apiFetch]);

  useEffect(() => { loadPost(); }, [loadPost]);

  async function handleVote(vote) {
    if (!isLoggedIn) return;
    const newVote = userVote === vote ? 0 : vote;
    try {
      const res = await apiFetch(`/forum/posts/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: newVote }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserVote(data.userVote);
        setPost((prev) => prev ? { ...prev, net_votes: data.net_votes, upvotes: data.upvotes, downvotes: data.downvotes } : prev);
      }
    } catch (err) { console.error('Vote error:', err); }
  }

  async function handleDeletePost() {
    if (!window.confirm('Delete this post and all its comments?')) return;
    try {
      const res = await apiFetch(`/forum/posts/${id}`, { method: 'DELETE' });
      if (res.ok) navigate('/forum');
      else { const data = await res.json(); alert(data.error || 'Failed to delete post'); }
    } catch { alert('Failed to delete post'); }
  }

  async function handleTogglePin() {
    try { const res = await apiFetch(`/forum/posts/${id}/pin`, { method: 'PUT' }); if (res.ok) loadPost(); }
    catch { alert('Failed to toggle pin'); }
  }

  async function handleToggleLock() {
    try { const res = await apiFetch(`/forum/posts/${id}/lock`, { method: 'PUT' }); if (res.ok) loadPost(); }
    catch { alert('Failed to toggle lock'); }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      const res = await apiFetch(`/forum/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) loadPost();
      else { const data = await res.json(); alert(data.error || 'Failed to delete comment'); }
    } catch { alert('Failed to delete comment'); }
  }

  async function handleReportPost() {
    const reasonInput = window.prompt('Why are you reporting this post? (optional)', '');
    if (reasonInput === null) return;
    try {
      const res = await apiFetch(`/forum/posts/${id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const data = await res.json();
      alert(res.ok ? 'Report submitted. Officers will review it.' : (data.error || 'Failed to submit report.'));
    } catch { alert('Failed to submit report.'); }
  }

  async function handleReportComment(commentId) {
    const reasonInput = window.prompt('Why are you reporting this reply? (optional)', '');
    if (reasonInput === null) return;
    try {
      const res = await apiFetch(`/forum/comments/${commentId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const data = await res.json();
      alert(res.ok ? 'Report submitted. Officers will review it.' : (data.error || 'Failed to submit report.'));
    } catch { alert('Failed to submit report.'); }
  }

  function handleSharePost() {
    navigator.clipboard.writeText(window.location.href).catch(() => {
      window.prompt('Copy this link:', window.location.href);
    });
  }

  function handleCommentImageChange() {
    const file = commentImageRef.current?.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  function clearCommentImage() {
    if (commentImageRef.current) commentImageRef.current.value = '';
    setImagePreview(null);
  }

  async function handleSubmitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) {
      setCommentError('Reply content is required.');
      return;
    }
    setSubmitting(true);
    setCommentError('');
    try {
      let imageUrl = null;
      const imageFile = commentImageRef.current?.files[0];
      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        const uploadRes = await apiFetch('/upload', { method: 'POST', headers: {}, body: fd });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.imageUrl;
        }
      }
      const res = await apiFetch(`/forum/posts/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText.trim(), imageUrl }),
      });
      if (res.ok) {
        setCommentText('');
        clearCommentImage();
        loadPost();
      } else {
        const data = await res.json();
        setCommentError(data.error || 'Failed to post reply.');
      }
    } catch {
      setCommentError('Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── States: loading, not found, logged-out gate, normal ──
  const renderShell = (children, eyebrow = 'Forum post', title = 'Post') => (
    <div className={styles.forumPage}>
      <header className={styles.forumTitleBand}>
        <div className={styles.forumTitleBandInner}>
          <span className={styles.forumEyebrow}>{eyebrow}</span>
          <h1 className={styles.forumPageTitle}>{title}</h1>
        </div>
      </header>
      <div className={styles.forumLayout}>
        <ForumSidebar categories={allCategories} activeCategoryId={post?.category_id ?? null} />
        <main className={styles.forumContent}>{children}</main>
      </div>
    </div>
  );

  if (loading) {
    return renderShell(<p className={styles.forumEmptyState}>Loading…</p>);
  }
  if (!post) {
    return renderShell(<p className={styles.forumEmptyState}>Post not found.</p>, 'Forum post', 'Not found');
  }

  const displayName = authorDisplayName(post);
  const secondaryName = authorSecondaryName(post);
  const profileLink = authorProfileLink(post);
  const authorIsFormer = isFormerMember(post);
  const isAuthor = user && user.id === post.user_id;
  const showOfficerActions = isOfficer();

  // Logged-out: shell + gated preview
  if (!isLoggedIn) {
    return (
      <div className={styles.forumPage}>
        <header className={styles.forumTitleBand}>
          <div className={styles.forumTitleBandInner}>
            <span className={styles.forumEyebrow}>{post.category_name || 'Forum post'}</span>
            <h1 className={styles.forumPageTitle}>{postTitle}</h1>
          </div>
        </header>
        <div className={styles.forumLayout}>
          <ForumSidebar categories={allCategories} activeCategoryId={post.category_id} />
          <main className={styles.forumContent}>
            {post.category_id && (
              <Link to={`/forum/category/${post.category_id}`} className={styles.forumBackLink}>← Back to category</Link>
            )}
            <article className={styles.postCard}>
              <p className={styles.postBodyText}>{(post.content || '').substring(0, 200)}…</p>
            </article>
            <div className={styles.postGate}>
              <p>Log in with Discord to read the full post and join the discussion.</p>
              <Link to="/login" className="btn btn--primary">Log In</Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.forumPage}>
      <AgeGate
        active={!!post.category_age_restricted}
        categoryId={post.category_id}
        categoryName={post.category_name}
        fallbackPath={post.category_id ? `/forum/category/${post.category_id}` : '/forum'}
      />
      <header className={styles.forumTitleBand}>
        <div className={styles.forumTitleBandInner}>
          <span className={styles.forumEyebrow}>{post.category_name || 'Forum post'}</span>
          <h1 className={styles.forumPageTitle}>{postTitle}</h1>
          <p className={styles.forumPageSubtitle}>
            By {displayName} · {timeAgo(post.created_at)} · {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
          </p>
        </div>
      </header>

      <div className={styles.forumLayoutPost}>
        <ForumSidebar categories={allCategories} activeCategoryId={post.category_id} />

        <main className={styles.forumContent}>
          {post.category_id && (
            <Link to={`/forum/category/${post.category_id}`} className={styles.forumBackLink}>← Back to category</Link>
          )}

          {/* Post card */}
          <article className={styles.postCard}>
            <div className={styles.postCardHead}>
              {profileLink ? (
                <Link to={profileLink} className={styles.postAvatarLink}>
                  <img
                    src={post.avatar_url || '/images/default-avatar.svg'}
                    alt={displayName}
                    className={styles.postAvatarImg}
                  />
                </Link>
              ) : (
                <span className={styles.postAvatarLink}>
                  <img
                    src={authorIsFormer ? '/images/default-avatar.svg' : (post.avatar_url || '/images/default-avatar.svg')}
                    alt={displayName}
                    className={styles.postAvatarImg}
                  />
                </span>
              )}
              <div className={styles.postAuthorInfo}>
                <div className={styles.postAuthorRow}>
                  {!authorIsFormer && <span className={`rank-badge rank-badge--${post.rank}`}>{post.display_rank || post.rank}</span>}
                  {profileLink ? (
                    <Link to={profileLink} className={styles.postAuthorName}>{displayName}</Link>
                  ) : (
                    <span className={styles.postAuthorName}>{displayName}</span>
                  )}
                  {secondaryName && <span className={styles.postAuthorAlt}>({secondaryName})</span>}
                  {!authorIsFormer && authorRealmSlug(post) && (post.main_character_name || post.character_name) && (
                    <a
                      href={armoryUrl(authorRealmSlug(post), post.main_character_name || post.character_name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.postArmoryLink}
                      title="View Armory Profile"
                    >Armory</a>
                  )}
                </div>
                <span className={styles.postDate}>{timeAgo(post.created_at)}</span>
              </div>
              <div className={styles.postBadges}>
                {post.pinned ? <span className={styles.forumPostTagPinned}>Pinned</span> : null}
                {post.locked ? <span className={styles.forumPostTagLocked}>Locked</span> : null}
              </div>
            </div>

            <MarkdownContent source={post.content} className={styles.postBodyText} />

            {post.image_url && (
              <img src={post.image_url} alt="Post" className={styles.postImageInline} />
            )}

            {/* Engagement bar */}
            <div className={styles.postEngagement}>
              <div className={styles.voteCluster}>
                <button
                  type="button"
                  className={userVote === 1 ? styles.voteBtnUp : styles.voteBtnIdle}
                  onClick={() => handleVote(1)}
                  aria-label="Upvote"
                  title="Upvote"
                >▲</button>
                <span className={styles.voteScore}>{post.net_votes || 0}</span>
                <button
                  type="button"
                  className={userVote === -1 ? styles.voteBtnDown : styles.voteBtnIdle}
                  onClick={() => handleVote(-1)}
                  aria-label="Downvote"
                  title="Downvote"
                >▼</button>
              </div>
              <div className={styles.postEngagementStats}>
                <span title="Views">{post.view_count || 0} views</span>
                <span title="Comments">{comments.length} replies</span>
                <span title="Upvotes">{post.upvotes || 0} ▲</span>
                <span title="Downvotes">{post.downvotes || 0} ▼</span>
              </div>
              <div className={styles.postEngagementActions}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={handleSharePost}>Share</button>
                {!isAuthor && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={handleReportPost}>Report</button>
                )}
              </div>
            </div>

            {/* Owner / Officer actions */}
            {(isAuthor || showOfficerActions) && (
              <div className={styles.postOwnerActions}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={openEditPost}>
                  Edit post
                </button>
                {showOfficerActions && (
                  <>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleTogglePin}>
                      {post.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleToggleLock}>
                      {post.locked ? 'Unlock' : 'Lock'}
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowRevisions(true)}>
                      Revisions
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--danger btn--sm" onClick={handleDeletePost}>Delete post</button>
              </div>
            )}
          </article>

          {/* Comments */}
          <section className={styles.commentsSection}>
            <header className={styles.commentsHeader}>
              <span className={styles.forumSectionEyebrow}>Discussion</span>
              <h2 className={styles.forumSectionTitle}>
                {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
              </h2>
            </header>

            {comments.length === 0 ? (
              <p className={styles.forumEmptyState}>No replies yet — be the first.</p>
            ) : (
              <ul className={styles.commentsList}>
                {comments.map((c) => {
                  const cName = authorDisplayName(c);
                  const cSecondary = authorSecondaryName(c);
                  const cProfileLink = authorProfileLink(c);
                  const cIsFormer = isFormerMember(c);
                  const cRealm = authorRealmSlug(c);
                  const cMainChar = c.main_character_name || c.character_name;
                  const cIsAuthor = user && user.id === c.user_id;
                  return (
                    <li key={c.id} className={styles.commentRow}>
                      {cProfileLink ? (
                        <Link to={cProfileLink} className={styles.commentAvatarLink}>
                          <img
                            src={c.avatar_url || '/images/default-avatar.svg'}
                            alt={cName}
                            className={styles.commentAvatarImg}
                          />
                        </Link>
                      ) : (
                        <span className={styles.commentAvatarLink}>
                          <img
                            src={cIsFormer ? '/images/default-avatar.svg' : (c.avatar_url || '/images/default-avatar.svg')}
                            alt={cName}
                            className={styles.commentAvatarImg}
                          />
                        </span>
                      )}
                      <div className={styles.commentBody}>
                        <div className={styles.commentMeta}>
                          {!cIsFormer && <span className={`rank-badge rank-badge--${c.rank}`}>{c.display_rank || c.rank}</span>}
                          {cProfileLink ? (
                            <Link to={cProfileLink} className={styles.postAuthorName}>{cName}</Link>
                          ) : (
                            <span className={styles.postAuthorName}>{cName}</span>
                          )}
                          {cSecondary && <span className={styles.postAuthorAlt}>({cSecondary})</span>}
                          {!cIsFormer && cRealm && cMainChar && (
                            <a
                              href={armoryUrl(cRealm, cMainChar)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.postArmoryLink}
                              title="View Armory Profile"
                            >Armory</a>
                          )}
                          <span className={styles.commentDate}>· {timeAgo(c.created_at)}</span>
                          <span className={styles.commentActions}>
                            {!cIsAuthor && (
                              <button
                                type="button"
                                className={styles.commentActionLink}
                                onClick={() => handleReportComment(c.id)}
                              >Report</button>
                            )}
                            {(cIsAuthor || showOfficerActions) && (
                              <button
                                type="button"
                                className={`${styles.commentActionLink} ${styles.commentActionDanger}`}
                                onClick={() => handleDeleteComment(c.id)}
                              >Delete</button>
                            )}
                          </span>
                        </div>
                        <MarkdownContent source={c.content} className={styles.commentText} />
                        {c.image_url && (
                          <img src={c.image_url} alt="Reply" className={styles.commentImageInline} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {post.locked ? (
            <p className={styles.forumEmptyState}>This post is locked. No new replies.</p>
          ) : null}
        </main>

        {/* Reply rail — sticky, always-accessible compose box on the right */}
        <aside className={styles.forumReplyRail} aria-label="Reply">
          <div className={styles.forumReplyRailSticky}>
            <header className={styles.forumReplyRailHeader}>
              <span className={styles.forumReplyRailEyebrow}>Reply</span>
              <h2 className={styles.forumReplyRailTitle}>Join the discussion</h2>
              <span className={styles.forumReplyRailMeta}>
                {post.locked
                  ? 'Locked — no new replies allowed.'
                  : `${comments.length} ${comments.length === 1 ? 'reply' : 'replies'} so far`}
              </span>
            </header>

            {post.locked ? (
              <p className={styles.forumEmptyState}>This post is locked.</p>
            ) : (
              <form className={styles.composeForm} onSubmit={handleSubmitComment} noValidate>
                <label className={styles.composeField}>
                  <span className={styles.composeLabel}>
                    Your reply
                    <span className={`${styles.composeCounter} ${commentText.length > REPLY_MAX ? styles.composeCounterOver : ''}`}>
                      {commentText.length.toLocaleString()} / {REPLY_MAX.toLocaleString()}
                    </span>
                  </span>
                  <MarkdownEditor
                    value={commentText}
                    onChange={setCommentText}
                    placeholder="Write your reply… Markdown supported."
                    rows={5}
                    maxLength={REPLY_MAX + 100}
                  />
                </label>

                <div className={styles.composeUpload}>
                  <div className={styles.composeUploadRow}>
                    <input
                      ref={commentImageRef}
                      id="forum-reply-image"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleCommentImageChange}
                      className={styles.composeFileInput}
                    />
                    <label htmlFor="forum-reply-image" className="btn btn--secondary btn--sm">
                      {imagePreview ? 'Replace image' : 'Attach image'}
                    </label>
                    {imagePreview && (
                      <button type="button" className="btn btn--danger btn--sm" onClick={clearCommentImage}>
                        Remove
                      </button>
                    )}
                  </div>
                  {imagePreview && (
                    <div className={styles.composePreviewWrap}>
                      <img src={imagePreview} alt="Preview" className={styles.composePreview} />
                    </div>
                  )}
                </div>

                {commentError && <Alert tone="error">{commentError}</Alert>}

                <div className={styles.composeActions}>
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    disabled={submitting || !commentText.trim() || commentText.length > REPLY_MAX}
                  >
                    {submitting ? 'Posting…' : 'Post Reply'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </aside>
      </div>

      {editOpen && (
        <div className={styles.revisionsBackdrop} onClick={() => setEditOpen(false)} role="dialog" aria-modal="true">
          <div className={styles.revisionsCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.revisionsHeader}>
              <h2>Edit post</h2>
              <button type="button" onClick={() => setEditOpen(false)} className={styles.revisionsClose} aria-label="Close">×</button>
            </header>
            <div className={styles.revisionsBody}>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Title</span>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', fontFamily: 'var(--font-ui)' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Content (markdown supported)</span>
                <MarkdownEditor value={editContent} onChange={setEditContent} rows={10} />
              </label>
              {editError && <p style={{ color: 'var(--color-red-light)', marginTop: 12 }}>{editError}</p>}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditOpen(false)}>Cancel</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={submitEditPost} disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRevisions && (
        <div className={styles.revisionsBackdrop} onClick={() => setShowRevisions(false)} role="dialog" aria-modal="true">
          <div className={styles.revisionsCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.revisionsHeader}>
              <h2>Edit history — post #{post.id}</h2>
              <button type="button" onClick={() => setShowRevisions(false)} className={styles.revisionsClose} aria-label="Close">×</button>
            </header>
            <div className={styles.revisionsBody}>
              {revisions === null ? (
                <p>Loading…</p>
              ) : revisions.length === 0 ? (
                <p>No prior revisions — this post hasn&apos;t been edited.</p>
              ) : (
                <ol className={styles.revisionsList}>
                  {revisions.map((r) => (
                    <li key={r.id} className={styles.revisionItem}>
                      <div className={styles.revisionMeta}>
                        Edited {new Date(r.edited_at).toLocaleString()} by {r.display_name || r.username || `user #${r.edited_by}`}
                      </div>
                      <div className={styles.revisionTitle}>Title (before): {r.previous_title || '—'}</div>
                      <pre className={styles.revisionContent}>{r.previous_content || ''}</pre>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
