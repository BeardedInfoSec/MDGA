import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import { Alert, Button } from '../../components/ui';
import styles from './Login.module.css';

const DISCORD_SVG = (
  <svg className={styles.discordIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
  </svg>
);

export default function Login() {
  useDocumentTitle('Login | MDGA');
  const { isLoggedIn, login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [needsDiscord, setNeedsDiscord] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      // Don't redirect if user needs to join Discord — let the banner show
      if (!user?.needsDiscord) {
        navigate('/', { replace: true });
      }
      return;
    }

    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const code = hashParams.get('code') || searchParams.get('code');

    if (code) {
      (async () => {
        try {
          const res = await fetch('/api/auth/discord/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) throw new Error('Exchange failed');
          const data = await res.json();
          if (!data.token || !data.user) throw new Error('Invalid auth payload');

          // Check if user needs to join Discord server
          if (data.user.needsDiscord) {
            login(data.token, data.user);
            setNeedsDiscord(true);
            window.history.replaceState({}, '', '/login');
            return;
          }

          login(data.token, data.user);
          window.history.replaceState({}, '', '/login');
          navigate('/', { replace: true });
        } catch {
          setStatus({ type: 'error', msg: 'Session expired. Please try again.' });
          window.history.replaceState({}, '', '/login');
        }
      })();
      return;
    }

    const urlStatus = searchParams.get('status');
    const urlError = searchParams.get('error');

    if (urlStatus === 'pending') {
      setStatus({ type: 'info', msg: "Your account is pending officer approval. You'll be able to log in once an officer approves your request." });
    } else if (urlError === 'discord_denied') {
      setStatus({ type: 'warning', msg: 'Discord authorization was cancelled. Please try again.' });
    } else if (urlError === 'invalid_state') {
      setStatus({ type: 'error', msg: 'Session expired. Please try again.' });
    } else if (urlError === 'discord_error') {
      setStatus({ type: 'error', msg: 'Discord verification failed. Please try again.' });
    } else if (urlError === 'suspended') {
      setStatus({ type: 'error', msg: 'Your account has been suspended. Contact an officer if you believe this is an error.' });
    } else if (urlError === 'banned') {
      setStatus({ type: 'error', msg: 'Your account has been banned. If you believe this is a mistake, please contact an officer.' });
    }

    if (searchParams.toString()) {
      window.history.replaceState({}, '', '/login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show Discord invite banner for approved users not yet in server
  // Check both local state (set during code exchange) and persisted user flag (survives re-renders)
  if (needsDiscord || (isLoggedIn && user?.needsDiscord)) {
    return (
      <>
        <PageHero title="Welcome to MDGA" subtitle="You're almost there!" />
        <section className="section section--dark">
          <div className="container">
            <div className={styles.inviteBanner}>
              <h2>Account Approved!</h2>
              <p className={styles.inviteSubtext}>
                Your account is active, but you need to join our Discord server
                to connect with the guild and unlock full access.
              </p>
              <div className={styles.emailNotice}>
                <span className={styles.emailIcon}>&#9993;</span>
                <span>Check your email for a Discord invite link!</span>
              </div>
              <a
                href="https://discord.gg/wowmdga"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.discordInviteBtn}
              >
                {DISCORD_SVG}
                Join MDGA Discord
              </a>
              <p className={styles.continueLink}>
                <Link to="/">Continue to site</Link>
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  const statusTone = status?.type === 'info'
    ? 'info'
    : status?.type === 'warning'
      ? 'warning'
      : 'error';

  return (
    <>
      <PageHero title="Login" subtitle="Welcome back, warrior" />
      <section className="section section--dark">
        <div className="container">
          <div className={styles.loginBox}>
            <h2>Sign In</h2>
            {status && <Alert tone={statusTone}>{status.msg}</Alert>}
            <Button href="/api/auth/discord?from=login" variant="discord" size="lg" block>
              {DISCORD_SVG}
              Sign in with Discord
            </Button>
            <p className={styles.signupLink}>
              Don't have an account? <Link to="/join">Apply to join</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
