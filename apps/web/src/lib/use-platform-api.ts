'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePlatformAuth } from './platform-auth';
import { apiFetch } from './api';

/** Same shape as use-api.ts's useApi(), scoped to the platform-admin
 *  session instead of a tenant session — redirects to /platform-admin/login
 *  if there's no session, and returns a call() bound to the platform token. */
export function usePlatformApi() {
  const { session, loading } = usePlatformAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/platform-admin/login');
  }, [loading, session, router]);

  const call = useCallback(
    <T,>(path: string, init?: RequestInit) => apiFetch<T>(path, session?.accessToken ?? null, init),
    [session],
  );

  return { session, ready: !loading && !!session, call };
}
