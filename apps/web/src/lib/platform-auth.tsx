'use client';

// Platform-admin session — deliberately separate from the tenant AuthContext
// (lib/auth-context.tsx): different login endpoint, different token
// (a `scope: 'platform'` JWT the tenant-scoped API routes reject), different
// localStorage key, so the two can never be confused with each other or
// leak into one another's storage.
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { apiFetch } from './api';

export interface PlatformSession {
  accessToken: string;
  admin: { id: string; email: string; name: string };
}

interface PlatformAuthContextValue {
  session: PlatformSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);
const STORAGE_KEY = 'tmpro_platform_session';

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlatformSession | null>(null);
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

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<PlatformSession>('/platform-admin/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSession(result);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <PlatformAuthContext.Provider value={{ session, loading, login, logout }}>{children}</PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth must be used within PlatformAuthProvider');
  return ctx;
}
