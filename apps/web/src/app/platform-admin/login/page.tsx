'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlatformAuth } from '@/lib/platform-auth';
import { ApiError } from '@/lib/api';
import { LogoMark } from '@/components/logo';

/** Deliberately plain — no marketing hero, no "Register your organisation"
 *  link. This is an internal tmPro-operator tool, not something prospects
 *  or tenants ever see; there's no self-serve signup for it either (see
 *  PlatformAdminAuthService). */
export default function PlatformAdminLoginPage() {
  const { login } = usePlatformAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/platform-admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-gradient-soft px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient p-0.5">
            <LogoMark size={28} className="rounded-[10px]" />
          </span>
          <span className="text-sm font-bold text-ink">tmPro — Platform Admin</span>
        </div>
        <div className="overflow-hidden rounded-2xl shadow-card">
          <div className="h-1.5 w-full bg-brand-gradient" />
          <form onSubmit={onSubmit} className="space-y-4 bg-white p-5">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
