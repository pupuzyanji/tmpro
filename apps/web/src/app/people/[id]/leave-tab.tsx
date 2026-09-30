'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { EntitlementsPanel } from '@/components/leave/balance-cards';
import { LeaveRequestForm } from '@/components/leave/request-form';
import { RequestList } from '@/components/leave/request-list';
import {
  CATEGORY_LABEL,
  day,
  ENTRY_LABEL,
  LedgerEntry,
  LeaveOverview,
  LeaveRequestRow,
  REASON_LABEL,
} from '@/lib/leave';

type Panel = 'none' | 'book' | 'adjust' | 'profile';

/** v028.A — People → Leave: the person's leave profile, balances, every
 *  ledger movement (with who/why), manual adjustments and HR booking. */
export function LeaveTab({ employeeId, call }: { employeeId: string; call: ReturnType<typeof useApi>['call'] }) {
  const { session } = useAuth();
  const isHr = session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  const [overview, setOverview] = useState<LeaveOverview | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [panel, setPanel] = useState<Panel>('none');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, l, r] = await Promise.all([
        call<LeaveOverview>(`/leave/employees/${employeeId}`),
        call<LedgerEntry[]>(`/leave/employees/${employeeId}/ledger`),
        call<LeaveRequestRow[]>(`/leave/employees/${employeeId}/requests`),
      ]);
      setOverview(o);
      setLedger(l);
      setRequests(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load leave data.');
    }
  }, [call, employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const ledgerTypes = useMemo(() => Array.from(new Set(ledger.map((e) => e.typeName))).sort(), [ledger]);
  // Zero-unit engine lines (e.g. "carried forward within the cap") are noise here.
  const filtered = ledger.filter((e) => (typeFilter === 'ALL' || e.typeName === typeFilter) && Number(e.units) !== 0);
  const visible = showAll ? filtered : filtered.slice(0, 25);

  async function reverse(id: string) {
    const note = window.prompt('Why is this adjustment being reversed?') ?? '';
    try {
      await call(`/leave/ledger/${id}/reverse`, { method: 'POST', body: JSON.stringify({ note }) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reverse.');
    }
  }

  if (!overview) return error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-400">Loading leave…</p>;
  const emp = overview.employee;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {emp && (
        <div className="card flex flex-wrap items-center justify-between gap-3 !py-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            <span>
              <span className="text-slate-400">Rules:</span> {emp.regime === 'OTHER' ? 'Other (generic)' : emp.regime}
            </span>
            <span>
              <span className="text-slate-400">Category:</span> {CATEGORY_LABEL[emp.category] ?? emp.category}
            </span>
            <span>
              <span className="text-slate-400">Contract:</span> {emp.contractTerm === 'SHORT' ? 'Short-term (≤12 months)' : 'Long-term'}
            </span>
            <span>
              <span className="text-slate-400">Service from:</span> {day(emp.serviceStart)}
            </span>
            <span>
              <span className="text-slate-400">Work week:</span> {emp.schedule}
            </span>
            {emp.leftOn && <span className="badge bg-slate-100 text-slate-600">Left {day(emp.leftOn)}</span>}
          </div>
          {isHr && (
            <div className="flex gap-2">
              <button className="btn-secondary !py-1.5" onClick={() => setPanel(panel === 'profile' ? 'none' : 'profile')}>
                Leave profile
              </button>
              <button className="btn-secondary !py-1.5" onClick={() => setPanel(panel === 'adjust' ? 'none' : 'adjust')}>
                Adjust balance
              </button>
              <button className="btn-primary !py-1.5" onClick={() => setPanel(panel === 'book' ? 'none' : 'book')}>
                Book leave
              </button>
            </div>
          )}
        </div>
      )}

      {isHr && panel === 'profile' && emp && <ProfileEditor employeeId={employeeId} emp={emp} call={call} onSaved={() => { setPanel('none'); load(); }} />}
      {isHr && panel === 'adjust' && <AdjustForm employeeId={employeeId} overview={overview} call={call} onSaved={() => { setPanel('none'); load(); }} />}
      {isHr && panel === 'book' && (
        <div className="card">
          <LeaveRequestForm types={overview.types} call={call} employeeId={employeeId} onDone={load} compact />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Requests</h3>
            <RequestList rows={requests} call={call} onChange={load} canCancelStarted={isHr} />
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Balance history</h3>
                <select className="input !w-56 !py-1.5 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="ALL">All leave types</option>
                  {ledgerTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="card overflow-x-auto !p-0">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2 font-semibold">Date</th>
                      <th className="px-4 py-2 font-semibold">Leave</th>
                      <th className="px-4 py-2 font-semibold">Movement</th>
                      <th className="px-4 py-2 text-right font-semibold">Days</th>
                      <th className="px-4 py-2 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e) => (
                      <tr key={e.id} className={`border-b border-slate-50 last:border-0 ${e.reversed ? 'text-slate-400 line-through decoration-slate-300' : ''}`}>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{day(e.effectiveDate)}</td>
                        <td className="px-4 py-2">{e.typeName}</td>
                        <td className="px-4 py-2">
                          {e.sourceType === 'OPENING_BATCH' && e.reversesId ? 'Opening reversed' : ENTRY_LABEL[e.entryType] ?? e.entryType}
                          {e.payTier && e.payTier !== 'FULL' ? <span className="ml-1 text-xs text-amber-700">({e.payTier.toLowerCase()} pay)</span> : null}
                        </td>
                        <td className={`px-4 py-2 text-right font-medium tabular-nums ${Number(e.units) >= 0 ? 'text-emerald-700' : 'text-ink'}`}>
                          {Number(e.units) > 0 ? '+' : ''}
                          {Number(e.units)}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {e.reasonCode ? `${REASON_LABEL[e.reasonCode] ?? e.reasonCode} — ` : ''}
                          {e.note ?? ''}
                          {e.createdByName && e.sourceType !== 'ENGINE' ? <span className="text-slate-400"> · by {e.createdByName}</span> : null}
                          {isHr && e.entryType === 'ADJUSTMENT' && !e.reversed && (
                            <button className="ml-2 text-xs font-medium text-brand-blue underline" onClick={() => reverse(e.id)}>
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                          No balance movements yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > 25 && (
                <button className="text-xs font-medium text-brand-blue underline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show the latest 25' : `Show all ${filtered.length} movements`}
                </button>
              )}
            </div>
          </div>
        </div>
        <EntitlementsPanel types={overview.types} className="order-first lg:order-last lg:sticky lg:top-6" />
      </div>
    </div>
  );
}

function AdjustForm({
  employeeId,
  overview,
  call,
  onSaved,
}: {
  employeeId: string;
  overview: LeaveOverview;
  call: ReturnType<typeof useApi>['call'];
  onSaved: () => void;
}) {
  const adjustable = overview.types.filter((t) => t.kind === 'ACCRUING' || t.kind === 'ALLOWANCE');
  const [leaveTypeId, setLeaveTypeId] = useState(adjustable[0]?.leaveTypeId ?? '');
  const [direction, setDirection] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reasonCode, setReasonCode] = useState('GOODWILL_GRANT');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await call(`/leave/employees/${employeeId}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({ leaveTypeId, units: (direction === '-' ? -1 : 1) * Number(amount), effectiveDate, reasonCode, note }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the adjustment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-3">
      <div className="card-head">
        <h3 className="card-title text-sm font-semibold text-ink">Adjust a balance</h3>
        <p className="text-xs text-slate-500">
          Adjustments are recorded with your name, the reason and the date — they&apos;re never edited or deleted, only reversed.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Leave type</label>
          <select className="input" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {adjustable.map((t) => (
              <option key={t.leaveTypeId} value={t.leaveTypeId}>
                {t.name} (now {t.balance ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Days</label>
          <div className="flex gap-1">
            <select className="input !w-16" value={direction} onChange={(e) => setDirection(e.target.value as '+' | '-')}>
              <option value="+">+</option>
              <option value="-">−</option>
            </select>
            <input type="number" min={0.5} step={0.5} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label">Effective date</label>
          <input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Reason</label>
          <select className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {['GOODWILL_GRANT', 'SERVICE_RECOGNITION', 'COLLECTIVE_AGREEMENT', 'COURT_OR_LABOUR_OFFICE', 'MIGRATION_CORRECTION', 'ERROR_CORRECTION', 'OTHER'].map((r) => (
              <option key={r} value={r}>
                {REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 extra days agreed for weekend cover" required />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={saving || !amount || !note.trim()}>
        {saving ? 'Saving…' : 'Save adjustment'}
      </button>
    </form>
  );
}

function ProfileEditor({
  employeeId,
  emp,
  call,
  onSaved,
}: {
  employeeId: string;
  emp: NonNullable<LeaveOverview['employee']>;
  call: ReturnType<typeof useApi>['call'];
  onSaved: () => void;
}) {
  const [serviceFrom, setServiceFrom] = useState(emp.serviceStart);
  const [scheduleId, setScheduleId] = useState('');
  const [schedules, setSchedules] = useState<Array<{ id: string; name: string; isDefault: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<Array<{ id: string; name: string; isDefault: boolean }>>('/leave/admin/schedules').then(setSchedules).catch(() => setSchedules([]));
  }, [call]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call(`/leave/employees/${employeeId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          continuousServiceFrom: serviceFrom,
          ...(scheduleId ? { workScheduleId: scheduleId === 'DEFAULT' ? null : scheduleId } : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }

  return (
    <form onSubmit={save} className="card space-y-3">
      <div className="card-head">
        <h3 className="card-title text-sm font-semibold text-ink">Leave profile</h3>
        <p className="text-xs text-slate-500">
          Service from should include time with the organisation before it joined tmPro. The contract type and length — which decide
          e.g. whether Zambian annual leave applies and which sick-pay tiers are used — come from Job → Contract (currently{' '}
          {CATEGORY_LABEL[emp.category] ?? emp.category}, {emp.contractTerm === 'SHORT' ? '12 months or less' : 'long-term'}).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Continuous service from</label>
          <input type="date" className="input" value={serviceFrom} onChange={(e) => setServiceFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Work week</label>
          <select className="input" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
            <option value="">Keep ({emp.schedule})</option>
            <option value="DEFAULT">Organisation default</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary">Save leave profile</button>
    </form>
  );
}
