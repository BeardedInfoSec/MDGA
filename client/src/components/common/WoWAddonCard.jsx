import styles from './NotificationPrefs.module.css';

// Compact "WoW addon" panel for the Profile page. Lives alongside AFK Notice
// and Notification Preferences in the settings grid (forum #72). Uses the
// shared panel chrome so all three settings cards line up visually.
export default function WoWAddonCard() {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>WoW Addon</span>
      </div>
      <div className={styles.fieldStack}>
        <p className={styles.hint} style={{ margin: 0 }}>
          The in-game MDGA addon adds a &ldquo;Generate Report&rdquo; button and powers the officer audit tooling. Drop it into your AddOns folder like any other WoW addon.
        </p>
        <div className={styles.actions}>
          <a href="/wow_addon/MDGA.zip" download className="btn btn--secondary btn--sm">
            Download MDGA addon
          </a>
        </div>
      </div>
    </div>
  );
}
