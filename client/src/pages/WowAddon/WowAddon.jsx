import { Navigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './WowAddon.module.css';

// Dedicated page for the in-game MDGA WoW addon download (forum #72).
// Reached from the user menu (officer-gated). The /wow_addon/MDGA.zip
// file itself remains publicly served by the express static mount —
// gating the discoverable link is what's officer-restricted, not the
// underlying file.
export default function WowAddon() {
  useDocumentTitle('MDGA WoW Addon | MDGA');
  const { isLoggedIn, isOfficer } = useAuth();

  // Belt + braces — App.jsx already routes with requireOfficer, but a
  // direct in-app navigation shouldn't render the page for non-officers.
  if (!isLoggedIn || !isOfficer || !isOfficer()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Officer Tooling</span>
        <h1 className={styles.title}>MDGA WoW Addon</h1>
        <p className={styles.subtitle}>
          The in-game addon that drives the officer audit workflow. Generates the roster reports the desktop audit tool reads, plus a few quality-of-life additions for officers in-game.
        </p>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Download</span>
        </div>
        <div className={styles.downloadRow}>
          <div className={styles.downloadInfo}>
            <span className={styles.downloadName}>MDGA.zip</span>
            <span className={styles.downloadHint}>Drop the extracted folder into your WoW <code>_retail_/Interface/AddOns</code> directory.</span>
          </div>
          <a href="/wow_addon/MDGA.zip" download className="btn btn--primary btn--sm">
            <Download size={14} aria-hidden="true" />
            <span>Download MDGA addon</span>
          </a>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Install</span>
        </div>
        <ol className={styles.steps}>
          <li>Download the zip above and extract it. You should get a folder named <code>MDGA</code> with several <code>.lua</code> files inside.</li>
          <li>Move the <code>MDGA</code> folder into <code>World of Warcraft/_retail_/Interface/AddOns/</code> (or your equivalent if you play on a non-retail client).</li>
          <li>Restart WoW (or type <code>/reload</code> if it&apos;s already running). The new addon shows up in the AddOns list at the character-select screen.</li>
          <li>In-game, type <code>/mdga</code> for the addon&apos;s slash commands and the Generate Report button.</li>
        </ol>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>What it does</span>
        </div>
        <p className={styles.bodyText}>
          The addon adds a <strong>Generate Report</strong> button that dumps the current guild roster (names, ranks, notes, last seen) into a format the desktop <strong>MDGA Audit Tool</strong> consumes. It also exposes a few in-game niceties for officers — auto-messages, calendar tracking, guild-bank inventory dumps.
        </p>
        <p className={styles.bodyText}>
          Pair it with the <strong>Audit Tool</strong> download in <code>Admin → Audit Tool</code> for the full officer workflow.
        </p>
      </section>
    </div>
  );
}
