import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuthStatus, verifySession, logout as apiLogout } from '../api';
import { AuthUser, Module } from '../types';

interface AuthState {
  isProtected: boolean;
  authenticated: boolean;
  loading: boolean;
  user: AuthUser | null;      // null = legacy/open/API-key session (implicit full access)
  isAdmin: boolean;
  canEdit: (module: Module) => boolean;
  canView: (module: Module) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isProtected: false,
  authenticated: true,
  loading: true,
  user: null,
  isAdmin: true,
  canEdit: () => true,
  canView: () => true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isProtected, setIsProtected] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [status, verify] = await Promise.all([getAuthStatus(), verifySession()]);
      setIsProtected(status.protected);
      setAuthenticated(!status.protected || verify.authenticated);
      setUser(verify.user ?? null);
    } catch {
      // If we can't reach server, optimistically allow access
      setAuthenticated(true);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await apiLogout();
    setAuthenticated(false);
    setUser(null);
  };

  useEffect(() => { refresh(); }, []);

  // No password / legacy session / API key => user is null while authenticated => full access.
  const fullAccess = authenticated && user === null;
  const isAdmin = fullAccess || Boolean(user?.is_admin);

  const canEdit = (module: Module) => {
    if (!authenticated) return false;
    if (fullAccess || user?.is_admin) return true;
    return user?.privileges[module] === 'edit';
  };

  const canView = (module: Module) => {
    if (!authenticated) return false;
    if (fullAccess || user?.is_admin) return true;
    return user?.privileges[module] === 'view' || user?.privileges[module] === 'edit';
  };

  return (
    <AuthContext.Provider value={{ isProtected, authenticated, loading, user, isAdmin, canEdit, canView, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
