'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

/** Sidebar account menu > "Change password" (v019.A) — same modal shape
 *  for every role (Admin, Supervisor, Employee); the backend scopes the
 *  change to whoever the caller's own JWT says they are, so there's
 *  nothing role-specific here. */
export function ChangePasswordModal({
  accessToken,
  onClose,
  onChanged,
  forced = false,
  onSignOut,
}: {
  accessToken: string;
  onClose: () => void;
  /** Receives the fresh token the API issues after a change (v027.A). */
  onChanged?: (accessToken: string) => void;
  /** v027.A — first sign-in with a temporary password: no Cancel, and the
   *  app stays locked until the password is changed. */
  forced?: boolean;
  onSignOut?: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: true; accessToken?: string }>('/auth/change-password', accessToken, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.accessToken) onChanged?.(res.accessToken);
      if (forced) {
        onClose();
        return;
      }
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-brand-gradient" />
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">{forced ? 'Choose your own password' : 'Change password'}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {forced
                ? "You signed in with a temporary password. Choose a new one (at least 8 characters) to continue — you'll use it from now on."
                : 'Set a new password for your account.'}
            </p>
          </div>

          {saved ? (
            <>
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Your password has been changed.</p>
              <div className="flex justify-end pt-1">
                <button type="button" className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="currentPassword">
                  {forced ? 'Temporary password' : 'Current password'}
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="newPassword">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
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

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                {forced ? (
                  <button type="button" className="btn-secondary" onClick={onSignOut} disabled={saving}>
                    Sign out
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
