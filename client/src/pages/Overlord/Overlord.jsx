import { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './Overlord.module.css';

// Hidden, direct-link-only page (/overlord). NOT linked in the nav — you
// reach it by typing the URL. Public read access (drives traffic / lets
// folks read past issues without digging through Discord); officers get
// an inline upload panel + per-issue delete. Backed by /api/overlord.

const DATE_OPTS = { year: 'numeric', month: 'long', day: 'numeric' };

function formatIssueDate(n) {
  // issue_date is a calendar date (no time). Parsing "2026-06-16" via
  // new Date() treats it as UTC midnight, which renders as the *previous*
  // day in any timezone behind UTC — the off-by-one. Build a local Date
  // from the Y/M/D parts instead so the day is shown exactly as entered.
  if (n.issue_date) {
    const m = String(n.issue_date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString(undefined, DATE_OPTS);
    }
  }
  // Fallback: upload timestamp (a real instant — local rendering is correct).
  if (!n.created_at) return '';
  const d = new Date(n.created_at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, DATE_OPTS);
}

export default function Overlord() {
  useDocumentTitle('Overlord NA | MDGA');
  const { isLoggedIn, isOfficer, apiFetch } = useAuth();
  const canManage = isLoggedIn && typeof isOfficer === 'function' && isOfficer();

  const [newsletters, setNewsletters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null); // image_url being viewed

  const [form, setForm] = useState({ file: null, title: '', issueDate: '' });
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/overlord');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setNewsletters(data.newsletters || []);
      setError('');
    } catch {
      setError('Could not load the archive. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const upload = useCallback(async (e) => {
    e.preventDefault();
    if (!form.file) { setNotice('Pick an image first.'); return; }
    setUploading(true);
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('image', form.file);
      if (form.title.trim()) fd.append('title', form.title.trim());
      if (form.issueDate) fd.append('issueDate', form.issueDate);
      // headers: {} → let the browser set the multipart boundary itself.
      const res = await apiFetch('/overlord', { method: 'POST', headers: {}, body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      setForm({ file: null, title: '', issueDate: '' });
      e.target.reset?.();
      await load();
      setNotice('Posted.');
    } catch (err) {
      setNotice(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [form, apiFetch, load]);

  const remove = useCallback(async (id) => {
    if (!confirm('Delete this newsletter?')) return;
    try {
      const res = await apiFetch(`/overlord/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setNewsletters((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setNotice('Failed to delete.');
    }
  }, [apiFetch]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Daily Dispatch</span>
        <h1 className={styles.title}>Overlord NA</h1>
        <p className={styles.subtitle}>
          Overlord NA newsletter. Catch up on past issues here instead of scrolling Discord.
        </p>
      </header>

      {canManage && (
        <form className={styles.uploadCard} onSubmit={upload}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Post a new issue</span>
            <span className={styles.cardMeta}>Officers only · not shown publicly</span>
          </div>
          <div className={styles.uploadGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Title (optional)</span>
              <input
                type="text"
                placeholder="e.g. The Ghost of Callahan"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Issue date (optional)</span>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              />
            </label>
          </div>
          <div className={styles.uploadActions}>
            <button type="submit" className="btn btn--primary btn--sm" disabled={uploading}>
              <Upload size={14} aria-hidden="true" />
              <span>{uploading ? 'Posting…' : 'Post issue'}</span>
            </button>
            {notice && <span className={styles.notice}>{notice}</span>}
          </div>
        </form>
      )}

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : error ? (
        <p className={styles.empty}>{error}</p>
      ) : newsletters.length === 0 ? (
        <p className={styles.empty}>No issues posted yet.</p>
      ) : (
        <div className={styles.grid}>
          {newsletters.map((n) => (
            <figure key={n.id} className={styles.tile}>
              <button
                type="button"
                className={styles.thumbButton}
                onClick={() => setLightbox(n.image_url)}
                aria-label={n.title ? `Open ${n.title}` : 'Open newsletter'}
              >
                <img src={n.image_url} alt={n.title || 'Overlord newsletter'} loading="lazy" />
              </button>
              <figcaption className={styles.caption}>
                {n.title && <span className={styles.tileTitle}>{n.title}</span>}
                <span className={styles.tileDate}>{formatIssueDate(n)}</span>
              </figcaption>
              {canManage && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => remove(n.id)}
                  aria-label="Delete newsletter"
                  title="Delete"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button type="button" className={styles.lightboxClose} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
          <img src={lightbox} alt="" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
