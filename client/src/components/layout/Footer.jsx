import { Link } from 'react-router-dom';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.brand}>
            <h3 className={styles.brandName}>Make Durotar Great Again</h3>
            <p className={styles.brandTagline}>
              The #1 Horde World PvP community in North America.
            </p>
            <a
              href="https://discord.gg/wowmdga"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.discordBtn}
              aria-label="Join our Discord"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
              </svg>
              <span>Join Discord</span>
            </a>
          </div>

          <div className={styles.col}>
            <h4 className={styles.colHeading}>Site</h4>
            <ul className={styles.linksList}>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/story">Our Story</Link></li>
              <li><Link to="/leadership">Leadership</Link></li>
              <li><Link to="/events">Events</Link></li>
              <li><Link to="/forum">Forum</Link></li>
              <li><Link to="/leaderboards">Leaderboards</Link></li>
              <li>
                <a
                  href="https://guildsofwow.com/make-durotar-great-again"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join Us
                </a>
              </li>
            </ul>
          </div>

          <div className={styles.col}>
            <h4 className={styles.colHeading}>External</h4>
            <ul className={styles.linksList}>
              <li>
                <a href="https://www.pvpleaderboard.com/statistics#guild" target="_blank" rel="noopener noreferrer">
                  PvP Leaderboard
                </a>
              </li>
              <li>
                <a href="https://check-pvp.com/guild/us/tichondrius/MAKE%20DUROTAR%20GREAT%20AGAIN" target="_blank" rel="noopener noreferrer">
                  Check-PvP
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>&copy; {new Date().getFullYear()} Make Durotar Great Again</span>
          <span className={styles.bottomDot} aria-hidden="true">·</span>
          <span>All US Realms · Home: Tichondrius</span>
          <span className={styles.bottomDot} aria-hidden="true">·</span>
          <span className={styles.legal}>
            World of Warcraft and Blizzard Entertainment are trademarks of Blizzard Entertainment, Inc.
          </span>
        </div>
      </div>
    </footer>
  );
}
