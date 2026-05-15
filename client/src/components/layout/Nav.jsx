import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Nav.module.css';

export default function Nav() {
  const { isLoggedIn, user, isOfficer, isGuildMaster, logout } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef(null);

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) {
        setUserOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          {/* Default = MDGA. If the logged-in user's main is Alliance, show
              the MEGA logo instead (auth/me returns mainFaction). */}
          {(() => {
            const isAlliance = isLoggedIn && (user?.mainFaction || '').toUpperCase() === 'ALLIANCE';
            const src = isAlliance ? '/MEGA_Logo.png' : '/MDGA.png';
            const alt = isAlliance ? 'MEGA' : 'MDGA';
            return <img src={src} alt={alt} className={styles.logoIcon} />;
          })()}
          <span className={styles.logoText}>
            {isLoggedIn && (user?.mainFaction || '').toUpperCase() === 'ALLIANCE' ? 'MEGA' : 'MDGA'}
          </span>
        </Link>

        <ul className={`${styles.links} ${menuOpen ? styles.linksOpen : ''}`}>
          <li>
            <Link to="/" className={`${styles.link} ${isActive('/') ? styles.linkActive : ''}`}>
              Home
            </Link>
          </li>
          <li>
            <Link to="/events" className={`${styles.link} ${isActive('/events') ? styles.linkActive : ''}`}>
              Events
            </Link>
          </li>
          <li>
            <Link to="/story" className={`${styles.link} ${isActive('/story') ? styles.linkActive : ''}`}>
              Story
            </Link>
          </li>
          <li>
            <Link to="/leadership" className={`${styles.link} ${isActive('/leadership') ? styles.linkActive : ''}`}>
              Leadership
            </Link>
          </li>
          {isLoggedIn && (
            <li>
              <Link to="/forum" className={`${styles.link} ${isActive('/forum') ? styles.linkActive : ''}`}>
                Forum
              </Link>
            </li>
          )}
          {/* Leaderboards is public read; anonymized for non-members. */}
          <li>
            <Link to="/leaderboards" className={`${styles.link} ${isActive('/leaderboards') ? styles.linkActive : ''}`}>
              Leaderboards
            </Link>
          </li>

          <li>
            {/* External: opens the Fourthwall storefront in a new tab.
                Public — no auth required. Sits after Leaderboards for
                logged-in users; still visible to logged-out users. */}
            <a
              href="https://make-durotar-great-again-shop.fourthwall.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              Merch
            </a>
          </li>

          {/* Auth-dependent links */}
          {isLoggedIn ? (
            <li className={styles.userMenu} ref={userRef}>
              <button
                className={styles.userBtn}
                onClick={() => setUserOpen(!userOpen)}
                aria-haspopup="true"
                aria-expanded={userOpen}
              >
                <span className={`rank-badge rank-badge--${user.rank}`}>{user.displayRank || user.display_rank || user.rank}</span>
                {user.displayName || user.display_name || user.username}
              </button>
              <div className={`${styles.userDropdown} ${userOpen ? styles.userDropdownVisible : ''}`}>
                <Link to="/profile" className={styles.dropdownItem}>Profile</Link>
                {isOfficer() && (
                  <Link to="/admin" className={styles.dropdownItem}>
                    {isGuildMaster() ? 'Admin Panel' : 'Officer Panel'}
                  </Link>
                )}
                <button className={styles.dropdownItem} onClick={logout}>Logout</button>
              </div>
            </li>
          ) : (
            <>
              <li>
                <Link
                  to="/join"
                  className={`${styles.link} ${styles.linkCta} ${isActive('/join') ? styles.linkActive : ''}`}
                >
                  Join Us
                </Link>
              </li>
              <li>
                <Link to="/login" className={`${styles.link} ${isActive('/login') ? styles.linkActive : ''}`}>
                  Login
                </Link>
              </li>
            </>
          )}
        </ul>

        <button
          className={`${styles.hamburger} ${menuOpen ? styles.hamburgerActive : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
  );
}
