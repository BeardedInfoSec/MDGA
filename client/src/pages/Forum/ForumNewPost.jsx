import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert } from '../../components/ui';
import MarkdownEditor from '../../components/common/MarkdownEditor';
import MentionSuggest from '../../components/common/MentionSuggest';
import ForumSidebar from './ForumSidebar';
import styles from './Forum.module.css';
import { postUrlFromParts } from '../../utils/forumUrls';

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
  const { isLoggedIn, isOfficer, hasPermission, apiFetch } = useAuth();

  const [allCategories, setAllCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Multi-image attachments (forum #29). imagePreviews is parallel to the
  // file input's .files list — a data-URL each so the user sees what
  // they're about to upload before submit.
  const [imagePreviews, setImagePreviews] = useState([]);
  const imageRef = useRef(null);
  const MAX_IMAGES = 10;
  // Optional scheduled publish (forum #39). Officers only. Empty string =
  // publish immediately; a future datetime hides the post until then.
  const [publishAt, setPublishAt] = useState('');
  // Inline giveaway config (forum.manage_giveaway only). When enabled,
  // the form does a second PUT to /forum/posts/:id/giveaway right after
  // the create succeeds — same fields the post-detail modal exposes.
  const [giveawayEnabled, setGiveawayEnabled] = useState(false);
  const [giveawayPositions, setGiveawayPositions] = useState('1, 100');
  const [giveawayRateMin, setGiveawayRateMin] = useState('5');
  const [giveawayWarnings, setGiveawayWarnings] = useState('30, 15, 5');

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
        // URL :slug param can be either a numeric id or a name-derived slug
        const target = String(slug).toLowerCase();
        const match = cats.find((c) =>
          String(c.id) === target || String(c.slug || '').toLowerCase() === target
        );
        setCategory(match || null);
      } catch {
        setAllCategories([]);
      }
    })();
  }, [isLoggedIn, apiFetch, slug]);

  function handleImageChange() {
    const files = Array.from(imageRef.current?.files || []).slice(0, MAX_IMAGES);
    if (files.length === 0) {
      setImagePreviews([]);
      return;
    }
    Promise.all(files.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    }))).then(setImagePreviews);
  }

  function clearImage() {
    if (imageRef.current) imageRef.current.value = '';
    setImagePreviews([]);
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
      // Multi-upload: upload each file sequentially (the existing /upload
      // endpoint accepts one image at a time). Sequential rather than
      // parallel so we can fail fast on the first bad file and the user
      // sees one clear error message instead of a stack of toasts.
      const imageUrls = [];
      const files = Array.from(imageRef.current?.files || []).slice(0, MAX_IMAGES);
      for (const file of files) {
        const fd = new FormData();
        fd.append('image', file);
        const uploadRes = await apiFetch('/upload', { method: 'POST', headers: {}, body: fd });
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({}));
          throw new Error(uploadErr.error || `Image upload failed for ${file.name}`);
        }
        const uploadData = await uploadRes.json();
        imageUrls.push(uploadData.imageUrl);
      }
      // The first uploaded image also goes in image_url for legacy clients
      // (and the search-result preview thumbnail).
      const imageUrl = imageUrls[0] || null;

      // URL param can be numeric id OR slug. Prefer the loaded category's
      // numeric id; fall back to parseInt(slug) only when it cleanly parses
      // (so old numeric URLs still work even if category fetch hasn't landed).
      const categoryId = category?.id ?? (Number.isInteger(Number(slug)) ? parseInt(slug, 10) : null);
      if (!categoryId) {
        setError('Could not resolve the category for this URL. Try opening the category from the forum page and clicking New Post from there.');
        setSubmitting(false);
        return;
      }
      const res = await apiFetch('/forum/posts', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          title: title.trim(),
          content: content.trim(),
          imageUrl,
          imageUrls,
          publishAt: publishAt && isOfficer() ? new Date(publishAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create post');
      }
      const data = await res.json();

      // If the author flipped on Giveaway settings, attach the config in
      // a second request now that the post id exists. A failure here
      // doesn't roll back the post — we just surface the error so they
      // can retry from the post detail page's Giveaway button.
      if (giveawayEnabled && hasPermission('forum.manage_giveaway')) {
        const positions = giveawayPositions
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (positions.length === 0) {
          setError('Giveaway needs at least one valid position. Post was created — open it and configure the giveaway from the toolbar.');
          navigate(postUrlFromParts(data.id, title.trim()));
          return;
        }
        const rateSec = Math.max(0, Math.min(60, parseInt(giveawayRateMin, 10) || 0)) * 60;
        const warningMinutes = giveawayWarnings
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0 && n <= 1440);
        const gRes = await apiFetch(`/forum/posts/${data.id}/giveaway`, {
          method: 'PUT',
          body: JSON.stringify({
            target_positions: positions,
            rate_limit_seconds: rateSec,
            warning_minutes: warningMinutes,
          }),
        });
        if (!gRes.ok) {
          const gErr = await gRes.json().catch(() => ({}));
          setError(`Post created, but giveaway config failed: ${gErr.error || 'unknown error'}. Open the post and reconfigure from the toolbar.`);
        }
      }

      navigate(postUrlFromParts(data.id, title.trim()));
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
                  id="forum-newpost-textarea"
                  value={content}
                  onChange={setContent}
                  placeholder="Share strategy, screenshots, recruiting calls, or just say hi… Markdown supported. Type @ to mention."
                  rows={12}
                />
                <MentionSuggest
                  textareaId="forum-newpost-textarea"
                  value={content}
                  onChange={setContent}
                  apiFetch={apiFetch}
                />
              </label>

              {/* Image upload — up to MAX_IMAGES files. Reselecting the
                  input replaces the entire set (matches native multi-file
                  picker behavior); per-file remove would require a custom
                  buffer state we're skipping for now. */}
              <div className={styles.composeUpload}>
                <span className={styles.composeLabel}>
                  Attach images <span className={styles.composeOptional}>(optional, up to {MAX_IMAGES})</span>
                </span>
                <div className={styles.composeUploadRow}>
                  <input
                    ref={imageRef}
                    id="forum-post-image"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                    onChange={handleImageChange}
                    className={styles.composeFileInput}
                  />
                  <label htmlFor="forum-post-image" className="btn btn--secondary btn--sm">
                    {imagePreviews.length > 0 ? `Replace (${imagePreviews.length} selected)` : 'Choose images'}
                  </label>
                  {imagePreviews.length > 0 && (
                    <button type="button" className="btn btn--danger btn--sm" onClick={clearImage}>
                      Remove all
                    </button>
                  )}
                  <span className={styles.composeUploadHint}>JPG, PNG, GIF, or WebP · auto-compressed to WebP</span>
                </div>
                {imagePreviews.length > 0 && (
                  <div className={styles.composeGalleryGrid}>
                    {imagePreviews.map((src, i) => (
                      <img key={i} src={src} alt={`Preview ${i + 1}`} className={styles.composeGalleryItem} />
                    ))}
                  </div>
                )}
              </div>

              {/* Officer-only: schedule the post for a future time. Leaving
                  blank publishes immediately. */}
              {(isOfficer() || hasPermission('forum.schedule_posts')) && (
                <label className={styles.composeField}>
                  <span className={styles.composeLabel}>
                    Schedule publish <span className={styles.composeOptional}>(optional)</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                    className={styles.composeTextInput}
                  />
                  {publishAt && new Date(publishAt) > new Date() && (
                    <span className={styles.composeUploadHint}>
                      Will be hidden from members until {new Date(publishAt).toLocaleString()}.
                    </span>
                  )}
                </label>
              )}

              {/* Inline giveaway config (officers / forum.manage_giveaway).
                  Same fields as the post-detail Giveaway modal; on submit
                  we attach the config to the new post in a second request
                  after the create succeeds. */}
              {(isOfficer() || hasPermission('forum.manage_giveaway')) && (
                <div
                  style={{
                    border: `2px solid ${giveawayEnabled ? 'var(--color-gold)' : 'var(--color-gray-700)'}`,
                    borderRadius: 'var(--border-radius-sm)',
                    background: giveawayEnabled ? 'rgba(212, 175, 55, 0.08)' : 'rgba(212, 175, 55, 0.03)',
                    padding: 16,
                    transition: 'border-color var(--transition-fast), background var(--transition-fast)',
                  }}
                >
                  <label
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                  >
                    <input
                      type="checkbox"
                      checked={giveawayEnabled}
                      onChange={(e) => setGiveawayEnabled(e.target.checked)}
                      style={{ width: 20, height: 20, accentColor: 'var(--color-gold)', marginTop: 2, flexShrink: 0 }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-gold)', letterSpacing: 1 }}>
                        Run this post as a giveaway
                      </span>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                        First / Nth comment wins. The bot posts a kickoff message in Discord when you save and announces every winner as slots fill.
                      </span>
                    </span>
                  </label>
                  {giveawayEnabled && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(212, 175, 55, 0.25)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <label>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Target positions (comma-separated)</span>
                        <input
                          type="text"
                          value={giveawayPositions}
                          onChange={(e) => setGiveawayPositions(e.target.value)}
                          placeholder="1, 100"
                          className={styles.composeTextInput}
                        />
                      </label>
                      <label>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Per-user cooldown (minutes, 0 = none)</span>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={giveawayRateMin}
                          onChange={(e) => setGiveawayRateMin(e.target.value)}
                          className={styles.composeTextInput}
                          style={{ width: 120 }}
                        />
                      </label>
                      <label>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                          Drop hint warnings (minutes before publish, comma-separated)
                        </span>
                        <input
                          type="text"
                          value={giveawayWarnings}
                          onChange={(e) => setGiveawayWarnings(e.target.value)}
                          placeholder="30, 15, 5"
                          className={styles.composeTextInput}
                        />
                        <span className={styles.composeUploadHint}>
                          Only fires if you also set a scheduled publish time above. Example: "30, 15, 5" → the bot pings Discord 30 / 15 / 5 minutes before the drop.
                        </span>
                      </label>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Reply pattern (<code>MDGA!</code> / <code>MEGA!</code>) and the Discord announcement channel are fixed sitewide.
                      </p>
                    </div>
                  )}
                </div>
              )}

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
