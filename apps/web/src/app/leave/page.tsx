'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { EntitlementsPanel } from '@/components/leave/balance-cards';
import { LeaveRequestForm } from '@/components/leave/request-form';
import { ApprovalQueue, RequestList } from '@/components/leave/request-list';
import { LeaveOverview, LeaveRequestRow } from '@/lib/leave';

/** v028.A — Leave (v029.B: balances in a side panel): your balances, request form and history, and (for
 *  supervisors, HR and Admins) the approvals waiting on you. HR/Admin can
 *  also book leave for anyone from here. */
export default function LeavePage() {
  const { session, ready, call } = useApi();
  const [overview, setOverview] = useState<LeaveOverview | null>(null);
  const [mine, setMine] = useState<LeaveRequestRow[]>([]);
  const [queue, setQueue] = useState<{ waiting: LeaveRequestRow[]; recent: LeaveRequestRow[]; waitingOnOthers?: LeaveRequestRow[] } | null>(null);
  const [people, setPeople] = useState<Array<{ id: string; firstName: string; lastName: string; status: string }>>([]);
  const [bookFor, setBookFor] = useState('');
  const [bookOverview, setBookOverview] = useState<LeaveOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user.role;
  const isHr = role === 'ADMIN' || role === 'HR';
  const isApprover = isHr || role === 'SUPERVISOR';
  const hasProfile = !!session?.profile?.id;

  const refresh = useCallback(async () => {
    try {
      if (hasProfile) {
        const [o, r] = await Promise.all([call<LeaveOverview>('/leave/me'), call<LeaveRequestRow[]>('/leave/requests/me')]);
        setOverview(o);
        setMine(r);
      }
      if (isApprover) setQueue(await call('/leave/approvals'));
      if (isHr && people.length === 0) setPeople(await call('/employees'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load leave.');
    }
  }, [call, hasProfile, isApprover, isHr, people.length]);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  useEffect(() => {
    setBookOverview(null);
    if (bookFor) call<LeaveOverview>(`/leave/employees/${bookFor}`).then(setBookOverview).catch(() => setBookOverview(null));
  }, [bookFor, call]);

  if (!ready) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Leave</h1>
        <p className="text-sm text-slate-500">
          Balances are kept up to date automatically — annual leave accrues at the end of each month, and weekends and public
          holidays are never counted.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {isApprover && queue && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Waiting for your approval {queue.waiting.length > 0 && <span className="badge ml-1 bg-amber-50 text-amber-700">{queue.waiting.length}</span>}
          </h2>
          <ApprovalQueue rows={queue.waiting} call={call} onChange={refresh} />
          {!!queue.waitingOnOthers?.length && (
            <p className="text-xs text-slate-400">
              {queue.waitingOnOthers.length} more of your team&apos;s requests are waiting for HR.
            </p>
          )}
        </section>
      )}

      {hasProfile && overview?.employee && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your leave</h2>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <LeaveRequestForm types={overview.types} call={call} onDone={refresh} />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">Your requests</h3>
                <RequestList rows={mine} call={call} onChange={refresh} />
              </div>
            </div>
            <EntitlementsPanel types={overview.types} className="lg:sticky lg:top-6 lg:order-last order-first" />
          </div>
        </section>
      )}

      {isHr && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Book leave for someone</h2>
          <div className="card space-y-4">
            <div className="max-w-sm">
              <label className="label">Employee</label>
              <select className="input" value={bookFor} onChange={(e) => setBookFor(e.target.value)}>
                <option value="">Choose a person…</option>
                {people
                  .filter((p) => p.status !== 'ALUMNI' && p.id !== session?.profile?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
              </select>
            </div>
            {bookFor && bookOverview && (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                  <LeaveRequestForm types={bookOverview.types} call={call} employeeId={bookFor} onDone={() => {
                    refresh();
                    call<LeaveOverview>(`/leave/employees/${bookFor}`).then(setBookOverview);
                  }} compact />
                </div>
                <EntitlementsPanel types={bookOverview.types} title="Their entitlements" className="!shadow-none ring-1 ring-slate-100" />
              </div>
            )}
          </div>
        </section>
      )}

      {isApprover && queue && queue.recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent decisions</h2>
          <RequestList rows={queue.recent.slice(0, 10)} call={call} onChange={refresh} canCancelStarted={isHr} showEmployee />
        </section>
      )}
    </div>
  );
}
