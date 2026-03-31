import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { timeAgo, armoryUrl } from '../../utils/helpers';
import PageHero from '../../components/common/PageHero';
import { Alert, Input } from '../../components/ui';
import styles from './Forum.module.css';

export default function ForumPost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, isOfficer, user, apiFetch } = useAuth();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [userVote, setUserVote] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const commentImageRef = useRef(null);

  const cleanPostTitle = (value) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const postTitle = cleanPostTitle(post?.title || '');

  useDocumentTitle(post ? `${postTitle} | MDGA Forum` : 'Forum | MDGA');

  const loadPost = useCallback(async () => {
    if (!id) return;
    try {
      const path = `/forum/posts/${id}`;
      const res = isLoggedIn
        ? await apiFetch(path)
        : await fetch(`/api${path}`);
      if (!res.ok) {
        setPost(null);
        return;
      }
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

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const handleVote = async (vote) => {
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
        setPost(prev => prev ? { ...prev, net_votes: data.net_votes, upvotes: data.upvotes, downvotes: data.downvotes } : prev);
      }
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post and all its comments?')) return;
    try {
      const res = await apiFetch(`/forum/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        navigate('/forum');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete post');
      }
    } catch {
      alert('Failed to delete post');
    }
  };

  const handleTogglePin = async () => {
    try {
      const res = await apiFetch(`/forum/posts/${id}/pin`, { method: 'PUT' });
      if (res.ok) loadPost();
    } catch {
      alert('Failed to toggle pin');
    }
  };

  const handleToggleLock = async () => {
    try {
      const res = await apiFetch(`/forum/posts/${id}/lock`, { method: 'PUT' });
      if (res.ok) loadPost();
    } catch {
      alert('Failed to toggle lock');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      const res = await apiFetch(`/forum/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) loadPost();
      else {
        const data = await res.json();
        alert(data.error || 'Failed to delete comment');
      }
    } catch {
      alert('Failed to delete comment');
    }
  };

  const handleReportPost = async () => {
    const reasonInput = window.prompt('Why are you reporting this post? (optional)', '');
    if (reasonInput === null) return;

    try {
      const res = await apiFetch(`/forum/posts/${id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Report submitted. Officers will review it.');
      } else {
        alert(data.error || 'Failed to submit report.');
      }
    } catch {
      alert('Failed to submit report.');
    }
  };

  const handleReportComment = async (commentId) => {
    const reasonInput = window.prompt('Why are you reporting this reply? (optional)', '');
    if (reasonInput === null) return;

    try {
      const res = await apiFetch(`/forum/comments/${commentId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reasonInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Report submitted. Officers will review it.');
      } else {
        alert(data.error || 'Failed to submit report.');
      }
    } catch {
      alert('Failed to submit report.');
    }
  };

  const handleSharePost = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {
      window.prompt('Copy this link:', window.location.href);
    });
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) {
      setCommentError('Reply content is required.');
      return;
    }
    setSubmitting(true);
    setCommentError('');

    try {
      // Upload image if selected
      let imageUrl = null;
      const imageFile = commentImageRef.current?.files[0];
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        const uploadRes = await apiFetch('/upload', {
          method: 'POST',
          headers: {},
          body: formData,
        });
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
        if (commentImageRef.current) commentImageRef.current.value = '';
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
  };

  if (loading) {
    return (
      <>
        <PageHero title="Forum" subtitle="" />
        <section className="section">
          <div className="container">
            <p className={styles.empty}>Loading...</p>
          </div>
        </section>
      </>
    );
  }

  if (!post) {
    return (
      <>
        <PageHero title="Forum" subtitle="" />
        <section className="section">
          <div className="container">
            <p className={styles.empty}>Post not found.</p>
          </div>
        </section>
      </>
    );
  }

  // Content gating for logged-out users
  if (!isLoggedIn) {
    return (
      <>
        <PageHero title={postTitle} subtitle="" />
        <section className="section">
          <div className="container">
            <div className={styles.post}>
              <h2 className={styles.postTitle}>{postTitle}</h2>
              <p className={styles.postContentGated}>{(post.content || '').substring(0, 150)}...</p>
              <div className={styles.gate}>
                <p>Log in to read the full post and join the discussion.</p>
                <Link to="/login" className="btn btn--primary">Log In</Link>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  const displayName = post.display_name || post.username;
  const isAuthor = user && user.id === post.user_id;
  const showOfficerActions = isOfficer();

  return (
    <>
      <PageHero title={postTitle} subtitle="" />
      <section className="section">
        <div className="container">
          {post.category_id && (
            <Link to={`/forum/category/${post.category_id}`} className={styles.backLink}>
              &larr; Back to Category
            </Link>
          )}

          {/* Post */}
          <div className={styles.post}>
            <div className={styles.postAvatarSidebar}>
              <Link to={`/profile?id=${post.user_id}`}>
                <img
                  src={post.avatar_url || '/images/default-avatar.svg'}
                  alt={displayName}
                  className={styles.postAvatar}
                />
              </Link>
            </div>
            <div className={styles.postBody}>
            <div className={styles.postHeader}>
              <div className={styles.postAuthor}>
                <span className={`rank-badge rank-badge--${post.rank}`}>{post.rank}</span>
                <Link to={`/profile?id=${post.user_id}`} className={styles.profileLink}>{displayName}</Link>
                {post.realm && post.character_name && (
                  <a
                    href={armoryUrl(post.realm.toLowerCase(), post.character_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.armoryLink}
                    title="View Armory Profile"
                  >
                    &#9876;
                  </a>
                )}
              </div>
              <span className={styles.postDate}>{timeAgo(post.created_at)}</span>
            </div>

            <h2 className={styles.postTitle}>{postTitle}</h2>
            <div className={styles.postContent}>{post.content}</div>
            {post.image_url && (
              <img src={post.image_url} alt="Post image" className={styles.postImage} />
            )}

            {/* Engagement */}
            <div className={styles.engagement}>
              <div className={styles.vote}>
                <button
                  className={userVote === 1 ? styles.voteBtnUpActive : styles.voteBtn}
                  onClick={() => handleVote(1)}
                  title="Upvote"
                >
                  &#9650;
                </button>
                <span className={styles.voteScore}>{post.net_votes || 0}</span>
                <button
                  className={userVote === -1 ? styles.voteBtnDownActive : styles.voteBtn}
                  onClick={() => handleVote(-1)}
                  title="Downvote"
                >
                  &#9660;
                </button>
              </div>
              <div className={styles.engagementStats}>
                <span title="Views">&#128065; {post.view_count || 0} views</span>
                <span title="Comments">&#128172; {comments.length} replies</span>
                <span title="Upvotes">Upvotes: {post.upvotes || 0}</span>
                <span title="Downvotes">Downvotes: {post.downvotes || 0}</span>
              </div>
              <button className="btn btn--secondary btn--sm" onClick={handleSharePost} title="Copy link">
                &#128279; Share
              </button>
              <button
                className={`btn btn--secondary btn--sm ${styles.reportBtn}`}
                onClick={isAuthor ? undefined : handleReportPost}
                disabled={isAuthor}
                title={isAuthor ? 'You cannot report your own post' : 'Report post'}
              >
                Report
              </button>
              {isAuthor && (
                <span className={styles.reportHint}>You cannot report your own post.</span>
              )}
            </div>

            {/* Actions */}
            {(isAuthor || showOfficerActions) && (
              <div className={styles.postActions}>
                {(isAuthor || showOfficerActions) && (
                  <button className="btn btn--danger btn--sm" onClick={handleDeletePost}>Delete Post</button>
                )}
                {showOfficerActions && (
                  <>
                    <button className="btn btn--secondary btn--sm" onClick={handleTogglePin}>
                      {post.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button className="btn btn--secondary btn--sm" onClick={handleToggleLock}>
                      {post.locked ? 'Unlock' : 'Lock'}
                    </button>
                  </>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Comments */}
          <h3 className={styles.commentsTitle}>
            {comments.length} {comments.length === 1 ? 'Reply' : 'Replies'}
          </h3>

          {comments.length > 0 && (
            <div className={styles.comments}>
              {comments.map(c => {
                const cName = c.display_name || c.username;
                const cIsAuthor = user && user.id === c.user_id;
                return (
                  <div key={c.id} className={styles.comment}>
                    <div className={styles.commentAvatarSidebar}>
                      <Link to={`/profile?id=${c.user_id}`}>
                        <img
                          src={c.avatar_url || '/images/default-avatar.svg'}
                          alt={cName}
                          className={styles.commentAvatar}
                        />
                      </Link>
                    </div>
                    <div className={styles.commentBody}>
                    <div className={styles.commentHeader}>
                      <span className={`rank-badge rank-badge--${c.rank}`}>{c.rank}</span>
                      <Link to={`/profile?id=${c.user_id}`} className={styles.profileLink}>{cName}</Link>
                      {c.realm && c.character_name && (
                        <a
                          href={armoryUrl(c.realm.toLowerCase(), c.character_name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.armoryLink}
                          title="View Armory Profile"
                        >
                          &#9876;
                        </a>
                      )}
                      {(cIsAuthor || showOfficerActions) && (
                        <button
                          className={`btn btn--danger btn--sm ${styles.commentDelete}`}
                          onClick={() => handleDeleteComment(c.id)}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        className={`btn btn--secondary btn--sm ${styles.commentReport}`}
                        onClick={cIsAuthor ? undefined : () => handleReportComment(c.id)}
                        disabled={cIsAuthor}
                        title={cIsAuthor ? 'You cannot report your own reply' : 'Report reply'}
                      >
                        Report
                      </button>
                      <span className={styles.commentDate}>{timeAgo(c.created_at)}</span>
                    </div>
                    <div className={styles.commentContent}>{c.content}</div>
                    {c.image_url && (
                      <img src={c.image_url} alt="Comment image" className={styles.commentImage} />
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Comment Form */}
          {isLoggedIn && !post.locked && (
            <form className={styles.commentForm} onSubmit={handleSubmitComment}>
              <h3>Add a Reply</h3>
              <textarea
                className={styles.commentFormTextarea}
                placeholder="Write your reply..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <div className={styles.commentUploadGroup}>
                <label className={styles.commentUploadLabel}>
                  Attach image (optional)
                </label>
                <Input
                  type="file"
                  ref={commentImageRef}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className={styles.commentUploadInput}
                />
              </div>
              {commentError && (
                <Alert tone="error" className={styles.commentError}>
                  {commentError}
                </Alert>
              )}
              <button className="btn btn--primary btn--sm" type="submit" disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Reply'}
              </button>
            </form>
          )}

          {post.locked && (
            <p className={`${styles.empty} ${styles.lockedNotice}`}>
              This post is locked. No new replies.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
