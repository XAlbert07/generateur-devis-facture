import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiRequest } from '../api/http';

export type Session = {
  user: { id: string; name: string; email: string };
  company: { id: string; name: string };
  role: string;
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await apiRequest<Session>('/auth/me'));
      setError(null);
    } catch (cause) {
      setSession(null);
      setError(cause instanceof ApiError && cause.status === 401 ? null : 'Connexion au serveur impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await apiRequest<void>('/auth/logout', { method: 'POST' }); }
    finally { setSession(null); setError(null); }
  }, []);

  const value = useMemo(() => ({ session, loading, error, refresh, logout }), [session, loading, error, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé sous AuthProvider');
  return value;
}
