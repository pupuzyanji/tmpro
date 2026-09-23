'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { fmt } from '@/lib/format';

interface LeaveType {
  id: string;
  name: string;
}
interface LeaveBalance {
  id: string;
  balanceDays: number;
  leaveType: LeaveType;
}
interface LeaveRequest {
  id: string;
  status: string;
  days: number;
  startDate: string;
  endDate: string;
  reason: string | null;
  leaveType: LeaveType;
  employee?: { firstName: string; lastName: string };
}

// Paternity/Maternity Leave are gender-restricted (General Info > Basic
// Information's Gender field) — filtered out of the request form for
// whoever can't take them, on top of the server-side check in LeaveService.
const GENDER_RESTRICTED_TYPES: Record<string, 'MALE' | 'FEMALE'> = {
  'Paternity Leave': 'MALE',
  'Maternity Leave': 'FEMALE',
};

export default function LeavePage() {
  const { session, ready, call } = useApi();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [gender, setGender] = useState<string | null>(null);
  const [teamRequests, setTeamRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user.role;
  const hasEmployeeProfile = role === 'EMPLOYEE' || role === 'SUPERVISOR';

  async function refresh() {
    if (!ready) return;
    try {
      if (hasEmployeeProfile) {
        const [balRes, reqRes, typesRes, meRes] = await Promise.all([
          call<LeaveBalance[]>('/leave/balances/me'),
          call<LeaveRequest[]>('/leave/requests/me'),
          call<LeaveType[]>('/leave/types'),
          call<{ gender: string | null }>('/employees/me'),
        ]);
        setBalances(balRes);
        setMyRequests(reqRes);
        setTypes(typesRes);
        setGender(meRes.gender);
      }
      if (role === 'SUPERVISOR') {
        setTeamRequests(await call<LeaveRequest[]>('/leave/requests/team'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load leave data.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function decide(id: string, decision: 'approve' | 'decline') {
    await call(`/leave/requests/${id}/${decision}`, { method: 'POST' });
    refresh();
  }

  if (!ready) return null;

  if (role === 'ADMIN' || role === 'HR') {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">Leave</h1>
        <p className="text-sm text-slate-500">
          Leave requests are between an employee and their supervisor. As HR Admin, open a person under{' '}
          <a className="underline" href="/people">
            People
          </a>{' '}
          to see their leave balance and history on the Leave tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Leave</h1>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Request Leave and your history lead on the left — the things you
          actually act on; every entitlement type shrinks into one compact
          list in the slim right-hand panel rather than a wall of stat
          cards. Below `lg` this just stacks: entitlements panel after the
          main column, same source order. */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-8">
          <RequestLeaveForm
            types={types.filter((t) => {
              const requiredGender = GENDER_RESTRICTED_TYPES[t.name];
              return !requiredGender || requiredGender === gender;
            })}
            onCreated={refresh}
            call={call}
          />

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your requests</h2>
            {myRequests.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div key={r.id} className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ink">
                      {r.leaveType.name} · {r.days} days
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmt(r.startDate)} – {fmt(r.endDate)} {r.reason && `· ${r.reason}`}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </div>

          {role === 'SUPERVISOR' && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Team approvals</h2>
              {teamRequests.length === 0 && <p className="text-sm text-slate-500">Nothing waiting on you.</p>}
              <div className="space-y-2">
                {teamRequests.map((r) => (
                  <div key={r.id} className="card flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`} />
                      <div>
                        <p className="text-sm text-ink">
                          <span className="font-medium">
                            {r.employee?.firstName} {r.employee?.lastName}
                          </span>{' '}
                          · {r.leaveType.name} · {r.days} days
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmt(r.startDate)} – {fmt(r.endDate)} {r.reason && `· ${r.reason}`}
                        </p>
                      </div>
                    </div>
                    {r.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <button className="btn-primary py-1" onClick={() => decide(r.id, 'approve')}>
                          Approve
                        </button>
                        <button className="btn-secondary py-1" onClick={() => decide(r.id, 'decline')}>
                          Decline
                        </button>
                      </div>
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Your entitlements</p>
          {balances.length === 0 ? (
            <p className="text-xs text-slate-400">No entitlements configured yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {balances.map((b) => (
                <div key={b.id} className="flex items-baseline justify-between gap-2 py-2">
                  <span className="text-xs leading-snug text-slate-500">{b.leaveType.name}</span>
                  <span className="whitespace-nowrap text-sm font-semibold text-ink">
                    {b.balanceDays}
                    <span className="text-[10px] font-medium text-slate-400"> d</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestLeaveForm({
  types,
  onCreated,
  call,
}: {
  types: LeaveType[];
  onCreated: () => void;
  call: ReturnType<typeof useApi>['call'];
}) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leaveTypeId && types.length > 0) setLeaveTypeId(types[0].id);
  }, [types, leaveTypeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await call('/leave/requests', {
        method: 'POST',
        body: JSON.stringify({ leaveTypeId, startDate, endDate, days, reason: reason || undefined }),
      });
      setStartDate('');
      setEndDate('');
      setDays(1);
      setReason('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Request leave</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Type</label>
          <select className="input" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Start</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">End</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Days</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className="input"
            value={days}
            onChange={(e) => setDays(parseFloat(e.target.value))}
          />
        </div>
      </div>
      <div>
        <label className="label">Reason (optional)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={submitting || !leaveTypeId}>
        {submitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
