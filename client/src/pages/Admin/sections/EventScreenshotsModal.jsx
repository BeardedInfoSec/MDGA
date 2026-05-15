import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Trash2, X } from 'lucide-react';
import styles from './EventScreenshotsModal.module.css';

/**
 * EventScreenshotsModal
 *
 * Lets officers upload + delete screenshots for a past event so the public
 * Events page can show a recap gallery. Files are POSTed one-at-a-time as
 * multipart `image` fields (the existing upload middleware accepts a
 * single image per request and converts to WebP).
 */
export default function EventScreenshotsModal({ event, apiFetch, showToast, onClose }) {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/events/${event.id}/screenshots`);
      const data = await res.json();
      setScreenshots(data.screenshots || []);
    } catch {
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  }, [event, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0 || !event) return;
    setUploading(true);
    let uploaded = 0;
    let failed = 0;
    // Sequentially upload — keeps memory low and respects the
    // single-file middleware. Multi-file picker can still queue many.
    for (const file of Array.from(fileList)) {
      try {
        const fd = new FormData();
        fd.append('image', file);
        // apiFetch overrides Content-Type to JSON when headers default,
        // so pass an explicit empty headers object — the existing helper
        // recognises this as "leave it alone for FormData".
        const res = await apiFetch(`/events/${event.id}/screenshots`, {
          method: 'POST',
          headers: {},
          body: fd,
        });
        if (res.ok) uploaded += 1; else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (uploaded > 0) showToast(`Uploaded ${uploaded} screenshot${uploaded === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}`);
    else showToast('Upload failed');
    load();
  }

  async function deleteShot(sid) {
    if (!event) return;
    if (!window.confirm('Delete this screenshot?')) return;
    try {
      const res = await apiFetch(`/events/${event.id}/screenshots/${sid}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Screenshot deleted');
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to delete');
      }
    } catch {
      showToast('Failed to delete');
    }
  }

  if (!event) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`Manage screenshots for ${event.title}`}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Recap screenshots</span>
            <h3 className={styles.title}>{event.title}</h3>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.uploadRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            className={styles.fileInput}
            id="event-screenshot-upload"
          />
          <label htmlFor="event-screenshot-upload" className={`btn btn--primary btn--sm ${uploading ? styles.uploadBtnDisabled : ''}`}>
            <Upload size={14} aria-hidden="true" />
            <span>{uploading ? 'Uploading…' : 'Upload images'}</span>
          </label>
          <span className={styles.hint}>JPG, PNG, WebP, or GIF · auto-compressed to WebP · pick multiple at once</span>
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.empty}>Loading…</p>
          ) : screenshots.length === 0 ? (
            <p className={styles.empty}>No screenshots yet. Upload some to give this event a recap.</p>
          ) : (
            <ul className={styles.grid}>
              {screenshots.map((s) => (
                <li key={s.id} className={styles.tile}>
                  <img src={s.url} alt={s.caption || ''} loading="lazy" />
                  <button
                    type="button"
                    className={styles.tileDelete}
                    onClick={() => deleteShot(s.id)}
                    aria-label="Delete screenshot"
                    title="Delete screenshot"
                  >
                    <Trash2 size={12} />
                  </button>
                  {s.caption && <span className={styles.tileCaption}>{s.caption}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
