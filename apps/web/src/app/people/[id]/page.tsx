'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { TabBar } from '@/components/tab-bar';
import { IconUser, IconBriefcase, IconCalendar, IconDocument, IconNote, IconTarget, IconShield } from '@/components/icons';
import { GeneralInfoTab } from './general-info-tab';
import { JobTab } from './job-tab';
import { PerformanceTab } from './performance-tab';
import { LeaveTab } from './leave-tab';
import { DocumentsTab } from './documents-tab';
import { Field } from './shared';
import type { EmployeeDetail, PersonAccount } from './types';

const TABS = [
  { key: 'General Info', icon: <IconUser /> },
  { key: 'Job', icon: <IconBriefcase /> },
  { key: 'Leave', icon: <IconCalendar /> },
  { key: 'Documents', icon: <IconDocument /> },
  { key: 'Notes', icon: <IconNote /> },
  { key: 'Performance', icon: <IconTarget /> },
  { key: 'Permission', icon: <IconShield /> },
] as const;
type Tab = (typeof TABS)[number]['key'];

// Dashboard entries (on-leave, pending requests, etc.) deep-link here with
// ?tab=<name> so "clicking on more detail" actually lands on the relevant
// tab instead of always opening to General Info. useSearchParams needs a
// Suspense boundary around it in the app router, hence the wrapper below.
export default function PersonPage() {
  return (
    <Suspense fallback={null}>
      <PersonPageInner />
    </Suspense>
  );
}

function PersonPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, ready, call, uploadWithFields } = useApi();
  const [person, setPerson] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : 'General Info');
  // Organization's configured currency — drives salary formatting on this
  // profile (General Info, Job → Compensation), same source as Payroll.
  const [currency, setCurrency] = useState<string | null>(null);

  const load = useCallback(() => {
    return call<EmployeeDetail>(`/employees/${id}`)
      .then(setPerson)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this employee.'));
  }, [id, call]);

  useEffect(() => {
    if (!ready) return;
    load();
    call<{ currency: string | null }>('/settings/organization-branding')
      .then((b) => setCurrency(b.currency))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, load]);

  if (!ready) return null;

  // Access is enforced server-side (Admin: anyone, Supervisor: their team,
  // Employee: only themselves) — the page just surfaces whatever the API
  // says, rather than duplicating that logic here.
  if (error) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!person) return null;

  const name = `${person.firstName} ${person.lastName}`;
  const canEdit = session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  // Documents diverges from the Admin-only rule everywhere else on this
  // profile: uploading is also allowed for the employee adding to their own
  // documents (matches EmployeeDocumentsController's assertCanAdd). Editing
  // and deleting a document stay Admin/HR only, even on your own profile.
  const canAddDocuments = canEdit || session?.profile?.id === person.id;

  return (
    <div className="space-y-6">
      <button className="text-sm text-brand-blue hover:underline" onClick={() => router.push('/people')}>
        ← Back to People
      </button>

      <div className="card flex flex-wrap items-center gap-5">
        <Avatar name={name} photoUrl={person.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">{name}</h1>
          <p className="text-sm text-slate-500">
            {person.jobTitle ?? 'No title'} {person.department && `· ${person.department}`}
          </p>
          {person.account?.email && <p className="mt-1 text-xs text-slate-400">{person.account.email}</p>}
        </div>
        <StatusBadge status={person.status} kind="employee" />
      </div>

      <TabBar
        items={TABS.map((t) => ({
          key: t.key,
          label: t.key,
          icon: t.icon,
          active: tab === t.key,
          onClick: () => {
            setTab(t.key);
            // Keep the URL in sync so the tab survives a refresh/share, same
            // as landing on it via a dashboard link — replace, not push, so
            // clicking through tabs doesn't pile up in browser history.
            router.replace(t.key === 'General Info' ? `/people/${id}` : `/people/${id}?tab=${encodeURIComponent(t.key)}`);
          },
        }))}
      />

      {tab === 'General Info' && <GeneralInfoTab person={person} onSaved={setPerson} call={call} canEdit={canEdit} />}
      {tab === 'Job' && <JobTab person={person} onRefreshPerson={load} call={call} canEdit={canEdit} currency={currency} />}
      {tab === 'Leave' && <LeaveTab employeeId={person.id} call={call} />}
      {tab === 'Documents' && (
        <DocumentsTab
          employeeId={person.id}
          call={call}
          uploadWithFields={uploadWithFields}
          canAdd={canAddDocuments}
          canManage={canEdit}
        />
      )}
      {tab === 'Notes' && <NotesTab />}
      {tab === 'Performance' && <PerformanceTab person={person} call={call} canEdit={canEdit} />}
      {tab === 'Permission' && (
        <PermissionTab
          employeeId={person.id}
          account={person.account}
          canEdit={canEdit}
          isSelf={session?.profile?.id === person.id}
          viewerRole={session?.user.role ?? ''}
          call={call}
          onSaved={(account) => setPerson((p) => (p ? { ...p, account: { ...p.account, ...account } } : p))}
        />
      )}
    </div>
  );
}

