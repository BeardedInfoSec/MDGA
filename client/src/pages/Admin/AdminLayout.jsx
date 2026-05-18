// ================================================
// AdminLayout — sidebar + page header shell for the entire admin panel
// Replaces the old top-tab navigation with grouped sidebar sections.
// No emojis anywhere — uses lucide-react icons.
// ================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Shield, ShieldCheck, FileText,
  ChevronLeft, ChevronRight, Menu, X, ExternalLink,
} from 'lucide-react';
import styles from './AdminLayout.module.css';

// Sidebar definition. Each group has an icon + label + items. Items map 1:1 to
// the existing tab IDs in Admin.jsx so we don't have to refactor every section
// at once — they just render inside the new shell.
const NAV_GROUPS = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'stats', label: 'Statistics' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: Users,
    items: [
      { id: 'user-roles', label: 'Member Overrides', perm: 'users.manage_overrides' },
      { id: 'discord-roles', label: 'Discord Role Mappings', gmOnly: true },
      { id: 'roles', label: 'Permissions' },
    ],
  },
  {
    id: 'guild',
    label: 'Guild',
    icon: Shield,
    items: [
      { id: 'guild', label: 'Roster + Federation' },
      { id: 'game-ranks', label: 'Game Rank Mappings' },
      { id: 'audit-tool', label: 'Audit Tool' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    icon: ShieldCheck,
    items: [
      { id: 'user-reports', label: 'Reports' },
      { id: 'reports', label: 'Forum violations' },
      { id: 'recycle-bin', label: 'Recycle Bin', perm: 'admin.manage_recycle_bin' },
      { id: 'audit-log', label: 'Audit Log', perm: 'admin.view_audit_log' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    icon: FileText,
    items: [
      { id: 'events', label: 'Events' },
      { id: 'carousel', label: 'Images' },
      { id: 'applications', label: 'Applications' },
      { id: 'forum-categories', label: 'Forum Categories' },
    ],
  },
];

const TAB_LABELS = NAV_GROUPS.flatMap((g) => g.items).reduce((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

export function getAdminTabLabel(tabId) {
  return TAB_LABELS[tabId] || 'Admin';
}

export default function AdminLayout({
  activeTab,
  onTabChange,
  gm,
  user,
  hasPermission,
  pageTitle,
  pageDescription,
  pageActions,
  children,
}) {
  // Sidebar collapses to icon-only on narrow screens; user can also toggle
  // it manually via the burger button.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.shell}>
      {/* Mobile burger */}
      <button
        type="button"
        className={styles.burger}
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandMark}>MDGA</span>
            <span className={styles.brandSub}>Admin</span>
          </Link>
          <Link to="/" className={styles.exitLink} title="Back to site">
            <ExternalLink size={16} />
          </Link>
        </div>

        <nav className={styles.nav}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => {
              // GM short-circuit: GMs see everything regardless of perm gates.
              if (gm) return true;
              if (item.gmOnly) return false;
              if (item.perm) return typeof hasPermission === 'function' && hasPermission(item.perm);
              return true;
            });
            if (visibleItems.length === 0) return null;
            const GroupIcon = group.icon;
            const showLabel = !!group.label;
            return (
              <div key={group.id} className={styles.navGroup}>
                {showLabel && (
                  <div className={styles.navGroupLabel}>
                    <GroupIcon size={14} className={styles.navGroupIcon} />
                    <span>{group.label}</span>
                  </div>
                )}
                <ul className={styles.navItems}>
                  {visibleItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`${styles.navItem} ${activeTab === item.id ? styles.navItemActive : ''}`}
                        onClick={() => {
                          onTabChange(item.id);
                          setSidebarOpen(false);
                        }}
                      >
                        {!showLabel && <GroupIcon size={16} className={styles.navItemIcon} />}
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userBadge}>
            <div className={styles.userBadgeAvatar}>
              {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className={styles.userBadgeText}>
              <div className={styles.userBadgeName}>{user?.display_name || user?.username || 'Admin'}</div>
              <div className={styles.userBadgeRank}>{user?.rank || ''}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        {(pageTitle || pageDescription || pageActions) && (
          <header className={styles.pageHeader}>
            <div className={styles.pageHeaderText}>
              {pageTitle && <h1 className={styles.pageTitle}>{pageTitle}</h1>}
              {pageDescription && <p className={styles.pageDescription}>{pageDescription}</p>}
            </div>
            {pageActions && <div className={styles.pageActions}>{pageActions}</div>}
          </header>
        )}
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
