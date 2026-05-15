import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Trash2, RefreshCw } from 'lucide-react';
import styles from './RecycleBinAdmin.module.css';

export default function RecycleBinAdmin({ apiFetch, showToast }) {
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('posts');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/recycle-bin');
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setComments(data.comments || []);
      } else {
        showToast?.('Failed to load recycle bin');
      }
    } catch {
      showToast?.('Failed to load recycle bin');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showToast]);

  useEffect(() => { load(); }, [load]);

  async function restorePost(id) {
    if (!window.confirm('Restore this post to the live forum?')) return;
    const res = await apiFetch(`/admin/recycle-bin/posts/${id}/restore`, { method: 'POST' });
    if (res.ok) { showToast?.('Post restored'); load(); }
    else { showToast?.('Restore failed'); }
  }

  async function purgePost(id) {
    if (!window.confirm('Permanently delete this post and all its content? This cannot be undone.')) return;
    const res = await apiFetch(`/admin/recycle-bin/posts/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast?.('Post purged'); load(); }
    else { showToast?.('Purge failed'); }
  }

  async function restoreComment(id) {
    const res = await apiFetch(`/admin/recycle-bin/comments/${id}/restore`, { method: 'POST' });
    if (res.ok) { showToast?.('Comment restored'); load(); }
    else { showToast?.('Restore failed'); }
  }

  async function purgeComment(id) {
    if (!window.confirm('Permanently delete this comment? This cannot be undone.')) return;
    const res = await apiFetch(`/admin/recycle-bin/comments/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast?.('Comment purged'); load(); }
    else { showToast?.('Purge failed'); }
  }

  return (
    <div className={styles.section}>
      <p className={styles.helper}>
        Soft-deleted posts and comments stay here until restored or permanently purged.
      </p>

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'posts' ? styles.tabActive : ''}`} onClick={() => setTab('posts')}>
          Posts ({posts.length})
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'comments' ? styles.tabActive : ''}`} onClick={() => setTab('comments')}>
          Comments ({comments.length})
        </button>
        <button type="button" className={styles.refresh} onClick={load} disabled={loading} aria-label="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {tab === 'posts' && (
        <div className={styles.list}>
          {loading ? <p className={styles.empty}>Loading…</p>
            : posts.length === 0 ? <p className={styles.empty}>Recycle bin is empty.</p>
            : posts.map((p) => (
              <div key={p.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardTitle}>{p.title}</span>
                    <span className={styles.cardMetaDim}>
                      in {p.category_name || '—'} · by {p.display_name || p.username || `user #${p.user_id}`}
                    </span>
                    <span className={styles.cardMetaDim}>
                      Deleted {new Date(p.deleted_at).toLocaleString()} by {p.deleted_by_display_name || p.deleted_by_username || `user #${p.deleted_by}`}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => restorePost(p.id)}>
                      <RotateCcw size={14} aria-hidden="true" /><span>Restore</span>
                    </button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => purgePost(p.id)}>
                      <Trash2 size={14} aria-hidden="true" /><span>Purge</span>
                    </button>
                  </div>
                </div>
                <div className={styles.cardBody}>{p.content?.slice(0, 280)}{p.content?.length > 280 ? '…' : ''}</div>
              </div>
            ))}
        </div>
      )}

      {tab === 'comments' && (
        <div className={styles.list}>
          {loading ? <p className={styles.empty}>Loading…</p>
            : comments.length === 0 ? <p className={styles.empty}>Recycle bin is empty.</p>
            : comments.map((c) => (
              <div key={c.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardTitle}>
                      Reply on <Link to={`/forum/post/${c.post_id}`} className={styles.cardLink}>{c.post_title || `post #${c.post_id}`}</Link>
                    </span>
                    <span className={styles.cardMetaDim}>
                      by {c.display_name || c.username || `user #${c.user_id}`}
                    </span>
                    <span className={styles.cardMetaDim}>
                      Deleted {new Date(c.deleted_at).toLocaleString()} by {c.deleted_by_display_name || c.deleted_by_username || `user #${c.deleted_by}`}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => restoreComment(c.id)}>
                      <RotateCcw size={14} aria-hidden="true" /><span>Restore</span>
                    </button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => purgeComment(c.id)}>
                      <Trash2 size={14} aria-hidden="true" /><span>Purge</span>
                    </button>
                  </div>
                </div>
                <div className={styles.cardBody}>{c.content?.slice(0, 280)}{c.content?.length > 280 ? '…' : ''}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
