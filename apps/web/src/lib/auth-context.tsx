'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiFetch } from './api';

export type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'CANDIDATE' | 'HR';

export interface Session {
  accessToken: string;
  tenant: { slug: string; name: string; enabledModules: string[] };
  user: { id: string; email: string; role: Role };
  profile: { id?: string; firstName?: string; lastName?: string } | null;
  /** v027.A — signed in with a temporary password; the app only shows the
   *  "choose a new password" screen until it's changed. */
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** v025.A — after a plan change in Settings → Billing, refresh the
   *  cached module list so the sidebar updates without signing out. */
  updateEnabledModules: (modules: string[]) => void;
  /** v027.A — swap in the fresh token issued after a password change and
   *  clear the must-change flag. */
  passwordChanged: (accessToken: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'tmpro_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      // ignore corrupted storage
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const result = await apiFetch<Session>('/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ tenantSlug, email, password }),
    });
    setSession(result);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateEnabledModules = useCallback((modules: string[]) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, tenant: { ...prev.tenant, enabledModules: modules } };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // best-effort
      }
      return next;
    });
  }, []);

  const passwordChanged = useCallback((accessToken: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, accessToken, mustChangePassword: false };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // best-effort
      }
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, updateEnabledModules, passwordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
