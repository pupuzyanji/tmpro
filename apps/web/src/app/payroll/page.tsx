'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { IconChevronRight, IconPencil, IconTrash } from '@/components/icons';
import { type Branding, type PayRun, type Payslip, PayslipWithDownload, fmt } from './shared';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

function monthLabel(m: number) {
  return MONTHS.find((x) => x.value === m)?.label ?? String(m);
}

/** Every (year, month) that has at least one of this employee's own
 *  payslips on file, newest first — grouped by periodEnd, the same field
 *  Regulatory Submissions groups pay runs by. Keeps the Month dropdown
 *  restricted to periods payroll has actually been run for, instead of
 *  every calendar month existing. */
function usePayslipPeriodOptions(payslips: Payslip[]) {
  return useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    for (const p of payslips) {
      const d = new Date(p.periodEnd);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      seen.set(`${year}-${month}`, { year, month });
    }
    return Array.from(seen.values()).sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [payslips]);
}

export default function PayrollPage() {
  const { session, ready, call } = useApi();
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [myPayslips, setMyPayslips] = useState<Payslip[]>([]);
  const [viewYear, setViewYear] = useState<number | ''>('');
  const [viewMonth, setViewMonth] = useState<number | ''>('');
  const [viewedPayslip, setViewedPayslip] = useState<Payslip | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runPayslips, setRunPayslips] = useState<Payslip[]>([]);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [countryCode, setCountryCode] = useState('ZM');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editStatus, setEditStatus] = useState('DRAFT');

  const isAdmin = session?.user.role === 'ADMIN' || session?.user.role === 'HR';

  async function refresh() {
    if (!ready) return;
    try {
      if (isAdmin) {
        setRuns(await call<PayRun[]>('/payroll/runs'));
      } else {
        const mine = await call<Payslip[]>('/payroll/payslips/me');
        setMyPayslips(mine);
        // Default the pickers to the most recent period on file so they
        // never sit on an empty "—" when payslips already exist.
        if (mine.length > 0) {
          const latest = [...mine].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0];
          const d = new Date(latest.periodEnd);
          setViewYear(d.getFullYear());
          setViewMonth(d.getMonth() + 1);
        }
      }
      setBranding(await call<Branding>('/settings/organization-branding').catch(() => null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load payroll data.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function runPayroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRunning(true);
    try {
      await call('/payroll/runs', { method: 'POST', body: JSON.stringify({ periodStart, periodEnd, countryCode }) });
      setPeriodStart('');
      setPeriodEnd('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payroll run failed.');
    } finally {
      setRunning(false);
    }
  }

  async function selectRun(runId: string) {
    if (selectedRunId === runId) {
      setSelectedRunId(null);
      setExpandedEmployeeId(null);
      return;
    }
    setSelectedRunId(runId);
    setExpandedEmployeeId(null);
    try {
      setRunPayslips(await call<Payslip[]>(`/payroll/runs/${runId}/payslips`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load payslips for this run.');
    }
  }

  function viewPayslip() {
    if (viewYear === '' || viewMonth === '') return;
    const match = [...myPayslips]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .find((p) => {
        const d = new Date(p.periodEnd);
        return d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth;
      });
    setViewedPayslip(match ?? null);
  }

  function startEditRun(r: PayRun) {
    setEditingRunId(r.id);
    setEditStart(r.periodStart.slice(0, 10));
    setEditEnd(r.periodEnd.slice(0, 10));
    setEditStatus(r.status);
  }

  async function saveRunEdit() {
    if (!editingRunId) return;
    try {
      await call(`/payroll/runs/${editingRunId}`, {
        method: 'PATCH',
        body: JSON.stringify({ periodStart: editStart, periodEnd: editEnd, status: editStatus }),
      });
      setEditingRunId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that pay run.');
    }
  }

  async function deleteRun(id: string) {
    if (!window.confirm('Delete this pay run and all its payslips? This cannot be undone.')) return;
    try {
      await call(`/payroll/runs/${id}`, { method: 'DELETE' });
      if (selectedRunId === id) {
        setSelectedRunId(null);
        setRunPayslips([]);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that pay run.');
    }
  }

  if (!ready) return null;

  if (!isAdmin) {
    return (
      <YourPayslips
        myPayslips={myPayslips}
        branding={branding}
        error={error}
        viewYear={viewYear}
        viewMonth={viewMonth}
        setViewYear={(y) => {
          setViewYear(y);
          setViewMonth('');
          setViewedPayslip(null);
        }}
        setViewMonth={(m) => {
          setViewMonth(m);
          setViewedPayslip(null);
        }}
        viewedPayslip={viewedPayslip}
        onView={viewPayslip}
      />
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={runPayroll} className="card grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Period start</label>
          <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
        </div>
        <div>
          <label className="label">Period end</label>
          <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
        </div>
        <div>
          <label className="label">Country</label>
          <select className="input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            <option value="ZM">ZM — native (default)</option>
            <option value="NZ">NZ — native</option>
            <option value="AU">AU — not yet built</option>
            <option value="US">US — partner-routed</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={running}>
            {running ? 'Running…' : 'Run payroll'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pay runs</h2>
        <p className="text-xs text-slate-400">Select a run to see a summary line for every employee on it. Runs can be edited or deleted.</p>
        <div className="space-y-2">
          {runs.map((r) => (
            <div key={r.id} className="space-y-2">
              {editingRunId === r.id ? (
                <div className="card grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="label">Period start</label>
                    <input type="date" className="input" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Period end</label>
                    <input type="date" className="input" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="DRAFT">DRAFT</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="PAID">PAID</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button className="btn-primary" onClick={saveRunEdit}>
                      Save
                    </button>
                    <button className="btn-secondary" onClick={() => setEditingRunId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`card flex w-full items-center justify-between text-left hover:bg-slate-50/60 ${
                    selectedRunId === r.id ? 'ring-2 ring-brand-blue/40' : ''
                  }`}
                >
                  <button className="flex-1 text-left" onClick={() => selectRun(r.id)}>
                    <p className="text-sm text-ink">
                      {r.countryCode} · {fmt(r.periodStart)} – {fmt(r.periodEnd)}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="badge bg-slate-100 text-slate-600">{r.status}</span>
                    <button className="text-slate-400 hover:text-ink" onClick={() => startEditRun(r)} title="Edit">
                      <IconPencil />
                    </button>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => deleteRun(r.id)} title="Delete">
                      <IconTrash />
                    </button>
                  </div>
                </div>
              )}
              {selectedRunId === r.id && (
                <div className="card overflow-hidden !p-0">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3 font-medium">Employee</th>
                        <th className="px-5 py-3 font-medium">Department</th>
                        <th className="px-5 py-3 font-medium">Gross</th>
                        <th className="px-5 py-3 font-medium">Net pay</th>
                        <th className="px-5 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {runPayslips.map((p) => (
                        <Fragment key={p.id}>
                          <tr
                            className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                            onClick={() => setExpandedEmployeeId(expandedEmployeeId === p.employeeId ? null : p.employeeId)}
                          >
                            <td className="px-5 py-3 font-medium text-ink">
                              {p.employeeFirstName} {p.employeeLastName}
                            </td>
                            <td className="px-5 py-3 text-slate-600">{p.department ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-600">{formatMoney(p.grossPay, branding?.currency)}</td>
                            <td className="px-5 py-3 font-medium text-ink">{formatMoney(p.netPay, branding?.currency)}</td>
                            <td className="px-5 py-3 text-right text-slate-400">
                              <span
                                className={`inline-block transition-transform ${expandedEmployeeId === p.employeeId ? 'rotate-90' : ''}`}
                              >
                                <IconChevronRight />
                              </span>
                            </td>
                          </tr>
                          {expandedEmployeeId === p.employeeId && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50/60 px-5 py-4">
                                <PayslipWithDownload payslip={p} branding={branding} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                      {runPayslips.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                            No payslips on this run.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {runs.length === 0 && <p className="text-sm text-slate-500">No pay runs yet.</p>}
        </div>
      </div>
    </div>
  );
}

/** The Employee/Supervisor self-service view. Rather than stacking every
 *  payslip the person has ever had on one long page, a Month/Year picker
 *  (restricted to periods payroll has actually been run for, same pattern
 *  as Regulatory Submissions' picker) plus a "View Payslip" button reveals
 *  one payslip at a time below it, with the existing Print action. */
function YourPayslips({
  myPayslips,
  branding,
  error,
  viewYear,
  viewMonth,
  setViewYear,
  setViewMonth,
  viewedPayslip,
  onView,
}: {
  myPayslips: Payslip[];
  branding: Branding | null;
  error: string | null;
  viewYear: number | '';
  viewMonth: number | '';
  setViewYear: (y: number) => void;
  setViewMonth: (m: number) => void;
  viewedPayslip: Payslip | null;
  onView: () => void;
}) {
  const options = usePayslipPeriodOptions(myPayslips);
  const years = Array.from(new Set(options.map((o) => o.year))).sort((a, b) => b - a);
  const monthsForYear = options.filter((o) => o.year === viewYear).map((o) => o.month);

  return (
    <>
      <h1 className="text-xl font-semibold text-ink">Your payslips</h1>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {myPayslips.length === 0 ? (
        <p className="text-sm text-slate-500">No payslips yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Month</label>
              <select
                className="input"
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                disabled={!viewYear}
              >
                <option value="">—</option>
                {monthsForYear.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={viewYear} onChange={(e) => setViewYear(parseInt(e.target.value, 10))}>
                <option value="">—</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary" disabled={!viewYear || !viewMonth} onClick={onView}>
              View Payslip
            </button>
          </div>

          {viewedPayslip ? (
            <PayslipWithDownload payslip={viewedPayslip} branding={branding} />
          ) : (
            <p className="text-sm text-slate-500">Choose a month and year, then click &quot;View Payslip&quot;.</p>
          )}
        </div>
      )}
    </>
  );
}
