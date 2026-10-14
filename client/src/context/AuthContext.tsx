import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { setAuthToken } from '../api/client';
import type { User } from '../types/user';
import { clearPersisted } from '../utils/persistedQuery';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, company?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Swaps in a new session for this browser (after a password change / signing out elsewhere). */
  replaceSession: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_STORAGE_KEY = 'lt_token';
const USER_STORAGE_KEY = 'lt_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setAuthToken(stored);
    // Open straight away as the last signed-in user; the check below confirms it (or
    // signs out) in the background instead of holding the whole app on a round trip.
    try {
      const cachedUser = JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || 'null');
      if (cachedUser) {
        setUser(cachedUser);
        setIsLoading(false);
      }
    } catch {
      // no saved user - wait for the check
    }
    authApi
      .me()
      .then((res) => {
        setUser(res.user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
      })
      .catch((err) => {
        // Only a rejected token signs out - a network blip keeps the saved session.
        if (err?.response?.status !== 401 && err?.response?.status !== 403) return;
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        clearPersisted();
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function persist(token: string, nextUser: User) {
    clearPersisted();
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthToken(token);
    setUser(nextUser);
  }

  async function login(email: string, password: string) {
    const res = await authApi.login({ email, password });
    persist(res.token, res.user);
  }

  async function register(name: string, email: string, password: string, company?: string) {
    const res = await authApi.register({ name, email, password, company });
    persist(res.token, res.user);
  }

  function replaceSession(token: string, nextUser: User) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setAuthToken(token);
    setUser(nextUser);
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      clearPersisted();
      setAuthToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, replaceSession }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { TOKEN_STORAGE_KEY };
