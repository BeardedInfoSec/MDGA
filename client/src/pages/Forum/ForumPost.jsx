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
import MentionSuggest from '../../components/common/MentionSuggest';
import NumberChipsField from '../../components/common/NumberChipsField';
import GuildFlag from '../../components/common/GuildFlag';
import { getTimezoneOptions } from '../../utils/timezone';
import DropCountdown from '../../components/common/DropCountdown';
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
  const { isLoggedIn, isOfficer, hasPermission, user, apiFetch } = useAuth();

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
  // Schedule fields editable from the Edit Post modal (officers /
  // forum.schedule_posts only). Stored as the datetime-local string +
  // an IANA timezone so the wall-clock intent survives a round-trip.
  const [editPublishAt, setEditPublishAt] = useState('');
  const [editPublishTz, setEditPublishTz] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
    catch { return 'America/New_York'; }
  });
  // Per-comment edit state. Keyed by comment id so multiple inline editors
  // could theoretically be open at once, but in practice only one is shown.
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingCommentSaving, setEditingCommentSaving] = useState(false);
  const [editingCommentError, setEditingCommentError] = useState('');
  // Comment revisions modal (officer view of a single reply's edit history).
  const [commentRevisionsId, setCommentRevisionsId] = useState(null);
  const [commentRevisions, setCommentRevisions] = useState(null);
  // Image lightbox (forum #29 / #35): src of the image currently enlarged.
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Giveaway config modal (officer / forum.manage_giveaway only).
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [giveawayConfig, setGiveawayConfig] = useState(null);
  const [giveawayPositions, setGiveawayPositions] = useState([1, 100]);
  const [giveawayRateMin, setGiveawayRateMin] = useState(5);
  const [giveawayWarnings, setGiveawayWarnings] = useState([30, 15, 5]);
  const [giveawaySaving, setGiveawaySaving] = useState(false);
  const [giveawayError, setGiveawayError] = useState('');

  const openEditPost = () => {
    if (!post) return;
    setEditTitle(post.title || '');
    setEditContent(post.content || '');
    setEditError('');
    // Seed the schedule fields from whatever the server stored. publish_at
    // comes back as UTC; render it in the previously-set TZ so officers
    // see the same wall-clock they originally typed. Falls back to the
    // browser's IANA zone for posts saved before TZ-awareness shipped.
    if (post.publish_at) {
      try {
        const d = new Date(post.publish_at);
        const tz = editPublishTz;
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(d);
        const get = (t) => parts.find((p) => p.type === t)?.value || '';
        setEditPublishAt(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`);
      } catch { setEditPublishAt(''); }
    } else {
      setEditPublishAt('');
    }
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
      const canSchedule = isOfficer() || hasPermission('forum.schedule_posts');
      const body = { title: editTitle.trim(), content: editContent.trim() };
      if (canSchedule) {
        // Pass an explicit null when the field is cleared so the server
        // wipes the publish_at column (becomes immediately visible).
        body.publishAt = editPublishAt || null;
        body.publishTimezone = editPublishAt ? editPublishTz : null;
      }
      const res = await apiFetch(`/forum/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
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

  // Esc closes the image lightbox (matches Home carousel behavior).
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightboxSrc(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

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

  function startEditComment(c) {
    setEditingCommentId(c.id);
    setEditingCommentText(c.content || '');
    setEditingCommentError('');
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingCommentText('');
    setEditingCommentError('');
  }

  async function submitEditComment() {
    if (!editingCommentText.trim()) {
      setEditingCommentError('Reply content is required.');
      return;
    }
    setEditingCommentSaving(true);
    setEditingCommentError('');
    try {
      const res = await apiFetch(`/forum/comments/${editingCommentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editingCommentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditingCommentError(data.error || 'Failed to save.');
        return;
      }
      cancelEditComment();
      loadPost();
    } catch {
      setEditingCommentError('Failed to save.');
    } finally {
      setEditingCommentSaving(false);
    }
  }

  // Build a markdown blockquote of the source text + a citation header so
  // the reply shows "@author wrote:" above an indented quote. Inserts at the
  // current caret if the textarea is focused, otherwise appends.
  function quoteIntoReply(authorLabel, sourceText) {
    const quoted = String(sourceText || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const block = `> **${authorLabel} wrote:**\n${quoted}\n\n`;
    setCommentText((prev) => (prev ? `${prev.replace(/\s*$/, '')}\n\n${block}` : block));
    // Focus + scroll on the next tick so React has rendered the updated value.
    // We look up the textarea by id (set on the reply MarkdownEditor) rather
    // than threading a ref through the editor component.
    setTimeout(() => {
      const ta = document.getElementById('forum-reply-textarea');
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  async function openGiveaway() {
    setGiveawayOpen(true);
    setGiveawayError('');
    try {
      const res = await apiFetch(`/forum/posts/${post.id}/giveaway`);
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config;
        setGiveawayConfig(cfg);
        if (cfg) {
          setGiveawayPositions(cfg.target_positions || []);
          setGiveawayRateMin(Math.round((cfg.rate_limit_seconds || 0) / 60));
          setGiveawayWarnings(cfg.warning_minutes || []);
        } else {
          setGiveawayPositions([1, 100]);
          setGiveawayRateMin(5);
          setGiveawayWarnings([30, 15, 5]);
        }
      }
    } catch {
      setGiveawayConfig(null);
    }
  }

  async function saveGiveaway() {
    setGiveawaySaving(true);
    setGiveawayError('');
    try {
      if (giveawayPositions.length === 0) {
        setGiveawayError('At least one valid position is required.');
        return;
      }
      const rateSec = Math.max(0, Math.min(60, parseInt(giveawayRateMin, 10) || 0)) * 60;
      const res = await apiFetch(`/forum/posts/${post.id}/giveaway`, {
        method: 'PUT',
        body: JSON.stringify({
          target_positions: giveawayPositions,
          rate_limit_seconds: rateSec,
          warning_minutes: giveawayWarnings,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGiveawayError(data.error || 'Failed to save.');
        return;
      }
      setGiveawayOpen(false);
    } catch {
      setGiveawayError('Failed to save.');
    } finally {
      setGiveawaySaving(false);
    }
  }

  async function disableGiveaway() {
    if (!window.confirm('Disable the giveaway on this post? Past winners stay recorded; future comments stop being checked.')) return;
    setGiveawaySaving(true);
    try {
      const res = await apiFetch(`/forum/posts/${post.id}/giveaway`, { method: 'DELETE' });
      if (res.ok) {
        setGiveawayConfig(null);
        setGiveawayOpen(false);
      }
    } finally {
      setGiveawaySaving(false);
    }
  }

  async function openCommentRevisions(commentId) {
    setCommentRevisionsId(commentId);
    setCommentRevisions(null);
    try {
      const res = await apiFetch(`/forum/comments/${commentId}/revisions`);
      if (res.ok) {
        const data = await res.json();
        setCommentRevisions(data.revisions || []);
      } else {
        setCommentRevisions([]);
      }
    } catch {
      setCommentRevisions([]);
    }
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

          {/* Live countdown for scheduled posts (mostly giveaways during
              the drop-warning preview window). Refetches the post once
              the timer hits zero so the live version replaces the
              preview without a manual reload. */}
          {post.publish_at && new Date(post.publish_at).getTime() > Date.now() && (
            <DropCountdown
              targetIso={post.publish_at}
              label="Drop incoming"
              onElapsed={loadPost}
            />
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
                  {!authorIsFormer && <GuildFlag row={post} accessor="main" />}
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

            {/* Multi-image gallery (forum #29). Falls back to the legacy
                single image_url when the post predates the migration. */}
            {(() => {
              const images = (post.images && post.images.length > 0)
                ? post.images
                : (post.image_url ? [post.image_url] : []);
              if (images.length === 0) return null;
              return (
                <div className={images.length === 1 ? styles.postImageSingle : styles.postImageGallery}>
                  {images.map((src, i) => (
                    <button
                      type="button"
                      key={src + i}
                      className={styles.postImageBtn}
                      onClick={() => setLightboxSrc(src)}
                      aria-label={`Enlarge image ${i + 1}`}
                    >
                      <img src={src} alt={`Attachment ${i + 1}`} className={styles.postImageInline} loading="lazy" />
                    </button>
                  ))}
                </div>
              );
            })()}

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
                {!post.locked && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => quoteIntoReply(displayName, post.content || '')}
                    title="Quote into a reply"
                  >Quote</button>
                )}
                {!isAuthor && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={handleReportPost}>Report</button>
                )}
              </div>
            </div>

            {/* Owner / Officer / Permissioned actions. The Giveaway button
                only needs the forum.manage_giveaway perm (granted to
                website_guru), so it's checked separately from the
                officer-only pin / lock / revisions cluster. */}
            {(isAuthor || showOfficerActions || hasPermission('forum.manage_giveaway')) && (
              <div className={styles.postOwnerActions}>
                {(isAuthor || showOfficerActions) && (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={openEditPost}>
                    Edit post
                  </button>
                )}
                {showOfficerActions && (
                  <>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleTogglePin}>
                      {post.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={handleToggleLock}>
                      {post.locked ? 'Unlock' : 'Lock'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn--secondary btn--sm ${post.revision_count > 0 ? styles.revisionsBtnHasEdits : ''}`}
                      onClick={() => setShowRevisions(true)}
                      title={post.revision_count > 0 ? `${post.revision_count} prior edit${post.revision_count === 1 ? '' : 's'}` : 'No edits yet'}
                    >
                      Revisions{post.revision_count > 0 ? ` (${post.revision_count})` : ''}
                    </button>
                  </>
                )}
                {(showOfficerActions || hasPermission('forum.manage_giveaway')) && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={openGiveaway}
                    title="Configure giveaway automation (first / Nth comment wins)"
                  >Giveaway</button>
                )}
                {(isAuthor || showOfficerActions) && (
                  <button type="button" className="btn btn--danger btn--sm" onClick={handleDeletePost}>Delete post</button>
                )}
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
                          {!cIsFormer && <GuildFlag row={c} accessor="main" />}
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
                          {c.revision_count > 0 && (
                            <span
                              className={styles.commentEditedBadge}
                              title={`Edited ${c.revision_count} time${c.revision_count === 1 ? '' : 's'}`}
                            >· edited</span>
                          )}
                          <span className={styles.commentActions}>
                            {!post.locked && (
                              <button
                                type="button"
                                className={styles.commentActionLink}
                                onClick={() => quoteIntoReply(cName, c.content || '')}
                                title="Quote into a reply"
                              >Quote</button>
                            )}
                            {(cIsAuthor || showOfficerActions) && !post.locked && (
                              <button
                                type="button"
                                className={styles.commentActionLink}
                                onClick={() => startEditComment(c)}
                              >Edit</button>
                            )}
                            {showOfficerActions && c.revision_count > 0 && (
                              <button
                                type="button"
                                className={`${styles.commentActionLink} ${styles.commentActionLinkAccent}`}
                                onClick={() => openCommentRevisions(c.id)}
                                title="View edit history"
                              >Revisions ({c.revision_count})</button>
                            )}
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
                        {editingCommentId === c.id ? (
                          <div className={styles.commentEditForm}>
                            <MarkdownEditor
                              value={editingCommentText}
                              onChange={setEditingCommentText}
                              rows={5}
                              maxLength={REPLY_MAX + 100}
                            />
                            {editingCommentError && <Alert tone="error">{editingCommentError}</Alert>}
                            <div className={styles.commentEditActions}>
                              <button type="button" className="btn btn--secondary btn--sm" onClick={cancelEditComment}>Cancel</button>
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                onClick={submitEditComment}
                                disabled={editingCommentSaving || !editingCommentText.trim()}
                              >{editingCommentSaving ? 'Saving…' : 'Save'}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <MarkdownContent source={c.content} className={styles.commentText} />
                            {c.image_url && (
                              <img src={c.image_url} alt="Reply" className={styles.commentImageInline} />
                            )}
                          </>
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
                    id="forum-reply-textarea"
                    value={commentText}
                    onChange={setCommentText}
                    placeholder="Write your reply… Markdown supported. Type @ to mention."
                    rows={5}
                    maxLength={REPLY_MAX + 100}
                  />
                  <MentionSuggest
                    textareaId="forum-reply-textarea"
                    value={commentText}
                    onChange={setCommentText}
                    apiFetch={apiFetch}
                  />
                </label>

                <div className={styles.composeUpload}>
                  <div className={styles.composeUploadRow}>
                    <input
                      ref={commentImageRef}
                      id="forum-reply-image"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
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
              {(isOfficer() || hasPermission('forum.schedule_posts')) && (
                <div style={{ display: 'block', marginTop: 12 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    Schedule publish <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to publish immediately)</span>
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <input
                      type="datetime-local"
                      value={editPublishAt}
                      onChange={(e) => setEditPublishAt(e.target.value)}
                      style={{ flex: '1 1 220px', padding: '8px 12px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', fontFamily: 'var(--font-ui)' }}
                    />
                    <select
                      value={editPublishTz}
                      onChange={(e) => setEditPublishTz(e.target.value)}
                      style={{ flex: '1 1 220px', padding: '8px 12px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', fontFamily: 'var(--font-ui)' }}
                      aria-label="Timezone for scheduled publish"
                    >
                      {getTimezoneOptions().map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  {editPublishAt && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      Drop time locked to {editPublishTz}.
                    </span>
                  )}
                </div>
              )}
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

      {lightboxSrc && (
        <div
          className={styles.imageLightboxBackdrop}
          onClick={() => setLightboxSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged image"
        >
          <button
            type="button"
            className={styles.imageLightboxClose}
            onClick={() => setLightboxSrc(null)}
            aria-label="Close"
          >×</button>
          <img
            src={lightboxSrc}
            alt=""
            className={styles.imageLightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {commentRevisionsId !== null && (
        <div className={styles.revisionsBackdrop} onClick={() => setCommentRevisionsId(null)} role="dialog" aria-modal="true">
          <div className={styles.revisionsCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.revisionsHeader}>
              <h2>Edit history — reply #{commentRevisionsId}</h2>
              <button type="button" onClick={() => setCommentRevisionsId(null)} className={styles.revisionsClose} aria-label="Close">×</button>
            </header>
            <div className={styles.revisionsBody}>
              {commentRevisions === null ? (
                <p>Loading…</p>
              ) : commentRevisions.length === 0 ? (
                <p>No prior revisions.</p>
              ) : (
                <ol className={styles.revisionsList}>
                  {commentRevisions.map((r) => (
                    <li key={r.id} className={styles.revisionItem}>
                      <div className={styles.revisionMeta}>
                        Edited {new Date(r.edited_at).toLocaleString()} by {r.display_name || r.username || `user #${r.edited_by}`}
                      </div>
                      <pre className={styles.revisionContent}>{r.previous_content || ''}</pre>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {giveawayOpen && (
        <div className={styles.revisionsBackdrop} onClick={() => setGiveawayOpen(false)} role="dialog" aria-modal="true">
          <div className={styles.revisionsCard} onClick={(e) => e.stopPropagation()}>
            <header className={styles.revisionsHeader}>
              <h2>Configure giveaway — post #{post.id}</h2>
              <button type="button" onClick={() => setGiveawayOpen(false)} className={styles.revisionsClose} aria-label="Close">×</button>
            </header>
            <div className={styles.revisionsBody}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 0 }}>
                Comments matching the pattern below are counted in chronological order. Whoever lands on a target position wins; the bot announces in the officer channel.
              </p>
              <div style={{ marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Winning positions</span>
                <NumberChipsField
                  value={giveawayPositions}
                  onChange={setGiveawayPositions}
                  presets={[
                    { label: 'First only', values: [1] },
                    { label: '1st + 100th', values: [1, 100] },
                    { label: 'Top 3 (1, 2, 3)', values: [1, 2, 3] },
                  ]}
                  placeholder="e.g. 100"
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Per-user cooldown</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { label: 'None', value: 0 },
                    { label: '1 min', value: 1 },
                    { label: '5 min', value: 5 },
                    { label: '15 min', value: 15 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setGiveawayRateMin(p.value)}
                      style={{
                        background: Number(giveawayRateMin) === p.value ? 'rgba(212, 175, 55, 0.18)' : 'transparent',
                        color: Number(giveawayRateMin) === p.value ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                        border: `1px solid ${Number(giveawayRateMin) === p.value ? 'var(--color-gold)' : 'var(--color-gray-700)'}`,
                        borderRadius: 'var(--border-radius-sm)',
                        padding: '4px 12px',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >{p.label}</button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={giveawayRateMin}
                    onChange={(e) => setGiveawayRateMin(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                    style={{ width: 110, padding: '6px 10px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
                    placeholder="custom min"
                  />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Drop hint warnings</span>
                <NumberChipsField
                  value={giveawayWarnings}
                  onChange={setGiveawayWarnings}
                  unit="min before"
                  maxValue={1440}
                  presets={[
                    { label: 'None', values: [] },
                    { label: '30 / 15 / 5', values: [30, 15, 5] },
                    { label: '10 / 5 / 1', values: [10, 5, 1] },
                  ]}
                  placeholder="e.g. 30"
                />
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                  Only fires for scheduled posts. Each chip is a "minutes before drop" ping.
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                Reply pattern (<code>MDGA!</code> / <code>MEGA!</code>) and the Discord announcement channel are fixed sitewide.
              </p>
              {giveawayConfig?.winners && Object.keys(giveawayConfig.winners).length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(212, 175, 55, 0.08)', borderRadius: 'var(--border-radius-sm)' }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--color-gold)', marginBottom: 4 }}>Current winners</span>
                  {Object.entries(giveawayConfig.winners).map(([pos, cid]) => (
                    <div key={pos} style={{ fontSize: 13 }}>Slot #{pos} → comment {cid}</div>
                  ))}
                </div>
              )}
              {giveawayError && <p style={{ color: 'var(--color-red-light)', marginTop: 12 }}>{giveawayError}</p>}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {giveawayConfig && (
                  <button type="button" className="btn btn--danger btn--sm" onClick={disableGiveaway} disabled={giveawaySaving}>
                    Disable giveaway
                  </button>
                )}
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setGiveawayOpen(false)}>Cancel</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={saveGiveaway} disabled={giveawaySaving}>
                  {giveawaySaving ? 'Saving…' : 'Save'}
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
