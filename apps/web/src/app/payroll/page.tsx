'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { IconTrash } from '@/components/icons';
import { type Branding, type PayRun, type Payslip, COUNTRY_CURRENCY, PAYROLL_COUNTRIES, PayslipWithDownload, RUN_STATUS, fmt, runMonth } from './shared';

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
  const router = useRouter();
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [myPayslips, setMyPayslips] = useState<Payslip[]>([]);
  const [viewYear, setViewYear] = useState<number | ''>('');
  const [viewMonth, setViewMonth] = useState<number | ''>('');
  const [viewedPayslip, setViewedPayslip] = useState<Payslip | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [payDate, setPayDate] = useState('');
  const [countryCode, setCountryCode] = useState('ZM');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

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

  /** v030.A — calculating creates a DRAFT run and opens it for review. */
  async function runPayroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRunning(true);
    try {
      const res = await call<{ payRun: PayRun }>('/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, countryCode, ...(payDate ? { payDate } : {}) }),
      });
      router.push(`/payroll/runs/${res.payRun.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payroll run failed.');
      setRunning(false);
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

  async function deleteRun(id: string) {
    if (!window.confirm('Delete this draft pay run and its payslips? Any additions or deductions it used are put back.')) return;
    try {
      await call(`/payroll/runs/${id}`, { method: 'DELETE' });
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

  const counts = runs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  const shown = statusFilter === 'ALL' ? runs : runs.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={runPayroll} className="card space-y-4">
        <div className="card-head">
          <h2 className="card-title text-sm font-semibold text-ink">Start a pay run</h2>
          <p className="text-xs text-slate-500">tmPro calculates a draft for you to review, then submit for approval.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="label" htmlFor="pr-start">Period start</label>
            <input id="pr-start" type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="pr-end">Period end</label>
            <input id="pr-end" type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="pr-pay">Pay date</label>
            <input id="pr-pay" type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} placeholder="Period end" />
          </div>
          <div>
            <label className="label" htmlFor="pr-country">Country</label>
            <select id="pr-country" className="input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              {PAYROLL_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={running}>
              {running ? 'Calculating…' : 'Calculate draft'}
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pay runs</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full px-3 py-1 font-medium ${statusFilter === st ? 'bg-[color:var(--section)] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              >
                {st === 'ALL' ? `All ${runs.length}` : `${RUN_STATUS[st].label} ${counts[st] ?? 0}`}
              </button>
            ))}
          </div>
        </div>
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Pay run</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">People</th>
                <th className="px-5 py-3 text-right font-medium">Gross</th>
                <th className="px-5 py-3 text-right font-medium">Net pay</th>
                <th className="px-5 py-3 text-right font-medium">Total cost</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const cur = COUNTRY_CURRENCY[r.countryCode] ?? branding?.currency ?? 'ZMW';
                const st = RUN_STATUS[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-600' };
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="min-w-[230px] whitespace-nowrap px-5 py-3">
                      <Link href={`/payroll/runs/${r.id}`} className="font-medium text-ink hover:text-[color:var(--section)]">
                        {r.countryCode} · {runMonth(r.periodEnd)}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {fmt(r.periodStart)} – {fmt(r.periodEnd)}
                        {r.payDate ? ` · pay date ${fmt(r.payDate)}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{r.totals?.employees ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{r.totals ? formatMoney(r.totals.gross, cur) : '—'}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-ink">{r.totals ? formatMoney(r.totals.net, cur) : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{r.totals ? formatMoney(r.totals.cost, cur) : '—'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Link href={`/payroll/runs/${r.id}`} className="text-xs font-semibold text-[color:var(--section)] hover:underline">
                        Open
                      </Link>
                      {r.status === 'DRAFT' && (
                        <button className="ml-3 align-middle text-slate-400 hover:text-red-600" onClick={() => deleteRun(r.id)} title="Delete draft" aria-label="Delete draft">
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    {runs.length === 0 ? 'No pay runs yet.' : 'No pay runs with this status.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
