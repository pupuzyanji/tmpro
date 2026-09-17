'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiFetch } from './api';

export type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'CANDIDATE' | 'HR';

export interface Session {
  accessToken: string;
  tenant: { slug: string; name: string; enabledModules: string[] };
  user: { id: string; email: string; role: Role };
  profile: { id?: string; firstName?: string; lastName?: string } | null;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => void;
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

  return <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
