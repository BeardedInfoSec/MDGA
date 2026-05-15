import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// Stash the intended destination so Login can send the user back here after
// they sign in. Survives the Discord OAuth bounce because we use sessionStorage
// rather than React state. Validated as a same-origin relative path on read.
function stashPostLoginRedirect(loc) {
  try {
    const dest = `${loc.pathname || ''}${loc.search || ''}${loc.hash || ''}`;
    if (dest && dest !== '/' && !dest.startsWith('/login')) {
      sessionStorage.setItem('mdga.postLoginRedirect', dest);
    }
  } catch {
    // sessionStorage unavailable (private mode, quotas) — fall through.
  }
}

export default function ProtectedRoute({ children, requireOfficer, requireGM }) {
  const { isLoggedIn, isOfficer, isGuildMaster } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    stashPostLoginRedirect(location);
    return <Navigate to="/login" replace />;
  }
  if (requireOfficer && !isOfficer()) return <Navigate to="/" replace />;
  if (requireGM && !isGuildMaster()) return <Navigate to="/" replace />;

  return children;
}
