import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuthStatus, verifySession, logout as apiLogout } from '../api';

interface AuthState {
  isProtected: boolean;
  authenticated: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isProtected: false,
  authenticated: true,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isProtected, setIsProtected] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [status, verify] = await Promise.all([getAuthStatus(), verifySession()]);
      setIsProtected(status.protected);
      setAuthenticated(!status.protected || verify.authenticated);
    } catch {
      // If we can't reach server, optimistically allow access
      setAuthenticated(true);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await apiLogout();
    setAuthenticated(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <AuthContext.Provider value={{ isProtected, authenticated, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
