'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { Avatar } from '@/components/avatar';
import { LeaveRequestRow, span, stepLabel, units } from '@/lib/leave';

type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

function payNote(r: LeaveRequestRow) {
  const b = r.payBreakdown ?? {};
  if (!b.HALF && !b.UNPAID) return null;
  return (
    <span className="text-amber-700">
      {' '}
      · pay: {b.FULL ?? 0} full{b.HALF ? `, ${b.HALF} half` : ''}
      {b.UNPAID ? `, ${b.UNPAID} unpaid` : ''}
    </span>
  );
}

/** v028.A — a person's requests, with cancel where allowed. */
export function RequestList({
  rows,
  call,
  onChange,
  canCancelStarted = false,
  showEmpty = 'No leave requests yet.',
  showEmployee = false,
}: {
  rows: LeaveRequestRow[];
  call: Call;
  onChange: () => void;
  canCancelStarted?: boolean;
  showEmpty?: string;
  showEmployee?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      await call(`/leave/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel.');
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return <p className="text-sm text-slate-500">{showEmpty}</p>;
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.map((r) => {
        const cancellable = r.status === 'PENDING' || (r.status === 'APPROVED' && (canCancelStarted || r.startDate.slice(0, 10) > today));
        return (
          <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 !py-3">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {showEmployee && r.employee && (
                  <a href={`/people/${r.employeeId}`} className="font-medium hover:underline">
                    {r.employee.firstName} {r.employee.lastName} ·{' '}
                  </a>
                )}
                <span className="font-medium">{r.leaveType.name}</span> · {units(r.days, r.leaveType.kind === 'EVENT' && r.leaveType.code === 'MATERNITY' ? 'CALENDAR_DAYS' : undefined)}
                {payNote(r)}
              </p>
              <p className="text-xs text-slate-500">
                {span(r)}
                {r.reason ? ` · ${r.reason}` : ''}
                {r.status === 'PENDING' && r.waitingFor ? ` · waiting for ${stepLabel(r.waitingFor)}` : ''}
                {r.decisionComment ? ` · “${r.decisionComment}”` : ''}
                {r.attachmentDocumentIds?.length ? ' · 📎 document attached' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={r.status} />
              {cancellable && (
                <button className="btn-secondary !py-1 text-xs" disabled={busy === r.id} onClick={() => cancel(r.id)}>
                  {busy === r.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** v028.A — requests waiting on the signed-in approver. */
export function ApprovalQueue({ rows, call, onChange }: { rows: LeaveRequestRow[]; call: Call; onChange: () => void }) {
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  async function decide(id: string, decision: 'approve' | 'decline') {
    setBusy(id);
    setError((e) => ({ ...e, [id]: '' }));
    try {
      await call(`/leave/requests/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ comment: comment[id] || undefined }) });
      onChange();
    } catch (err) {
      setError((e) => ({ ...e, [id]: err instanceof ApiError ? err.message : 'Could not save the decision.' }));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return <p className="text-sm text-slate-500">Nothing waiting on you.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const name = `${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`.trim();
        return (
          <div key={r.id} className="card space-y-2 !py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={name} />
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <a href={`/people/${r.employeeId}`} className="font-medium hover:underline">
                      {name}
                    </a>{' '}
                    · {r.leaveType.name} · {units(r.days)}
                    {payNote(r)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {span(r)}
                    {r.reason ? ` · ${r.reason}` : ''}
                    {r.approvalSteps.length > 1 ? ` · step ${r.currentStep + 1} of ${r.approvalSteps.length} (${stepLabel(r.waitingFor)})` : ''}
                    {r.attachmentDocumentIds?.length ? ' · 📎 document on their Documents tab' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input !w-44 !py-1 text-xs"
                  placeholder="Comment (optional)"
                  value={comment[r.id] ?? ''}
                  onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))}
                />
                <button className="btn-primary !py-1" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                  Approve
                </button>
                <button className="btn-secondary !py-1" disabled={busy === r.id} onClick={() => decide(r.id, 'decline')}>
                  Decline
                </button>
              </div>
            </div>
            {error[r.id] && <p className="text-xs text-red-600">{error[r.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
