import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user: fetchedUser }) => setUser(fetchedUser))
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: loggedInUser } = await authApi.login({ email, password });
    localStorage.setItem('token', token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // A doctor self-registration doesn't return a token — the account is
  // pending admin approval and can't log in yet. Only auto-login when a
  // token actually comes back (patient registration).
  const register = useCallback(async (payload) => {
    const response = await authApi.register(payload);
    if (response.token) {
      localStorage.setItem('token', response.token);
      setUser(response.user);
    }
    return response;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  // Merges a partial update (e.g. a freshly-saved doctorProfile) into the
  // cached session user, so other parts of the app relying on useAuth().user
  // see it without needing a full /me refetch.
  const updateUser = useCallback((partial) => {
    setUser((current) => (current ? { ...current, ...partial } : current));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
