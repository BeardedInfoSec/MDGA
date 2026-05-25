import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './NotificationPrefs.module.css';

const DURATION_OPTIONS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
];

// AFK notice panel — own-profile only. Lets a member declare an upcoming
// absence so officers running roster audits have context. Stored on
// users.afk_until / afk_reason / afk_set_at (migration-069). Clearing the
// notice sets all three back to NULL.
export default function AFKNotice({ initialUntil, initialReason }) {
  const { apiFetch } = useAuth();
  const [until, setUntil] = useState(initialUntil || null);
  const [reason, setReason] = useState(initialReason || '');
  const [days, setDays] = useState(30);
  const [draftReason, setDraftReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setUntil(initialUntil || null);
    setReason(initialReason || '');
  }, [initialUntil, initialReason]);

  async function save() {
    setSaving(true);
    setStatus('');
    try {
      const res = await apiFetch('/profile/afk', {
        method: 'PUT',
        body: JSON.stringify({ days, reason: draftReason.trim().slice(0, 255) }),
      });
      if (!res.ok) { setStatus('Failed to save'); return; }
      const data = await res.json();
      setUntil(data.afk_until);
      setReason(data.afk_reason || '');
      setDraftReason('');
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1500);
    } catch {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setStatus('');
    try {
      const res = await apiFetch('/profile/afk', { method: 'DELETE' });
      if (!res.ok) { setStatus('Failed to clear'); return; }
      setUntil(null);
      setReason('');
      setStatus('Cleared');
      setTimeout(() => setStatus(''), 1500);
    } catch {
      setStatus('Failed to clear');
    } finally {
      setSaving(false);
    }
  }

  // String compare against UTC-today ('YYYY-MM-DD'). The backend stores
  // afk_until in UTC via DateTime.utc().plus({days}), and the API returns
  // it as a date-only string, so a direct lexicographic compare is correct
  // and avoids the new-Date('YYYY-MM-DD') UTC-vs-local-midnight ambiguity.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const untilStr = until ? String(until).slice(0, 10) : null;
  const isActive = untilStr && untilStr >= todayUtc;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>AFK Notice</span>
        {status && <span className={styles.status}>{status}</span>}
      </div>
      {isActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
            <strong>Active until:</strong> {until}
          </div>
          {reason && (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
              &ldquo;{reason}&rdquo;
            </div>
          )}
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            This is a hint to officers during roster audits — it does not guarantee your character won&apos;t be removed.
          </div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={saving} onClick={clear}>
            Clear AFK notice
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)' }}>Duration</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ padding: '6px 10px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)' }}
            >
              {DURATION_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-secondary)' }}>Reason (optional)</span>
            <textarea
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              maxLength={255}
              rows={2}
              placeholder="E.g., exam week, travel, deployment…"
              style={{ padding: '6px 10px', background: 'var(--color-black)', color: 'var(--color-text-primary)', border: '1px solid var(--color-gray-700)', borderRadius: 'var(--border-radius-sm)', fontFamily: 'var(--font-ui)' }}
            />
          </label>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            This is a hint to officers during roster audits. It does <strong>not</strong> guarantee your character won&apos;t be removed.
          </div>
          <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Set AFK notice'}
          </button>
        </div>
      )}
    </div>
  );
}
