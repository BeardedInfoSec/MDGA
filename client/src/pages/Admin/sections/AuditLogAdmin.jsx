import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Filter, X } from 'lucide-react';
import styles from './AuditLogAdmin.module.css';

const PAGE_SIZE = 50;

function fmtMeta(metadata) {
  if (!metadata) return null;
  try {
    const obj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(metadata);
  }
}

export default function AuditLogAdmin({ apiFetch, showToast }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (typeFilter) params.set('type', typeFilter);
      const res = await apiFetch(`/admin/audit-log?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      } else {
        showToast?.('Failed to load audit log');
      }
    } catch {
      showToast?.('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, typeFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.section}>
      <p className={styles.helper}>
        Every action recorded by the admin panel — moderation, locks, character
        edits, recycle-bin operations. Filter by action type prefix
        (e.g. <code>post.</code>, <code>user.lock</code>).
      </p>

      <div className={styles.toolbar}>
        <div className={styles.filterWrap}>
          <Filter size={14} aria-hidden="true" className={styles.filterIcon} />
          <input
            type="text"
            placeholder="action_type prefix…"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className={styles.filterInput}
          />
          {typeFilter && (
            <button type="button" className={styles.filterClear} onClick={() => { setTypeFilter(''); setPage(1); }} aria-label="Clear filter">
              <X size={12} />
            </button>
          )}
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" />
          <span>{loading ? 'Loading…' : 'Refresh'}</span>
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>No audit entries match this filter.</td></tr>
            ) : entries.map((e) => {
              const isExpanded = expandedId === e.id;
              const meta = fmtMeta(e.metadata);
              return (
                <>
                  <tr key={e.id} onClick={() => setExpandedId(isExpanded ? null : e.id)} className={`${styles.row} ${isExpanded ? styles.rowExpanded : ''}`}>
                    <td className={styles.timeCell}>{new Date(e.created_at).toLocaleString()}</td>
                    <td>{e.admin_display_name || e.admin_username || `#${e.admin_user_id}`}</td>
                    <td><code className={styles.actionCode}>{e.action_type}</code></td>
                    <td className={styles.muted}>{e.target_type ? `${e.target_type} #${e.target_id}` : '—'}</td>
                    <td>{e.summary || ''}</td>
                  </tr>
                  {isExpanded && meta && (
                    <tr key={`${e.id}-meta`}>
                      <td colSpan={5} className={styles.metaRow}>
                        <pre className={styles.metaPre}>{meta}</pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span className={styles.pageInfo}>Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}
