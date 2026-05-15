import { Link } from 'react-router-dom';
import styles from './Forum.module.css';

const FALLBACK_ICONS = {
  'General Discussion': '\u{1F4AC}',
  'PvP Strategy': '⚔️',
  'Recruitment': '\u{1F4CB}',
  'Off-Topic': '\u{1F3AE}',
  'Guild Announcements': '\u{1F4E2}',
};

/**
 * ForumSidebar — sticky category list shown on forum browse pages.
 *
 *   - All Posts link at the top (jumps back to ForumIndex)
 *   - One row per category: icon, name, post count, optional "officer" tag
 *   - Active category highlighted with gold left-border
 *
 * The active state is determined by `activeCategoryId` (id from URL).
 * Pass null when on the ForumIndex landing.
 */
export default function ForumSidebar({ categories, activeCategoryId }) {
  return (
    <aside className={styles.forumSidebar} aria-label="Forum categories">
      <div className={styles.forumSidebarSticky}>
        <div>
          <span className={styles.forumSidebarLabel}>Categories</span>
          <nav className={styles.forumSidebarNav}>
            <Link
              to="/forum"
              className={`${styles.forumSidebarItem} ${activeCategoryId == null ? styles.forumSidebarItemActive : ''}`}
            >
              <span className={styles.forumSidebarItemIcon} aria-hidden="true">#</span>
              <span className={styles.forumSidebarItemTitle}>All Categories</span>
            </Link>
            {(categories || []).map((cat) => {
              const isActive = String(activeCategoryId) === String(cat.id);
              return (
                <Link
                  key={cat.id}
                  to={`/forum/category/${cat.id}`}
                  className={`${styles.forumSidebarItem} ${isActive ? styles.forumSidebarItemActive : ''}`}
                  title={cat.description || cat.name}
                >
                  <span
                    className={styles.forumSidebarItemIcon}
                    aria-hidden="true"
                    style={cat.accent_color ? { color: cat.accent_color } : undefined}
                  >
                    {cat.icon || FALLBACK_ICONS[cat.name] || '\u{1F4AC}'}
                  </span>
                  <span className={styles.forumSidebarItemTitle}>{cat.name}</span>
                  {cat.officer_only ? (
                    <span className={styles.forumSidebarOfficer}>Officer</span>
                  ) : null}
                  <span className={styles.forumSidebarItemCount}>{cat.post_count || 0}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
