import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { timeAgo } from '../../utils/helpers';
import styles from './NotificationBell.module.css';

const POLL_MS = 30 * 1000;

// Bell icon + dropdown for in-app notifications. Polls the unread-count
// endpoint every 30s so the badge stays current without us standing up a
// websocket layer just for this. The dropdown lazy-loads the full list
// the first time it opens, and re-loads every time it re-opens.
export default function NotificationBell() {
  const { isLoggedIn, apiFetch } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);

  const fetchCount = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await apiFetch('/notifications/unread-count');
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unread || 0);
    } catch { /* network blip — try again next tick */ }
  }, [isLoggedIn, apiFetch]);

  const fetchList = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await apiFetch('/notifications?limit=30');
      if (!res.ok) { setItems([]); return; }
      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, apiFetch]);

  // Poll unread count
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(t);
  }, [isLoggedIn, fetchCount]);

  // Re-fetch list every time the dropdown opens
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // Click outside closes
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleItemClick(n) {
    setOpen(false);
    if (n.read_at == null) {
      // Mark read in DB (fire and forget — the navigation matters more)
      apiFetch(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null);
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.link_url) navigate(n.link_url);
  }

  async function handleMarkAllRead() {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setUnread(0);
      setItems((arr) => arr.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch { /* no-op */ }
  }

  if (!isLoggedIn) return null;

  return (
    <li className={styles.bellWrap} ref={rootRef}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div className={styles.dropdown} role="dialog">
          <div className={styles.head}>
            <span className={styles.title}>Notifications</span>
            {unread > 0 && (
              <button type="button" className={styles.markAll} onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className={styles.list}>
            {loading && items.length === 0 && (
              <div className={styles.empty}>Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className={styles.empty}>No notifications yet.</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`${styles.item} ${n.read_at == null ? styles.itemUnread : ''}`}
                onClick={() => handleItemClick(n)}
              >
                {n.actor_avatar_url ? (
                  <img src={n.actor_avatar_url} alt="" className={styles.avatar} />
                ) : (
                  <span className={styles.avatarFallback}>{(n.actor_display_name || n.actor_username || '?')[0]?.toUpperCase()}</span>
                )}
                <div className={styles.body}>
                  <div className={styles.itemTitle}>{n.title}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemType}>{labelForType(n.type)}</span>
                    <span className={styles.itemTime}>{timeAgo(n.created_at)}</span>
                  </div>
                </div>
                {n.read_at == null && <span className={styles.dot} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function labelForType(t) {
  switch (t) {
    case 'mention': return 'Mention';
    case 'reply':   return 'Reply';
    case 'event':   return 'Event';
    case 'giveaway_kickoff': return 'Giveaway';
    default: return t;
  }
}
