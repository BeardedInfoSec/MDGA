import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  FileText,
  Flag,
  ShieldAlert,
  TrendingUp,
  Activity,
  UserPlus,
  UserMinus,
  Award,
  ChevronRight,
  ShieldCheck,
  GitMerge,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { timeAgo } from '../../../utils/helpers';
import styles from './Overview.module.css';

/**
 * Overview - admin landing page.
 *
 * Renders four headline stats, a recent activity feed, and a column of
 * common admin quick actions. Self-contained; the parent admin layout is
 * responsible for routing this component into view.
 */
export default function Overview({ onNavigate }) {
  const { apiFetch } = useAuth();
  const [counts, setCounts] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Tolerant fetch: if an endpoint 404s or errors, return null so we can
  // gracefully fall back to 0 instead of breaking the whole dashboard.
  const safeFetch = useCallback(
    async (url) => {
      try {
        const res = await apiFetch(url);
        if (!res || !res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      // Pull the full federation list (all 11 guilds) so we can sum member counts
      // across the federation, not just the primary guild. Falls back to the
      // primary's count if /guild/guilds is unavailable for any reason.
      const [guildsList, summary, apps, reports, violations] = await Promise.all([
        safeFetch('/guild/guilds'),
        safeFetch('/guild/summary'),
        safeFetch('/applications?status=pending'),
        safeFetch('/forum-reports?status=open'),
        safeFetch('/forum/violations?status=open'),
      ]);

      if (cancelled) return;

      const allGuilds = Array.isArray(guildsList?.guilds) ? guildsList.guilds : [];
      const federationTotal = allGuilds.reduce(
        (sum, g) => sum + (Number(g.member_count) || 0),
        0
      );

      setCounts({
        members: federationTotal || (summary?.guild?.member_count ?? 0),
        applications: Array.isArray(apps?.applications) ? apps.applications.length : 0,
        reports: Array.isArray(reports?.reports) ? reports.reports.length : 0,
        violations: Array.isArray(violations?.violations) ? violations.violations.length : 0,
      });
    }

    async function loadActivity() {
      const data = await safeFetch('/guild/activity');
      if (cancelled) return;
      const list = Array.isArray(data?.activities) ? data.activities.slice(0, 10) : [];
      setActivity(list);
      setActivityLoading(false);
    }

    loadCounts();
    loadActivity();

    return () => {
      cancelled = true;
    };
  }, [safeFetch]);

  const loading = counts === null;

  const stats = [
    {
      key: 'members',
      label: 'Federation Members',
      icon: Users,
      value: counts?.members ?? 0,
      target: 'guild',
      alert: false,
    },
    {
      key: 'applications',
      label: 'Pending Applications',
      icon: FileText,
      value: counts?.applications ?? 0,
      target: 'applications',
      alert: (counts?.applications ?? 0) > 0,
    },
    {
      key: 'reports',
      label: 'Open User Reports',
      icon: Flag,
      value: counts?.reports ?? 0,
      target: 'user-reports',
      alert: (counts?.reports ?? 0) > 0,
    },
    {
      key: 'violations',
      label: 'Forum Violations',
      icon: ShieldAlert,
      value: counts?.violations ?? 0,
      target: 'reports',
      alert: (counts?.violations ?? 0) > 0,
    },
  ];

  const quickActions = [
    {
      key: 'promote',
      label: 'Promote a User',
      icon: TrendingUp,
      target: 'user-roles',
    },
    {
      key: 'apps',
      label: 'Review Applications',
      icon: FileText,
      target: 'applications',
      badge: counts?.applications,
    },
    {
      key: 'events',
      label: 'Manage Events',
      icon: Calendar,
      target: 'events',
    },
    {
      key: 'guild',
      label: 'Guild Roster',
      icon: Users,
      target: 'guild',
    },
  ];

  return (
    <div className={styles.overview}>
      <header className={styles.header}>
        <h1 className={styles.title}>Officer Overview</h1>
        <p className={styles.subtitle}>
          Federation status at a glance. Click any card to dive in.
        </p>
      </header>

      <div className={styles.statsGrid}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              type="button"
              key={stat.key}
              onClick={() => onNavigate?.(stat.target)}
              className={`${styles.statCard} ${stat.alert ? styles.statCardAlert : ''}`}
            >
              <div className={styles.statIconWrap}>
                <Icon className={styles.statIcon} aria-hidden="true" size={28} />
              </div>
              <div className={styles.statBody}>
                {loading ? (
                  <div className={styles.skeletonNumber} aria-hidden="true" />
                ) : (
                  <div
                    className={`${styles.statValue} ${stat.alert ? styles.statValueAlert : ''}`}
                  >
                    {stat.value}
                  </div>
                )}
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
              <ChevronRight className={styles.statChevron} size={18} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.activityPanel} aria-labelledby="recent-activity-heading">
          <header className={styles.panelHeader}>
            <Activity className={styles.panelHeaderIcon} size={18} aria-hidden="true" />
            <h2 id="recent-activity-heading" className={styles.panelTitle}>
              Recent Activity
            </h2>
          </header>

          {activityLoading ? (
            <ul className={styles.activityList}>
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className={styles.activityRow}>
                  <div className={styles.skeletonIcon} aria-hidden="true" />
                  <div className={styles.skeletonLineWrap}>
                    <div className={styles.skeletonLine} aria-hidden="true" />
                    <div className={styles.skeletonLineShort} aria-hidden="true" />
                  </div>
                </li>
              ))}
            </ul>
          ) : activity.length === 0 ? (
            <p className={styles.emptyState}>No recent activity to show.</p>
          ) : (
            <ul className={styles.activityList}>
              {activity.map((item, idx) => {
                const Icon = pickActivityIcon(item.type);
                const description =
                  item.description ||
                  formatFallbackDescription(item.type, item.character_name);
                return (
                  <li key={item.id ?? idx} className={styles.activityRow}>
                    <div className={styles.activityIconWrap}>
                      <Icon className={styles.activityIcon} size={16} aria-hidden="true" />
                    </div>
                    <div className={styles.activityContent}>
                      <div className={styles.activityDescription}>{description}</div>
                      <div className={styles.activityTime}>
                        {item.occurred_at ? timeAgo(item.occurred_at) : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.quickActions} aria-labelledby="quick-actions-heading">
          <header className={styles.panelHeader}>
            <ShieldCheck className={styles.panelHeaderIcon} size={18} aria-hidden="true" />
            <h2 id="quick-actions-heading" className={styles.panelTitle}>
              Quick Actions
            </h2>
          </header>
          <ul className={styles.actionList}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              const showBadge =
                typeof action.badge === 'number' && action.badge > 0;
              return (
                <li key={action.key}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.(action.target)}
                    className={styles.actionButton}
                  >
                    <Icon className={styles.actionIcon} size={18} aria-hidden="true" />
                    <span className={styles.actionLabel}>{action.label}</span>
                    {showBadge && (
                      <span className={styles.actionBadge}>{action.badge}</span>
                    )}
                    <ArrowRight
                      className={styles.actionArrow}
                      size={16}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/**
 * Maps a guild activity event type to a lucide icon. Falls back to a
 * neutral Activity icon for anything we don't recognise.
 */
function pickActivityIcon(type) {
  switch ((type || '').toLowerCase()) {
    case 'join':
    case 'joined':
    case 'member_joined':
      return UserPlus;
    case 'leave':
    case 'left':
    case 'member_left':
      return UserMinus;
    case 'promotion':
    case 'promoted':
    case 'rank_up':
      return TrendingUp;
    case 'demotion':
    case 'demoted':
    case 'rank_down':
      return TrendingUp;
    case 'achievement':
    case 'achievement_earned':
      return Award;
    default:
      return Activity;
  }
}

/**
 * Best-effort human description when the API omits a `description` field.
 */
function formatFallbackDescription(type, name) {
  const who = name || 'Someone';
  switch ((type || '').toLowerCase()) {
    case 'join':
    case 'joined':
    case 'member_joined':
      return `${who} joined the guild`;
    case 'leave':
    case 'left':
    case 'member_left':
      return `${who} left the guild`;
    case 'promotion':
    case 'promoted':
    case 'rank_up':
      return `${who} was promoted`;
    case 'demotion':
    case 'demoted':
    case 'rank_down':
      return `${who} was demoted`;
    case 'achievement':
    case 'achievement_earned':
      return `${who} earned an achievement`;
    default:
      return `${who} - ${type || 'activity'}`;
  }
}
