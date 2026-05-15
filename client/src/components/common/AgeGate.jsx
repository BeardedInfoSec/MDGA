import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AgeGate.module.css';

const STORAGE_KEY = 'mdga.ageAck.v1';

function loadAcked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveAcked(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch {}
}

// Per-category 18+ acknowledgement modal. Shows once per category until the
// user confirms; remembered in localStorage. This is a consent UX, not access
// control — server doesn't enforce it.
export default function AgeGate({ categoryId, categoryName, active, fallbackPath = '/forum' }) {
  const navigate = useNavigate();
  const [needsAck, setNeedsAck] = useState(false);

  useEffect(() => {
    if (!active || !categoryId) {
      setNeedsAck(false);
      return;
    }
    const acked = loadAcked();
    setNeedsAck(!acked.has(String(categoryId)));
  }, [categoryId, active]);

  function confirm() {
    const acked = loadAcked();
    acked.add(String(categoryId));
    saveAcked(acked);
    setNeedsAck(false);
  }

  function cancel() {
    navigate(fallbackPath, { replace: true });
  }

  if (!active || !needsAck) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className={styles.card}>
        <h2 id="age-gate-title" className={styles.title}>Sensitive content</h2>
        <p className={styles.body}>
          <strong>{categoryName || 'This category'}</strong> may contain content
          intended for adult audiences — strong language, mature themes, or other
          material some readers may not want to see.
        </p>
        <p className={styles.bodyMuted}>
          By continuing you confirm you are 18 or older and choose to view it.
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={cancel}>
            Take me back
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={confirm}>
            I&apos;m 18+, continue
          </button>
        </div>
      </div>
    </div>
  );
}
