import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert } from '../../components/ui';
import MarkdownEditor from '../../components/common/MarkdownEditor';
import ForumSidebar from './ForumSidebar';
import styles from './Forum.module.css';

const FALLBACK_ICONS = {
  'General Discussion': '\u{1F4AC}',
  'PvP Strategy': '⚔️',
  'Recruitment': '\u{1F4CB}',
  'Off-Topic': '\u{1F3AE}',
  'Guild Announcements': '\u{1F4E2}',
};

const TITLE_MAX = 200;
const CONTENT_MAX = 10000;

export default function ForumNewPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, isOfficer, apiFetch } = useAuth();

  const [allCategories, setAllCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const imageRef = useRef(null);

  useDocumentTitle(category ? `New post in ${category.name} | MDGA` : 'New Post | MDGA');

  // Load the category list (for sidebar + to find the active category by slug/id)
  useEffect(() => {
    (async () => {
      try {
        const res = isLoggedIn
          ? await apiFetch('/forum/categories')
          : await fetch('/api/forum/categories');
        const data = await res.json();
        const cats = data.categories || [];
        setAllCategories(cats);
        const match = cats.find((c) => String(c.id) === String(slug));
        setCategory(match || null);
      } catch {
        setAllCategories([]);
      }
    })();
  }, [isLoggedIn, apiFetch, slug]);

  function handleImageChange() {
    const file = imageRef.current?.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  function clearImage() {
    if (imageRef.current) imageRef.current.value = '';
    setImagePreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.');
      return;
    }
    if (!slug) {
      setError('No category specified.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let imageUrl = null;
      const imageFile = imageRef.current?.files[0];
      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        const uploadRes = await apiFetch('/upload', { method: 'POST', headers: {}, body: fd });
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({}));
          throw new Error(uploadErr.error || 'Image upload failed');
        }
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.imageUrl;
      }

      const res = await apiFetch('/forum/posts', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: parseInt(slug),
          title: title.trim(),
          content: content.trim(),
          imageUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create post');
      }
      const data = await res.json();
      navigate(`/forum/post/${data.id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setSubmitting(false);
    }
  }

  // Logged-out: same shell, just a friendly stop sign in the content column
  if (!isLoggedIn) {
    return (
      <div className={styles.forumPage}>
        <header className={styles.forumTitleBand}>
          <div className={styles.forumTitleBandInner}>
            <span className={styles.forumEyebrow}>New post</span>
            <h1 className={styles.forumPageTitle}>Sign in to post</h1>
            <p className={styles.forumPageSubtitle}>You need a Discord-verified guild account to start a discussion.</p>
          </div>
        </header>
        <div className={styles.forumLayout}>
          <ForumSidebar categories={allCategories} activeCategoryId={slug} />
          <main className={styles.forumContent}>
            <p className={styles.forumEmptyState}>
              <Link to="/login" className="m-link">Log in</Link> with Discord to create a post.
            </p>
          </main>
        </div>
      </div>
    );
  }

  // Officer-only category gate
  const officerBlocked = category?.officer_only && !isOfficer();

  const titleLen = title.length;
  const contentLen = content.length;
  const overTitle = titleLen > TITLE_MAX;
  const overContent = contentLen > CONTENT_MAX;
  const canSubmit = !submitting && title.trim() && content.trim() && !overTitle && !overContent && !officerBlocked;

  const accent = category?.accent_color || null;

  return (
    <div className={styles.forumPage}>
      <header
        className={styles.forumTitleBand}
        style={accent ? { borderBottomColor: accent } : undefined}
      >
        <div className={styles.forumTitleBandInner}>
          <span className={styles.forumEyebrow}>Compose</span>
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
              {category ? `New post in ${category.name}` : 'New post'}
            </h1>
          </div>
          <p className={styles.forumPageSubtitle}>
            Keep it relevant and respectful. Posts can be edited later by you or
            officers; comments and reactions help others engage.
          </p>
        </div>
      </header>

      <div className={styles.forumLayout}>
        <ForumSidebar categories={allCategories} activeCategoryId={slug} />

        <main className={styles.forumContent}>
          <Link to={`/forum/category/${slug}`} className={styles.forumBackLink}>
            ← Back to {category?.name || 'category'}
          </Link>

          {officerBlocked ? (
            <p className={styles.forumEmptyState}>
              This category is officer-only. You need officer rank or higher to post here.
            </p>
          ) : (
            <form className={styles.composeForm} onSubmit={handleSubmit} noValidate>
              {/* Title */}
              <label className={styles.composeField}>
                <span className={styles.composeLabel}>
                  Title
                  <span className={`${styles.composeCounter} ${overTitle ? styles.composeCounterOver : ''}`}>
                    {titleLen} / {TITLE_MAX}
                  </span>
                </span>
                <input
                  className={styles.composeInput}
                  type="text"
                  placeholder="What is your post about?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX + 50}
                  autoFocus
                />
              </label>

              {/* Content */}
              <label className={styles.composeField}>
                <span className={styles.composeLabel}>
                  Body
                  <span className={`${styles.composeCounter} ${overContent ? styles.composeCounterOver : ''}`}>
                    {contentLen.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
                  </span>
                </span>
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Share strategy, screenshots, recruiting calls, or just say hi… Markdown supported."
                  rows={12}
                />
              </label>

              {/* Image upload */}
              <div className={styles.composeUpload}>
                <span className={styles.composeLabel}>Attach image <span className={styles.composeOptional}>(optional)</span></span>
                <div className={styles.composeUploadRow}>
                  <input
                    ref={imageRef}
                    id="forum-post-image"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleImageChange}
                    className={styles.composeFileInput}
                  />
                  <label htmlFor="forum-post-image" className="btn btn--secondary btn--sm">
                    {imagePreview ? 'Replace image' : 'Choose image'}
                  </label>
                  {imagePreview && (
                    <button type="button" className="btn btn--danger btn--sm" onClick={clearImage}>
                      Remove
                    </button>
                  )}
                  <span className={styles.composeUploadHint}>JPG, PNG, GIF, or WebP · auto-compressed to WebP</span>
                </div>
                {imagePreview && (
                  <div className={styles.composePreviewWrap}>
                    <img src={imagePreview} alt="Preview" className={styles.composePreview} />
                  </div>
                )}
              </div>

              {/* Tips panel */}
              <aside className={styles.composeTips}>
                <span className={styles.composeTipsLabel}>Posting tips</span>
                <ul>
                  <li>Use a clear, specific title — folks scan a long list.</li>
                  <li>For recruitment / LFG posts, include realm, faction, and times.</li>
                  <li>Screenshots load faster than 10 paragraphs of description.</li>
                </ul>
              </aside>

              {error && <Alert tone="error">{error}</Alert>}

              <div className={styles.composeActions}>
                <Link to={`/forum/category/${slug}`} className="btn btn--secondary">Cancel</Link>
                <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                  {submitting ? 'Posting…' : 'Create Post'}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
