'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import { apiFetch, apiUpload, apiUploadWithFields } from './api';

/** Redirects to /login if there's no session, and returns a call() bound to the current token. */
export function useApi() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  const call = useCallback(
    <T,>(path: string, init?: RequestInit) => apiFetch<T>(path, session?.accessToken ?? null, init),
    [session],
  );

  const upload = useCallback(
    <T,>(path: string, file: File) => apiUpload<T>(path, session?.accessToken ?? null, file),
    [session],
  );

  const uploadWithFields = useCallback(
    <T,>(path: string, file: File, fields: Record<string, string>) =>
      apiUploadWithFields<T>(path, session?.accessToken ?? null, file, fields),
    [session],
  );

  return { session, ready: !loading && !!session, call, upload, uploadWithFields };
}
