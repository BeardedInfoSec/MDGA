import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  Unlock,
  Search,
  Mail,
  Settings,
  User as UserIcon,
  ShieldOff,
  Sliders,
} from 'lucide-react';
import UserManagementModal from './UserManagementModal';
import styles from './PeopleMembers.module.css';

/**
 * PeopleMembers — admin override panel.
 *
 * Ranks and permission roles are normally driven by Discord (via the role
 * sync service). This page is the manual-override surface: search for a
 * specific member, set their rank/roles, and lock the change so the next
 * Discord sync pass can't undo it.
 *
 * Intentional choices vs the legacy "list everyone" view:
 *  - No pagination, no auto-load. The page is empty until the admin
 *    searches — this is an override tool, not a directory.
 *  - Search debounced 250ms; minimum 2 chars to fire (avoids 2500-row
 *    scans on every keystroke).
 *  - Results capped at 25 server-side via &page_size=25.
 *  - Lock state is the visible signal of "this user is overridden" —
 *    locked rows show a clear amber chip so admins can spot existing
 *    overrides at a glance.
 */

const RANK_OPTIONS = ['recruit', 'member', 'veteran', 'officer', 'guildmaster'];
const RESULT_LIMIT = 25;
const MIN_SEARCH_LEN = 2;

export default function PeopleMembers({ apiFetch, showToast, currentUser, onManageRoles }) {
  const [users, setUsers] = useState([]);
  const [overridden, setOverridden] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [overriddenLoading, setOverriddenLoading] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [manageUser, setManageUser] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadOverridden = useCallback(async () => {
    setOverriddenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('locked_only', '1');
      params.set('page_size', '200');
      params.set('include', 'roles');
      const res = await apiFetch(`/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOverridden(Array.isArray(data.users) ? data.users : []);
      } else {
        setOverridden([]);
      }
    } catch {
      setOverridden([]);
    } finally {
      setOverriddenLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadOverridden(); }, [loadOverridden]);

  const loadUsers = useCallback(async () => {
    if (debouncedSearch.length < MIN_SEARCH_LEN) {
      setUsers([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      params.set('search', debouncedSearch);
      params.set('page', '1');
      params.set('page_size', String(RESULT_LIMIT));
      params.set('include', 'roles');
      const res = await apiFetch(`/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data.users) ? data.users : []);
      } else {
        setUsers([]);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, debouncedSearch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Refresh both lists after any mutation so the overridden section stays
  // in sync (e.g., locking a user from search results immediately makes
  // them appear up top; clearing makes them disappear).
  function refreshAll() {
    loadUsers();
    loadOverridden();
  }

  async function changeRank(userId, newRank) {
    try {
      const res = await apiFetch(`/users/${userId}/rank`, {
        method: 'PUT',
        body: JSON.stringify({ rank: newRank }),
      });
      if (res.ok) {
        showToast('Rank updated and locked');
        refreshAll();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to update rank');
      }
    } catch {
      showToast('Failed to update rank');
    }
  }

  async function toggleRankLock(userId, locked) {
    try {
      const res = await apiFetch(`/users/${userId}/rank-lock`, {
        method: 'PUT',
        body: JSON.stringify({ locked }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.message || (locked ? 'Override locked' : 'Override cleared — Discord sync will resume'));
        refreshAll();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to toggle override');
      }
    } catch {
      showToast('Failed to toggle override');
    }
  }

  async function resendInvite(userId) {
    try {
      const res = await apiFetch(`/users/${userId}/resend-invite`, { method: 'POST' });
      if (res.ok) {
        showToast('Invite email sent');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to send invite email');
      }
    } catch {
      showToast('Failed to send invite email');
    }
  }

  function openManageRoles(u) {
    if (typeof onManageRoles === 'function') {
      onManageRoles(u);
    } else {
      showToast('Manage Roles is unavailable.');
    }
  }

  // Single row renderer — used by both the "Currently overridden" section
  // and the search-results section so they stay visually identical.
  function renderRow(u) {
    const isSelf = currentUser && u.id === currentUser.id;
    const displayName = u.display_name || u.username;
    return (
      <div key={u.id} className={styles.row} role="listitem">
        <div className={styles.identity}>
          <Avatar url={u.avatar_url} alt={displayName} />
          <div className={styles.nameBlock}>
            <Link to={`/profile?id=${u.id}`} className={styles.displayName}>
              {displayName}
            </Link>
            <span className={styles.username}>@{u.username}</span>
          </div>
          {u.rank_locked ? (
            <span className={styles.overrideBadge} title="This member has a manual override; Discord sync will not change their rank.">
              <Lock size={12} aria-hidden="true" />
              <span>Overridden</span>
            </span>
          ) : (
            <span className={styles.syncBadge} title="Synced from Discord automatically.">
              Auto-synced
            </span>
          )}
        </div>

        <div className={styles.rolesCell}>
          <span className={styles.cellLabel}>Permission roles</span>
          {u.roles && u.roles.length > 0 ? (
            <div className={styles.roleChips}>
              {u.roles.map((r) => (
                <span key={r.id} className={styles.roleChip} title={`@${r.name}`}>
                  <span
                    className={styles.roleDot}
                    style={r.color ? { background: r.color } : undefined}
                    aria-hidden="true"
                  />
                  {r.display_name}
                </span>
              ))}
            </div>
          ) : (
            <span className={styles.roleChipsEmpty}>None assigned</span>
          )}
        </div>

        <div className={styles.rankCell}>
          <span className={styles.cellLabel}>Guild rank</span>
          <div className={styles.rankCellControls}>
            <select
              className={styles.rankSelect}
              value={u.rank}
              onChange={(e) => changeRank(u.id, e.target.value)}
              disabled={isSelf}
              title={isSelf ? "You can't change your own rank" : 'Set rank (auto-locks the override)'}
              aria-label={`Rank for ${displayName}`}
            >
              {RANK_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              className={`${styles.lockButton} ${u.rank_locked ? styles.lockButtonLocked : ''}`}
              onClick={() => toggleRankLock(u.id, !u.rank_locked)}
              title={
                u.rank_locked
                  ? 'Override is active. Click to clear and resume Discord sync.'
                  : 'No override. Click to lock current rank against Discord sync.'
              }
              aria-label={u.rank_locked ? 'Clear override' : 'Lock current rank'}
              aria-pressed={!!u.rank_locked}
            >
              {u.rank_locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => openManageRoles(u)}
            title="Override permission roles"
          >
            <Settings size={14} aria-hidden="true" />
            <span>Roles</span>
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setManageUser(u)}
            title="Edit characters and lock account"
          >
            <Sliders size={14} aria-hidden="true" />
            <span>Manage</span>
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => resendInvite(u.id)}
            title="Resend Discord invite email"
          >
            <Mail size={14} aria-hidden="true" />
            <span>Invite</span>
          </button>
          {u.rank_locked && (
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => toggleRankLock(u.id, false)}
              title="Remove the manual override and resume Discord sync"
            >
              <ShieldOff size={14} aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <p className={styles.helper}>
        Ranks and permission roles are auto-synced from Discord. Use this page to override what
        Discord assigns to a specific member and lock the change so the bot can&apos;t undo it.
      </p>

      {/* Currently overridden — always shown so admins can audit existing
          overrides without having to remember and search for each name. */}
      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <Lock size={14} aria-hidden="true" />
          <h3 className={styles.subsectionTitle}>Currently overridden</h3>
          <span className={styles.subsectionCount}>
            {overriddenLoading ? '…' : overridden.length}
          </span>
        </div>
        {overriddenLoading ? (
          <p className={styles.loadingText}>Loading…</p>
        ) : overridden.length === 0 ? (
          <p className={styles.subsectionEmpty}>
            No active overrides. Every member&apos;s rank is currently driven by Discord.
          </p>
        ) : (
          <div className={styles.list} role="list">
            {overridden.map(renderRow)}
          </div>
        )}
      </div>

      {/* Search — find any member to start a new override. */}
      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <Search size={14} aria-hidden="true" />
          <h3 className={styles.subsectionTitle}>Find a member to override</h3>
        </div>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            className={styles.search}
            placeholder="Search by name, username, or Discord handle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search members"
          />
        </div>

        {!hasSearched ? (
          <p className={styles.subsectionEmpty}>
            Type at least {MIN_SEARCH_LEN} characters to search.
          </p>
        ) : loading ? (
          <p className={styles.loadingText}>Searching…</p>
        ) : users.length === 0 ? (
          <p className={styles.loadingText}>No members matched &ldquo;{debouncedSearch}&rdquo;.</p>
        ) : (
          <div className={styles.list} role="list">
            <p className={styles.resultsHint}>
              {users.length === RESULT_LIMIT
                ? `Showing first ${RESULT_LIMIT} matches. Refine search to narrow.`
                : `${users.length} match${users.length === 1 ? '' : 'es'}.`}
            </p>
            {users.map(renderRow)}
          </div>
        )}
      </div>

      {manageUser && (
        <UserManagementModal
          user={manageUser}
          apiFetch={apiFetch}
          showToast={showToast}
          onClose={() => setManageUser(null)}
          onChanged={() => loadOverridden()}
        />
      )}
    </div>
  );
}

function Avatar({ url, alt }) {
  if (url) {
    return <img src={url} alt={alt} className={styles.avatar} loading="lazy" />;
  }
  return (
    <div className={styles.avatarFallback} aria-hidden="true">
      <UserIcon size={16} />
    </div>
  );
}

