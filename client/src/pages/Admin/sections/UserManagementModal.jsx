import { useCallback, useEffect, useState } from 'react';
import { X, Star, StarOff, Trash2, Lock, Unlock } from 'lucide-react';
import styles from './UserManagementModal.module.css';

/**
 * UserManagementModal — opens from PeopleMembers row "Manage" button.
 * Combines character editing and account lock into a single tabbed modal so
 * admins can do all per-user maintenance from one place. The rank/role
 * override stays on the underlying PeopleMembers row.
 */
export default function UserManagementModal({ user, apiFetch, showToast, onClose, onChanged }) {
  const [tab, setTab] = useState('characters');
  if (!user) return null;
  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerInfo}>
            <span className={styles.eyebrow}>Manage member</span>
            <h2 className={styles.title}>{user.display_name || user.username || `User #${user.id}`}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${tab === 'characters' ? styles.tabActive : ''}`} onClick={() => setTab('characters')}>
            Characters
          </button>
          <button type="button" className={`${styles.tab} ${tab === 'lock' ? styles.tabActive : ''}`} onClick={() => setTab('lock')}>
            Account Lock
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'characters' && <CharacterEditor user={user} apiFetch={apiFetch} showToast={showToast} onChanged={onChanged} />}
          {tab === 'lock' && <AccountLockEditor user={user} apiFetch={apiFetch} showToast={showToast} onChanged={onChanged} />}
        </div>
      </div>
    </div>
  );
}

function CharacterEditor({ user, apiFetch, showToast, onChanged }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/users/${user.id}/characters`);
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters || []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, user.id]);

  useEffect(() => { load(); }, [load]);

  async function setMain(charId) {
    const res = await apiFetch(`/admin/users/${user.id}/characters/${charId}/main`, { method: 'POST' });
    if (res.ok) { showToast?.('Main character updated'); load(); onChanged?.(); }
    else { showToast?.('Failed to update main'); }
  }

  async function removeChar(charId, name) {
    if (!window.confirm(`Remove ${name} from this account?`)) return;
    const res = await apiFetch(`/admin/users/${user.id}/characters/${charId}`, { method: 'DELETE' });
    if (res.ok) { showToast?.('Character removed'); load(); onChanged?.(); }
    else { showToast?.('Failed to remove character'); }
  }

  if (loading) return <p className={styles.bodyMuted}>Loading characters…</p>;
  if (characters.length === 0) return <p className={styles.bodyMuted}>This member has no linked characters.</p>;

  return (
    <ul className={styles.charList}>
      {characters.map((c) => (
        <li key={c.id} className={`${styles.charRow} ${c.is_main ? styles.charRowMain : ''}`}>
          <div className={styles.charInfo}>
            <span className={styles.charName}>{c.character_name}</span>
            <span className={styles.charMeta}>
              {c.realm || c.realm_slug} · {c.class || '—'}{c.spec ? ` (${c.spec})` : ''} · lvl {c.level || '?'}
              {c.is_main ? <span className={styles.mainTag}>Main</span> : null}
            </span>
          </div>
          <div className={styles.charActions}>
            {!c.is_main && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setMain(c.id)}>
                <Star size={14} aria-hidden="true" /><span>Set main</span>
              </button>
            )}
            <button type="button" className="btn btn--danger btn--sm" onClick={() => removeChar(c.id, c.character_name)}>
              <Trash2 size={14} aria-hidden="true" /><span>Remove</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccountLockEditor({ user, apiFetch, showToast, onChanged }) {
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isLocked = !!user.account_locked_at;

  async function lock() {
    setBusy(true);
    try {
      const body = { reason };
      if (until) body.until = new Date(until).toISOString();
      const res = await apiFetch(`/admin/users/${user.id}/lock`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast?.('Account locked');
        onChanged?.();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast?.(data.error || 'Failed to lock');
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/users/${user.id}/unlock`, { method: 'POST' });
      if (res.ok) {
        showToast?.('Account unlocked');
        onChanged?.();
      } else {
        showToast?.('Failed to unlock');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.lockForm}>
      {isLocked ? (
        <div className={styles.lockedBanner}>
          <Lock size={14} aria-hidden="true" />
          <div>
            <div className={styles.lockedHeading}>Account is locked</div>
            <div className={styles.lockedMeta}>
              {user.account_locked_until
                ? `Until ${new Date(user.account_locked_until).toLocaleString()}`
                : 'Indefinite — until manually unlocked.'}
            </div>
            {user.account_locked_reason && <div className={styles.lockedReason}>Reason: {user.account_locked_reason}</div>}
          </div>
        </div>
      ) : (
        <p className={styles.bodyMuted}>This account is not locked.</p>
      )}

      {!isLocked && (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Lock until (optional — leave blank for indefinite)</span>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={styles.fieldInput}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Visible to the locked user when they try to log in."
              className={styles.fieldTextarea}
            />
          </label>
        </>
      )}

      <div className={styles.lockActions}>
        {isLocked ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={unlock} disabled={busy}>
            <Unlock size={14} aria-hidden="true" /><span>{busy ? 'Unlocking…' : 'Unlock account'}</span>
          </button>
        ) : (
          <button type="button" className="btn btn--danger btn--sm" onClick={lock} disabled={busy}>
            <Lock size={14} aria-hidden="true" /><span>{busy ? 'Locking…' : 'Lock account'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
