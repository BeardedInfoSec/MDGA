import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './CharacterOnboardingModal.module.css';

const SESSION_DISMISS_KEY = 'mdga.charOnboardDismissed';

/**
 * First-time character onboarding nudge. Mounted in Layout so it can pop on
 * any page right after login. Trigger conditions, all must be true:
 *   - User is logged in
 *   - user.characterCount === 0 (no linked characters)
 *   - User hasn't dismissed it this session (sessionStorage)
 *   - Not currently on the Profile page (no point — they can just open it)
 *   - Not on the Login page (still mid-handshake)
 *
 * "Add it now" navigates to /profile?addCharacter=1 which the Profile page
 * picks up and uses to auto-open its existing character-add overlay.
 */
export default function CharacterOnboardingModal() {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !user) { setOpen(false); return; }
    // characterCount comes from /auth/me — if it's missing (older session),
    // skip the nudge until the next session refresh hydrates it.
    if (user.characterCount === undefined || user.characterCount === null) return;
    if (user.characterCount > 0) { setOpen(false); return; }
    if (location.pathname.startsWith('/profile')) return;
    if (location.pathname.startsWith('/login')) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'; } catch { /* private mode */ }
    if (dismissed) return;
    // Small delay so it doesn't pop on the same tick as a navigation
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [isLoggedIn, user, location.pathname]);

  function dismiss() {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  }

  function takeMeThere() {
    dismiss();
    navigate('/profile?addCharacter=1');
  }

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className={styles.card}>
        <span className={styles.eyebrow}>Welcome to MDGA</span>
        <h2 id="onboard-title" className={styles.title}>
          Hey {user?.displayName || user?.username || 'warrior'} — link your main
        </h2>
        <p className={styles.body}>
          You&apos;re signed in, but your account isn&apos;t connected to a WoW character yet. Linking
          your main unlocks the leaderboards, ties your forum posts to your in-game identity, and
          lets officers see who you are at a glance.
        </p>

        <ol className={styles.steps}>
          <li><strong>Pick your main</strong> — character name + realm</li>
          <li><strong>We verify it</strong> — against the Blizzard armory</li>
          <li><strong>You&apos;re in</strong> — class, spec, gear, all auto-populated</li>
        </ol>

        <p className={styles.bodyMuted}>
          You can add alts later too. Takes about 30 seconds.
        </p>

        <div className={styles.actions}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={dismiss}>
            Maybe later
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={takeMeThere}>
            Link my main →
          </button>
        </div>
      </div>
    </div>
  );
}
