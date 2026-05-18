import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Users, LogIn, MessageSquare, Calendar, Sword, Hash } from 'lucide-react';
import styles from './AdminStats.module.css';
import { postUrlFromParts } from '../../../utils/forumUrls';

function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

export default function AdminStats({ apiFetch, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/stats');
      if (res.ok) setData(await res.json());
      else showToast?.('Failed to load stats');
    } catch {
      showToast?.('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <p className={styles.loading}>Loading stats…</p>;
  if (!data) return <p className={styles.loading}>No data.</p>;

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <p className={styles.helper}>
          Live snapshot from the database. Pageviews / anonymous traffic aren't tracked yet —
          numbers below cover registered accounts, logins, and content activity.
        </p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" />
          <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {/* ── Top tiles ── */}
      <div className={styles.tilesGroup}>
        <h3 className={styles.groupTitle}><Users size={14} /> Accounts</h3>
        <div className={styles.tiles}>
          <Tile label="Total accounts" value={fmt(data.accounts.total)} />
          <Tile label="Signups today" value={fmt(data.accounts.signupsToday)} accent />
          <Tile label="Signups (7 days)" value={fmt(data.accounts.signups7d)} />
          <Tile label="Active status" value={fmt(data.accounts.byStatus.active || 0)} />
        </div>
      </div>

      <div className={styles.tilesGroup}>
        <h3 className={styles.groupTitle}><LogIn size={14} /> Logins</h3>
        <div className={styles.tiles}>
          <Tile label="Logins today" value={fmt(data.logins.today)} accent />
          <Tile label="Logins (7 days)" value={fmt(data.logins.last7d)} />
          <Tile label="Active users (7d)" value={fmt(data.logins.activeUsers7d)} />
        </div>
      </div>

      <div className={styles.tilesGroup}>
        <h3 className={styles.groupTitle}><MessageSquare size={14} /> Forum</h3>
        <div className={styles.tiles}>
          <Tile label="Total posts" value={fmt(data.forum.posts)} />
          <Tile label="Total replies" value={fmt(data.forum.comments)} />
          <Tile label="Posts today" value={fmt(data.forum.postsToday)} accent />
        </div>
      </div>

      <div className={styles.tilesGroup}>
        <h3 className={styles.groupTitle}><Calendar size={14} /> Events</h3>
        <div className={styles.tiles}>
          <Tile label="Total events" value={fmt(data.events.total)} />
          <Tile label="Upcoming" value={fmt(data.events.upcoming)} />
          <Tile label="RSVPs going" value={fmt(data.events.rsvpsGoing)} accent />
          <Tile label="RSVPs interested" value={fmt(data.events.rsvpsMaybe)} />
        </div>
      </div>

      <div className={styles.tilesGroup}>
        <h3 className={styles.groupTitle}><Sword size={14} /> Characters &amp; Discord</h3>
        <div className={styles.tiles}>
          <Tile label="Linked WoW characters" value={fmt(data.characters.total)} />
          <Tile label="Members with characters" value={fmt(data.characters.linkedUsers)} />
          <Tile label="Discord server members" value={fmt(data.discord.membersInGuild)} />
        </div>
      </div>

      {/* ── Top posters ── */}
      {data.forum.topPosters.length > 0 && (
        <div className={styles.tilesGroup}>
          <h3 className={styles.groupTitle}><Hash size={14} /> Top posters</h3>
          <ul className={styles.list}>
            {data.forum.topPosters.map((u) => (
              <li key={u.id} className={styles.listRow}>
                <Link to={`/profile?id=${u.id}`} className={styles.listLink}>
                  <span className={`rank-badge rank-badge--${u.rank}`}>
                    {u.display_rank || u.rank}
                  </span>
                  <span className={styles.listName}>{u.display_name || u.username}</span>
                </Link>
                <span className={styles.listValue}>{fmt(u.post_count)} posts</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Recent activity columns ── */}
      <div className={styles.activityCols}>
        <ActivityCol title="Recent signups" rows={data.recent.signups.map((u) => ({
          key: `s-${u.id}`,
          primary: u.display_name || u.username,
          meta: `joined ${timeAgo(u.created_at)} · ${u.status}`,
          link: `/profile?id=${u.id}`,
        }))} empty="No new accounts." />

        <ActivityCol title="Recent logins" rows={data.recent.logins.map((u) => ({
          key: `l-${u.id}`,
          primary: u.display_name || u.username,
          meta: `logged in ${timeAgo(u.last_login_at)}`,
          link: `/profile?id=${u.id}`,
        }))} empty="No logins yet." />

        <ActivityCol title="Latest posts" rows={data.recent.posts.map((p) => ({
          key: `p-${p.id}`,
          primary: p.title,
          meta: `${p.display_rank || p.display_name || p.username} in ${p.category_name} · ${timeAgo(p.created_at)}`,
          link: postUrlFromParts(p.id, p.title),
        }))} empty="No posts yet." />
      </div>

      <p className={styles.generatedAt}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}

function Tile({ label, value, accent }) {
  return (
    <div className={`${styles.tile} ${accent ? styles.tileAccent : ''}`}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

function ActivityCol({ title, rows, empty }) {
  return (
    <div className={styles.activityCol}>
      <h4 className={styles.activityTitle}>{title}</h4>
      {rows.length === 0 ? (
        <p className={styles.activityEmpty}>{empty}</p>
      ) : (
        <ul className={styles.activityList}>
          {rows.map((r) => (
            <li key={r.key} className={styles.activityRow}>
              <Link to={r.link} className={styles.activityPrimary}>{r.primary}</Link>
              <span className={styles.activityMeta}>{r.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
