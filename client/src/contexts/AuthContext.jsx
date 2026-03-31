import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AUTH_TOKEN_KEY = 'mdga_token';
const AUTH_USER_KEY = 'mdga_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(AUTH_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const navigate = useNavigate();

  const isLoggedIn = !!token;

  const hasPermission = useCallback((key) => {
    if (!user) return false;
    if (user.rank === 'guildmaster') return true;
    return user.permissions && user.permissions.includes(key);
  }, [user]);

  const isOfficer = useCallback(() => {
    if (!user) return false;
    if (['officer', 'guildmaster'].includes(user.rank)) return true;
    return hasPermission('admin.view_panel');
  }, [user, hasPermission]);

  const isGuildMaster = useCallback(() => {
    return user && user.rank === 'guildmaster';
  }, [user]);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setToken(null);
    setUser(null);
    navigate('/');
  }, [navigate]);

  const clearSession = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const apiFetch = useCallback(async (url, options = {}) => {
    const currentToken = localStorage.getItem(AUTH_TOKEN_KEY);
    // Preserve the Content-Type behavior from the original Auth.apiFetch:
    // When options.headers is explicitly set (even to {}), use those headers.
    // When options.headers is undefined, default to application/json.
    const headers = options.headers !== undefined
      ? { ...options.headers }
      : { 'Content-Type': 'application/json' };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

    const res = await fetch(`/api${url}`, { ...options, headers });

    if (res.status === 401) {
      clearSession();
    }
    if (res.status === 403) {
      const clone = res.clone();
      try {
        const data = await clone.json();
        if (data.status === 'suspended') {
          clearSession();
          navigate('/login?error=suspended');
        } else if (data.status === 'banned') {
          clearSession();
          navigate('/login?error=banned');
        }
      } catch (_) {}
    }
    return res;
  }, [clearSession, navigate]);

  // Refresh session on mount
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await apiFetch('/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.user) return;
        const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
        if (!stored) return;
        const updated = { ...stored, ...data.user };
        delete updated.needsDiscord; // Transient login flag — clear after session refresh
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
        setUser(updated);
      } catch (_) {}
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userTimezone = user?.timezone || browserTimezone;

  // Auto-save browser timezone on first login if user has none stored
  useEffect(() => {
    if (!token || !user || user.timezone) return;
    apiFetch('/profile/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone: browserTimezone }),
    }).then((res) => {
      if (res.ok) {
        const updated = { ...user, timezone: browserTimezone };
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
        setUser(updated);
      }
    }).catch(() => {});
  }, [token, user?.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTimezone = useCallback(async (tz) => {
    const res = await apiFetch('/profile/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone: tz }),
    });
    if (res.ok) {
      const updated = { ...user, timezone: tz };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      setUser(updated);
    }
    return res;
  }, [user, apiFetch]);

  const value = {
    token,
    user,
    isLoggedIn,
    hasPermission,
    isOfficer,
    isGuildMaster,
    login,
    logout,
    clearSession,
    apiFetch,
    userTimezone,
    updateTimezone,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
