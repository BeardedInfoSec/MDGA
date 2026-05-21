import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './OfficerToolkitAuth.module.css';

const POLL_MS = 1000;

// Standalone page where an officer generates a one-time code to paste
// into the MDGA Officer Toolkit (Tauri desktop app). Officer signs in
// here in their browser, clicks Generate, and reads the 8-char code.
// The code is good for 5 minutes; once exchanged it's destroyed.
//
// Lives at /officer-toolkit/auth. Auth-gated to officer+ (rank check
// matches the server's toolkit-token-issue endpoint).
export default function OfficerToolkitAuth() {
  useDocumentTitle('Officer Toolkit | MDGA');
  const { isLoggedIn, user, apiFetch, isOfficer } = useAuth();
  const [code, setCode] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const canIssue = isLoggedIn && isOfficer && isOfficer();

  async function issueCode() {
    if (issuing) return;
    setIssuing(true);
    setError('');
    setCopied(false);
    try {
      const res = await apiFetch('/auth/toolkit-token-issue', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to issue code');
        setCode(null);
        return;
      }
      setCode(data.code);
      setSecondsLeft(data.expiresInSeconds || 300);
    } catch (err) {
      setError('Network error issuing code');
    } finally {
      setIssuing(false);
    }
  }

  // Countdown ticker for the active code
  useEffect(() => {
    if (!code || secondsLeft <= 0) return undefined;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setCode(null); return 0; }
        return s - 1;
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [code, secondsLeft]);

  function copy() {
    if (!code || !navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!isLoggedIn) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Officer Toolkit</h1>
        <p className={styles.subtitle}>Sign in to generate a toolkit code.</p>
      </div>
    );
  }

  if (!canIssue) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Officer Toolkit</h1>
        <p className={styles.subtitle}>The toolkit is officer-only. If you're an officer and seeing this, your account rank may need updating.</p>
      </div>
    );
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Officer Toolkit</span>
        <h1 className={styles.title}>Generate sign-in code</h1>
        <p className={styles.subtitle}>
          Welcome, <strong>{user?.display_name || user?.username}</strong>. Generate
          an 8-character code below and paste it into the MDGA Officer Toolkit desktop app.
        </p>
      </header>

      <div className={styles.card}>
        {!code && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={issueCode}
            disabled={issuing}
          >
            {issuing ? 'Generating…' : 'Generate code'}
          </button>
        )}

        {code && (
          <>
            <div className={styles.codeBlock} role="text" aria-live="polite">
              <span className={styles.codeText}>{code}</span>
              <button
                type="button"
                className={`btn btn--secondary btn--sm ${styles.copyBtn}`}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className={styles.expiry}>
              Expires in <strong>{mm}:{ss}</strong>. Single use.
            </p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={issueCode} disabled={issuing}>
              {issuing ? 'Generating…' : 'Regenerate'}
            </button>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <section className={styles.instructions}>
        <h2 className={styles.instructionsTitle}>How to use this</h2>
        <ol className={styles.steps}>
          <li>Open the MDGA Officer Toolkit on your computer.</li>
          <li>Click <em>Sign in with Discord</em>.</li>
          <li>The toolkit opens this page in your browser; click <em>Generate code</em> above.</li>
          <li>Copy the 8-character code and paste it into the toolkit.</li>
          <li>You&apos;re signed in for 7 days. The toolkit refreshes automatically before that expires.</li>
        </ol>
        <p className={styles.fineprint}>
          The code is one-time-use and expires after 5 minutes. If you fumble it, just regenerate.
          The underlying token is a 7-day JWT scoped specifically to the toolkit.
        </p>
      </section>
    </div>
  );
}
