import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert, Button } from '../../components/ui';
import styles from './Login.module.css';

const HERO_IMAGE = '/images/mdga_train.png';

const DISCORD_SVG = (
  <svg className={styles.discordIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
  </svg>
);

// Atmospheric left pane — image + scrim + brand + pull quote. Shared
// between the sign-in and post-approval views so the page feels like one
// surface across both states.
function HeroPane({ children }) {
  return (
    <aside
      className={styles.imagePane}
      style={{ backgroundImage: `url(${HERO_IMAGE})` }}
      aria-hidden="true"
    >
      <div className={styles.imageScrim} />
      <div className={styles.imageContent}>
        <span className={styles.brand}>MDGA</span>
        {children}
      </div>
    </aside>
  );
}

const QUOTE = (
  <div className={styles.quote}>
    <p className={styles.quoteText}>&ldquo;For the Horde. For Durotar. For Glory.&rdquo;</p>
    <span className={styles.quoteAuthor}>The Warchief&apos;s creed</span>
  </div>
);

// Read the post-login redirect target stashed by ProtectedRoute. Validate
// strictly as a relative same-origin path to prevent open-redirect abuse —
// any value that doesn't start with a single '/' is dropped.
function consumePostLoginRedirect() {
  try {
    const stashed = sessionStorage.getItem('mdga.postLoginRedirect');
    sessionStorage.removeItem('mdga.postLoginRedirect');
    if (stashed && stashed.startsWith('/') && !stashed.startsWith('//')) {
      return stashed;
    }
  } catch {
    // sessionStorage unavailable
  }
  return null;
}

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
        navigate(consumePostLoginRedirect() || '/', { replace: true });
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

          if (data.user.needsDiscord) {
            login(data.token, data.user);
            setNeedsDiscord(true);
            window.history.replaceState({}, '', '/login');
            return;
          }

          login(data.token, data.user);
          window.history.replaceState({}, '', '/login');
          navigate(consumePostLoginRedirect() || '/', { replace: true });
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

  const statusTone = status?.type === 'info'
    ? 'info'
    : status?.type === 'warning'
      ? 'warning'
      : 'error';

  // ── Approved but not in Discord — same split layout, different content
  if (needsDiscord || (isLoggedIn && user?.needsDiscord)) {
    return (
      <div className={styles.page}>
        <HeroPane>{QUOTE}</HeroPane>
        <main className={styles.formPane}>
          <div className={styles.formInner}>
            <span className={styles.eyebrow}>Account approved</span>
            <h1 className={styles.title}>Almost there</h1>
            <p className={styles.lede}>
              Your MDGA account is active. To unlock full access and connect with the
              guild, join our Discord server.
            </p>

            <div className={styles.emailNotice}>
              <span aria-hidden="true">&#9993;</span>
              <span>Check your email — we&apos;ve sent you a Discord invite.</span>
            </div>

            <a
              href="https://discord.gg/wowmdga"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.discordBtn}
            >
              {DISCORD_SVG}
              <span>Join MDGA Discord</span>
            </a>

            <p className={styles.continueLink}>
              <Link
                to="/"
                onClick={(e) => {
                  const target = consumePostLoginRedirect();
                  if (target) {
                    e.preventDefault();
                    navigate(target, { replace: true });
                  }
                }}
              >Continue to site &rarr;</Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Default sign-in view
  return (
    <div className={styles.page}>
      <HeroPane>{QUOTE}</HeroPane>
      <main className={styles.formPane}>
        <div className={styles.formInner}>
          <span className={styles.eyebrow}>Welcome back, warrior</span>
          <h1 className={styles.title}>Sign In</h1>
          <p className={styles.lede}>
            Use your Discord account to access the guild forum, RSVP to events, and
            track the leaderboards.
          </p>

          {status && (
            <div className={styles.alertWrap}>
              <Alert tone={statusTone}>{status.msg}</Alert>
            </div>
          )}

          <Button href="/api/auth/discord?from=login" variant="discord" size="lg" block>
            {DISCORD_SVG}
            Sign in with Discord
          </Button>

          <p className={styles.signupLink}>
            Don&apos;t have an account?{' '}
            <a
              href="https://guildsofwow.com/make-durotar-great-again"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apply to join &rarr;
            </a>
          </p>

          <p className={styles.fineprint}>
            We use Discord OAuth to verify guild membership. We never see your password.
          </p>
        </div>
      </main>
    </div>
  );
}