function NotesTab() {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">
        Notes aren&apos;t built yet in this scaffold — planned alongside Performance review cycles in a later
        version.
      </p>
    </div>
  );
}

const EDITABLE_ROLES = ['EMPLOYEE', 'SUPERVISOR', 'HR', 'ADMIN'] as const;

/** v019.A — the role is now Admin/HR-editable in place, not just displayed.
 *  Hidden entirely (falls back to the old read-only line) for a viewer
 *  who isn't Admin or HR, and disabled when looking at your own profile —
 *  the API blocks that too, so a tenant can't end up with zero Admins from
 *  one click. An employee with no login account yet has nothing to change,
 *  so the editor doesn't render for them either — instead, below the role
 *  section, Admin/HR get a "Generate Login" button (formerly the bulk
 *  Settings → Employees action, now per-person here) that creates their
 *  sign-in from their personal email with a unique temporary password
 *  (v027.A) that must be changed at first sign-in. */
function PermissionTab({
  employeeId,
  account,
  canEdit,
  isSelf,
  viewerRole,
  call,
  onSaved,
}: {
  employeeId: string;
  account: PersonAccount | null;
  canEdit: boolean;
  isSelf: boolean;
  viewerRole: string;
  call: ReturnType<typeof useApi>['call'];
  onSaved: (account: PersonAccount) => void;
}) {
  const [role, setRole] = useState(account?.role ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ email: string; role: string; tempPassword: string } | null>(null);

  // v023.A — Account email editor (login email, distinct from the
  // employee's personal email on General Info → Personal Details).
  const [accountEmail, setAccountEmail] = useState(account?.email ?? '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);

  // v023.A — "Reset password": emails a one-time link, no password ever
  // shown here (unlike Generate Login's shared default, which the app
  // already knows — this one the recipient sets themselves).
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  useEffect(() => {
    setRole(account?.role ?? '');
  }, [account?.role]);

  useEffect(() => {
    setAccountEmail(account?.email ?? '');
    setEmailSaved(false);
  }, [account?.email]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await call<{ id: string; email: string; role: string }>(`/employees/${employeeId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      onSaved({ email: updated.email, role: updated.role });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the role.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAccountEmail() {
    setSavingEmail(true);
    setError(null);
    setEmailSaved(false);
    try {
      const updated = await call<{ id: string; email: string; role: string }>(`/employees/${employeeId}/account-email`, {
        method: 'PATCH',
        body: JSON.stringify({ email: accountEmail }),
      });
      onSaved({ email: updated.email, role: updated.role });
      setEmailSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the login email.');
    } finally {
      setSavingEmail(false);
    }
  }

  async function generateLogin() {
    setGenerating(true);
    setError(null);
    try {
      const created = await call<{ id: string; email: string; role: string; tempPassword: string }>(
        `/employees/${employeeId}/generate-login`,
        { method: 'POST' },
      );
      onSaved({ email: created.email, role: created.role, mustChangePassword: true });
      setGenerated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a login.');
    } finally {
      setGenerating(false);
    }
  }

  async function resetPassword() {
    setResettingPassword(true);
    setError(null);
    setResetSentTo(null);
    try {
      const result = await call<{ email: string }>(`/employees/${employeeId}/reset-password`, { method: 'POST' });
      setResetSentTo(result.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a reset link.');
    } finally {
      setResettingPassword(false);
    }
  }

  // v027.A — only an Admin can grant Admin or manage an Admin's login.
  const viewerIsAdmin = viewerRole === 'ADMIN';
  const targetIsAdmin = account?.role === 'ADMIN';
  const mayManage = canEdit && !!account && (viewerIsAdmin || !targetIsAdmin);
  const canEditRole = mayManage && !isSelf;
  const canEditEmail = mayManage;
  const roleOptions = EDITABLE_ROLES.filter((r) => r !== 'ADMIN' || viewerIsAdmin);

  return (
    <div className="card space-y-3">
      {canEditEmail ? (
        <div>
          <label className="label" htmlFor="permission-account-email">
            Account email
          </label>
          <div className="flex gap-2">
            <input
              id="permission-account-email"
              type="email"
              className="input max-w-xs"
              value={accountEmail}
              onChange={(e) => {
                setAccountEmail(e.target.value);
                setEmailSaved(false);
              }}
            />
            <button
              className="btn-secondary py-1.5"
              disabled={savingEmail || accountEmail.trim().toLowerCase() === account?.email.toLowerCase()}
              onClick={saveAccountEmail}
            >
              {savingEmail ? 'Saving…' : 'Save'}
            </button>
          </div>
          {emailSaved && <p className="mt-1 text-xs text-emerald-600">Login email updated.</p>}
          <p className="mt-1 text-xs text-slate-400">
            This is the email they sign in with — separate from their personal email on General Info.
          </p>
        </div>
      ) : (
        <Field label="Account email" value={account?.email} />
      )}
      {canEditRole ? (
        <div>
          <label className="label" htmlFor="permission-role">
            Role
          </label>
          <select
            id="permission-role"
            className="input max-w-xs"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setSaved(false);
            }}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Field label="Role" value={account?.role} />
      )}
      {!account && <p className="text-xs text-slate-400">This person doesn&apos;t have a login account yet.</p>}
      {account?.accessEnded && (
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          Sign-in is switched off because this person&apos;s status is Alumni. Add a new status on the Job tab to restore
          access.
        </p>
      )}
      {account && !account.accessEnded && account.mustChangePassword && (
        <p className="text-xs text-slate-400">Hasn&apos;t signed in and chosen their own password yet.</p>
      )}
      {account && targetIsAdmin && canEdit && !viewerIsAdmin && (
        <p className="text-xs text-slate-400">Only an Admin can change another Admin&apos;s account.</p>
      )}
      {!viewerIsAdmin && canEditRole && (
        <p className="text-xs text-slate-400">Only an Admin can give someone the Admin role.</p>
      )}
      {account && isSelf && canEdit && <p className="text-xs text-slate-400">You can&apos;t change your own role.</p>}

      {!account && canEdit && (
        <div className="flex justify-end pt-1">
          <button className="btn-secondary" disabled={generating} onClick={generateLogin}>
            {generating ? 'Generating…' : 'Generate Login'}
          </button>
        </div>
      )}

      {account && mayManage && !account.accessEnded && (
        <div className="flex justify-end pt-1">
          <button className="btn-secondary" disabled={resettingPassword} onClick={resetPassword}>
            {resettingPassword ? 'Sending…' : 'Reset password'}
          </button>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">Role updated.</p>}
      {generated && (
        <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">
          Login created — <span className="font-medium">{generated.email}</span> ·{' '}
          <span className="badge bg-emerald-100 text-emerald-700">{generated.role}</span> · temporary password:{' '}
          <span className="select-all font-mono">{generated.tempPassword}</span>. We&apos;ve emailed it to them; you can
          also pass it on yourself. They&apos;ll choose their own password the first time they sign in. This password
          won&apos;t be shown again.
        </p>
      )}
      {resetSentTo && (
        <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">
          Password reset link sent to <span className="font-medium">{resetSentTo}</span>. It expires in 1 hour and
          works once.
        </p>
      )}

      {canEditRole && (
        <div className="flex justify-end pt-1">
          <button className="btn-primary" disabled={saving || role === account?.role} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
