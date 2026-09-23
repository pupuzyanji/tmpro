'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { fmtOrDash } from './types';

interface LeaveBalance {
  id: string;
  balanceDays: number;
  leaveType: { id: string; name: string };
}
interface LeaveRequest {
  id: string;
  status: string;
  days: number;
  startDate: string;
  endDate: string;
  leaveType: { name: string };
}

const STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED'];

export function LeaveTab({ employeeId, call }: { employeeId: string; call: ReturnType<typeof useApi>['call'] }) {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [policy, setPolicy] = useState('ALL');

  useEffect(() => {
    Promise.all([
      call<LeaveBalance[]>(`/leave/balances/employee/${employeeId}`),
      call<LeaveRequest[]>(`/leave/requests/employee/${employeeId}`),
    ])
      .then(([b, r]) => {
        setBalances(b);
        setRequests(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load leave data.'));
  }, [employeeId, call]);

  const years = useMemo(
    () => Array.from(new Set(requests.map((r) => new Date(r.startDate).getFullYear()))).sort((a, b) => b - a),
    [requests],
  );
  const policies = useMemo(() => Array.from(new Set(requests.map((r) => r.leaveType.name))).sort(), [requests]);

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        if (year !== 'ALL' && new Date(r.startDate).getFullYear().toString() !== year) return false;
        if (status !== 'ALL' && r.status !== status) return false;
        if (policy !== 'ALL' && r.leaveType.name !== policy) return false;
        return true;
      }),
    [requests, year, status, policy],
  );

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Same Option 2 layout as the Leave sidebar page: history/filters
          lead on the left, entitlements shrink into one compact list in a
          slim right-hand panel instead of a row of stat cards. Below `lg`
          this just stacks, entitlements after the request history. */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Year</label>
              <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="ALL">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ALL">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Policy</label>
              <select className="input" value={policy} onChange={(e) => setPolicy(e.target.value)}>
                <option value="ALL">All policies</option>
                {policies.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <p className="pb-2 text-sm text-slate-500">
              {filtered.length} of {requests.length} request{requests.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <p className="text-sm text-ink">
                  {r.leaveType.name} · {r.days} days · {fmtOrDash(r.startDate)} – {fmtOrDash(r.endDate)}
                </p>
                <StatusBadge status={r.status} />
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-slate-500">No leave requests match these filters.</p>}
          </div>
        </div>

        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Leave entitlements</p>
          {balances.length === 0 ? (
            <p className="text-xs text-slate-400">No leave balances on file.</p>
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
