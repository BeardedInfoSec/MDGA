import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { timeAgo } from '../../utils/helpers';
import styles from './NotificationBell.module.css';

const POLL_MS = 30 * 1000;

// Bell icon + dropdown for in-app notifications. Two delivery paths:
//   1. SSE stream (/api/notifications/stream?ticket=...) — server pushes
//      new notifications as they're inserted, so mentions and broadcasts
//      land immediately. The 'notification' event handler bumps the
//      unread counter and refreshes the list if the dropdown is open.
//   2. 30s polling fallback — covers SSE outages (proxy timeouts,
//      network blips, tab in the background where the stream got
//      paused). Cheap; just a count endpoint.
// The dropdown lazy-loads the full list the first time it opens, and
// re-fetches each time it re-opens.
export default function NotificationBell() {
  const { isLoggedIn, apiFetch, token } = useAuth();
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

  // Poll unread count — fallback / heartbeat. The SSE stream below is
  // what makes new notifications appear in real time; this poll catches
  // anything missed (proxy hiccups, background tabs that paused the
  // stream, etc.).
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    fetchCount();
    const t = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(t);
  }, [isLoggedIn, fetchCount]);

  // SSE: real-time push from the server. New 'notification' events bump
  // the unread count and refresh the list if the dropdown is open. The
  // browser auto-reconnects on a dropped EventSource.
  useEffect(() => {
    if (!isLoggedIn || !token || typeof window === 'undefined' || !('EventSource' in window)) {
      return undefined;
    }
    let es = null;
    let closed = false;
    let reconnectTimer = null;

    // Mint a short-lived single-use ticket (header-authenticated), then open
    // the stream with it. The JWT is never placed in the URL. EventSource
    // can't carry headers, so on disconnect we re-mint and reconnect ourselves
    // (a ticket is single-use, so the browser's built-in retry can't reuse it).
    const connect = async () => {
      if (closed) return;
      try {
        const res = await apiFetch('/notifications/stream-ticket', { method: 'POST' });
        if (!res.ok) throw new Error('ticket failed');
        const { ticket } = await res.json();
        if (closed || !ticket) return;
        es = new EventSource(`/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`);
        es.addEventListener('notification', () => {
          setUnread((u) => u + 1);
          setOpen((wasOpen) => { if (wasOpen) fetchList(); return wasOpen; });
        });
        es.onerror = () => {
          // Stream dropped — close and reconnect with a fresh ticket after a
          // short backoff. The 30s poll keeps the count honest meanwhile.
          if (closed) return;
          try { es.close(); } catch { /* noop */ }
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {
        if (!closed) { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 10000); }
      }
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (es) { try { es.close(); } catch { /* noop */ } }
    };
  }, [isLoggedIn, token, apiFetch, fetchList]);

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
      // Optimistic UI: decrement the badge AND update this row's
      // read_at so when the dropdown reopens it visually shows as
      // read (no gold tint, no red dot) instead of waiting for the
      // next fetchList to overwrite it.
      const nowIso = new Date().toISOString();
      setUnread((u) => Math.max(0, u - 1));
      setItems((arr) => arr.map((x) => x.id === n.id ? { ...x, read_at: nowIso } : x));
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
