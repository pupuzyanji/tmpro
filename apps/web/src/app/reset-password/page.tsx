'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Logo } from '@/components/logo';

/** Public — where an Admin/HR-sent "Reset password" link
 *  (EmployeesService.resetPassword()) lands. No sign-in needed: the token
 *  in the URL is what identifies the account (see
 *  AuthService.resetPasswordWithToken()), one-time and expiring in an hour.
 *  useSearchParams needs a Suspense boundary in the app router, same
 *  pattern as the People profile page's tab deep-linking. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', null, {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-10">
      <Logo className="mb-8" />

      <div className="card w-full max-w-sm">
        {!token ? (
          <div className="space-y-3 text-center">
            <h1 className="text-lg font-semibold text-ink">Reset link missing</h1>
            <p className="text-sm text-slate-500">
              This page needs the link from your reset-password email. Ask an Admin to send you a new one if you no
              longer have it.
            </p>
            <Link href="/login" className="btn-primary mt-2 inline-flex">
              Back to sign in
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-3 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient-soft text-2xl">
              ✓
            </span>
            <h1 className="text-lg font-semibold text-ink">Password updated</h1>
            <p className="text-sm text-slate-500">You can now sign in with your new password.</p>
            <Link href="/login" className="btn-primary mt-2 inline-flex">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-ink">Set a new password</h1>
              <p className="mt-0.5 text-sm text-slate-500">Choose a new password for your tmPro account.</p>
            </div>
            <div>
              <label className="label" htmlFor="newPassword">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoFocus
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
