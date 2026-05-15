import { useState } from 'react';
import { Copy, RefreshCw, Download, ShieldAlert } from 'lucide-react';
import styles from './AuditToolAdmin.module.css';

/**
 * AuditToolAdmin
 *
 * Generates a 90-day JWT for the standalone desktop audit tool
 * (mdga-audit.exe). Lives in the admin panel under Guild → Audit Tool
 * (gated by admin.view_panel server-side, same as before).
 *
 * Token is sensitive — surface it visibly so officers know to copy
 * immediately, and warn that regenerating invalidates the previous one.
 */
export default function AuditToolAdmin({ apiFetch, showToast }) {
  const [token, setToken] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError('');
    setCopied(false);
    try {
      const res = await apiFetch('/auth/companion-token', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setToken(data.token);
      setIssuedAt(data.issuedAt);
      showToast?.('Token generated — copy it now.');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Couldn’t copy — select the token manually and Ctrl+C.');
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.helper}>
        The desktop audit tool (<code>mdga-audit.exe</code>) needs a 90-day token to
        cross-check guild rosters against Discord and the website database. Generate
        one here, paste it when the tool prompts. Treat the token like a password —
        anyone with it can run audits against the live data.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={generate}
          disabled={generating}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>{generating ? 'Generating…' : (token ? 'Regenerate token' : 'Generate token')}</span>
        </button>
        <a
          href="/wow_addon/MDGA-companion.zip"
          download
          className="btn btn--secondary btn--sm"
        >
          <Download size={14} aria-hidden="true" />
          <span>Download audit tool</span>
        </a>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <ShieldAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {token && (
        <div className={styles.tokenCard}>
          <div className={styles.tokenHeader}>
            <span className={styles.tokenLabel}>Token</span>
            <span className={styles.tokenMeta}>
              Issued {issuedAt ? new Date(issuedAt).toLocaleString() : '—'} · expires in 90 days
            </span>
          </div>
          <textarea
            readOnly
            value={token}
            onFocus={(e) => e.target.select()}
            rows={4}
            className={styles.tokenTextarea}
          />
          <div className={styles.tokenActions}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={copy}>
              <Copy size={14} aria-hidden="true" />
              <span>{copied ? 'Copied!' : 'Copy token'}</span>
            </button>
            <span className={styles.tokenWarning}>
              Regenerating will invalidate any previous token still in circulation.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
