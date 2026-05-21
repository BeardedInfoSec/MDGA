import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './NotificationPrefs.module.css';

const TYPES = [
  { key: 'mention', label: 'Mentions', hint: 'Someone @-mentions you in a post or comment' },
  { key: 'reply', label: 'Replies on my posts', hint: 'Someone comments on a post you authored' },
  { key: 'event', label: 'New events', hint: 'An officer creates a new event' },
  { key: 'giveaway_kickoff', label: 'Giveaway drops', hint: 'A scheduled giveaway goes live' },
];

// Inline notification preferences panel for the profile page (own-profile
// only). Reads/writes /api/notifications/prefs — single JSON column on
// users.notification_prefs (migration-068). Defaults are everything on.
export default function NotificationPrefs() {
  const { apiFetch } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/notifications/prefs');
        if (res.ok) {
          const data = await res.json();
          setPrefs(data.prefs || {});
        }
      } catch {
        setPrefs({});
      }
    })();
  }, [apiFetch]);

  async function toggle(key) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setStatus('');
    try {
      const res = await apiFetch('/notifications/prefs', {
        method: 'PUT',
        body: JSON.stringify({ prefs: next }),
      });
      if (!res.ok) { setStatus('Failed to save'); return; }
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1500);
    } catch {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>Notification Preferences</span>
        {status && <span className={styles.status}>{status}</span>}
      </div>
      <ul className={styles.list}>
        {TYPES.map((t) => {
          const on = prefs[t.key] !== false;
          return (
            <li key={t.key} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{t.label}</span>
                <span className={styles.rowHint}>{t.hint}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={saving}
                className={`${styles.switch} ${on ? styles.switchOn : ''}`}
                onClick={() => toggle(t.key)}
              >
                <span className={styles.switchThumb} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
