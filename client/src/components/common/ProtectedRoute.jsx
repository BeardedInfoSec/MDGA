import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, requireOfficer, requireGM }) {
  const { isLoggedIn, isOfficer, isGuildMaster } = useAuth();

  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (requireOfficer && !isOfficer()) return <Navigate to="/" replace />;
  if (requireGM && !isGuildMaster()) return <Navigate to="/" replace />;

  return children;
}
