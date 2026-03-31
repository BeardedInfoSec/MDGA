import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import { Alert, Button, Input } from '../../components/ui';
import styles from './AdminLogin.module.css';

export default function AdminLogin() {
  useDocumentTitle('Admin Login | MDGA');
  const { isLoggedIn, login, apiFetch } = useAuth();
  const navigate = useNavigate();

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (res.ok) {
        login(data.token, data.user);
        navigate('/admin', { replace: true });
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All fields are required.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await apiFetch('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();

      if (res.ok) {
        setPwSuccess('Password changed successfully.');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      } else {
        setPwError(data.error || 'Failed to change password.');
      }
    } catch {
      setPwError('Failed to change password.');
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <>
      <PageHero title="Admin Login" subtitle="Authorized personnel only" />
      <section className="section section--dark">
        <div className="container">
          <div className={styles.loginBox}>
            {isLoggedIn ? (
              <>
                <h2>Change Password</h2>
                <form onSubmit={handlePasswordChange}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="current-password">Current Password</label>
                    <Input
                      className={styles.input}
                      type="password"
                      id="current-password"
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="new-password">New Password</label>
                    <Input
                      className={styles.input}
                      type="password"
                      id="new-password"
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="confirm-password">Confirm New Password</label>
                    <Input
                      className={styles.input}
                      type="password"
                      id="confirm-password"
                      autoComplete="new-password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      required
                    />
                  </div>
                  {pwError && <Alert tone="error" className={styles.error}>{pwError}</Alert>}
                  {pwSuccess && <Alert tone="success" className={styles.error}>{pwSuccess}</Alert>}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    block
                    disabled={pwSubmitting}
                  >
                    {pwSubmitting ? 'Updating...' : 'Change Password'}
                  </Button>
                </form>
                <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
                  <Link to="/admin" className="btn btn--secondary">Go to Admin Panel</Link>
                </div>
              </>
            ) : (
              <>
                <h2>Admin Sign In</h2>
                <form onSubmit={handleSubmit}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="login-username">Username</label>
                    <Input
                      className={styles.input}
                      type="text"
                      id="login-username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="login-password">Password</label>
                    <Input
                      className={styles.input}
                      type="password"
                      id="login-password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error && <Alert tone="error" className={styles.error}>{error}</Alert>}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    block
                    disabled={submitting}
                  >
                    {submitting ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
