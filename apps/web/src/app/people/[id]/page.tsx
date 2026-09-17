'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { GeneralInfoTab } from './general-info-tab';
import { JobTab } from './job-tab';
import { PerformanceTab } from './performance-tab';
import { LeaveTab } from './leave-tab';
import { DocumentsTab } from './documents-tab';
import { Field } from './shared';
import type { EmployeeDetail } from './types';

const TABS = ['General Info', 'Job', 'Leave', 'Documents', 'Notes', 'Performance', 'Permission'] as const;
type Tab = (typeof TABS)[number];

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, ready, call, uploadWithFields } = useApi();
  const [person, setPerson] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('General Info');
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
  // profile: upload/delete is also allowed for the employee managing their
  // own documents (matches EmployeeDocumentsController on the API side).
  const canEditDocuments = canEdit || session?.profile?.id === person.id;

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

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'General Info' && (
        <GeneralInfoTab
          person={person}
          onSaved={setPerson}
          call={call}
          canEdit={canEdit}
          canEditSalary={canEdit}
          currency={currency}
        />
      )}
      {tab === 'Job' && <JobTab person={person} onRefreshPerson={load} call={call} canEdit={canEdit} currency={currency} />}
      {tab === 'Leave' && <LeaveTab employeeId={person.id} call={call} />}
      {tab === 'Documents' && (
        <DocumentsTab employeeId={person.id} call={call} uploadWithFields={uploadWithFields} canEdit={canEditDocuments} />
      )}
      {tab === 'Notes' && <NotesTab />}
      {tab === 'Performance' && <PerformanceTab person={person} call={call} canEdit={canEdit} />}
      {tab === 'Permission' && (
        <PermissionTab
          employeeId={person.id}
          account={person.account}
          canEdit={canEdit}
          isSelf={session?.profile?.id === person.id}
          call={call}
          onSaved={(account) => setPerson((p) => (p ? { ...p, account } : p))}
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
 *  so the editor doesn't render for them either. */
function PermissionTab({
  employeeId,
  account,
  canEdit,
  isSelf,
  call,
  onSaved,
}: {
  employeeId: string;
  account: { email: string; role: string } | null;
  canEdit: boolean;
  isSelf: boolean;
  call: ReturnType<typeof useApi>['call'];
  onSaved: (account: { email: string; role: string }) => void;
}) {
  const [role, setRole] = useState(account?.role ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(account?.role ?? '');
  }, [account?.role]);

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

  const canEditRole = canEdit && !!account && !isSelf;

  return (
    <div className="card space-y-3">
      <Field label="Account email" value={account?.email} />
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
            {EDITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Field label="Role" value={account?.role} />
      )}
      {!account && (
        <p className="text-xs text-slate-400">This person doesn&apos;t have a login account yet.</p>
      )}
      {account && isSelf && canEdit && (
        <p className="text-xs text-slate-400">You can&apos;t change your own role.</p>
      )}
      {canEditRole && (
        <>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {saved && <p className="text-xs text-emerald-600">Role updated.</p>}
          <div className="flex justify-end pt-1">
            <button className="btn-primary" disabled={saving || role === account?.role} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
