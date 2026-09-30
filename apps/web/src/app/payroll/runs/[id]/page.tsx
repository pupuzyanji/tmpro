'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { IconX } from '@/components/icons';
import {
  type Branding,
  type PayRun,
  type Payslip,
  type RunTotals,
  COUNTRY_CURRENCY,
  EMPLOYER_LABELS,
  PayslipWithDownload,
  RUN_STATUS,
  STATUTORY_LABELS,
  fmt,
  labelFor,
  runMonth,
} from '../../shared';

// v030.A — one pay run: stages, totals against the previous run, checks,
// approvals, the employee grid, reports and history.

type Severity = 'BLOCK' | 'CHECK' | 'INFO';
interface RunCheck {
  code: string;
  severity: Severity;
  employeeId: string | null;
  title: string;
  detail: string;
}
interface RunEvent {
  id: string;
  action: string;
  level: number | null;
  actorName: string | null;
  comment: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}
interface RunDetail {
  run: PayRun & {
    calculatedAt: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    paidAt: string | null;
    approvalReasons: string[];
  };
  preparedBy: string | null;
  totals: RunTotals;
  previous: { id: string; periodStart: string; periodEnd: string; status: string; totals: RunTotals; netByEmployee: Record<string, number> } | null;
  checks: RunCheck[];
  events: RunEvent[];
  approval: {
    required: number;
    reasons: string[];
    given: Array<{ level: number | null; name: string | null; at: string; comment: string | null }>;
    nextLevel: number;
    approvers: Array<{ name: string; level: '1' | '2' | 'ANY'; jobTitle: string | null }>;
    sendBackNeedsComment: boolean;
  };
  can: {
    recalculate: boolean;
    edit: boolean;
    delete: boolean;
    submit: boolean;
    withdraw: boolean;
    approve: boolean;
    approveReason: string | null;
    sendBack: boolean;
    reopen: boolean;
    markPaid: boolean;
  };
}

type Action = 'submit' | 'approve' | 'send-back' | 'reopen' | 'withdraw' | null;

const SEVERITY: Record<Severity, { label: string; bg: string; text: string; dot: string }> = {
  BLOCK: { label: 'Must fix', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  CHECK: { label: 'Check', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  INFO: { label: 'For information', bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
};

/** Several people with the same kind of check read as one line. */
const GROUP_TITLE: Record<string, (n: number) => string> = {
  NO_TAX_ID: (n) => `${n} employees have no tax ID`,
  NO_SSN: (n) => `${n} employees have no social security number`,
  NO_NHI: (n) => `${n} employees have no NHIMA number`,
  NEW: (n) => `${n} employees are new on this payroll`,
  PRORATED: (n) => `${n} employees are paid for part of the period`,
  ADJUSTMENT: (n) => `${n} additions and deductions are included`,
  NOT_PAID: (n) => `${n} active employees are not on this run`,
};

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Calculated',
  RECALCULATED: 'Recalculated',
  SUBMITTED: 'Submitted for approval',
  APPROVED: 'Approved',
  SENT_BACK: 'Sent back',
  REOPENED: 'Reopened',
  PAID: 'Marked as paid',
};

function pctChange(now: number, before: number | null | undefined) {
  if (before == null || before === 0) return null;
  return ((now - before) / before) * 100;
}

function Delta({ now, before, label = 'vs previous' }: { now: number; before?: number | null; label?: string }) {
  const p = pctChange(now, before);
  if (p == null) return <span className="text-slate-400">No previous run</span>;
  if (Math.abs(p) < 0.05) return <span>No change {label}</span>;
  return (
    <span>
      {p > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% {label}
    </span>
  );
}

function day(iso: string | null | undefined) {
  return iso ? fmt(iso) : '—';
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Row {
  p: Payslip;
  name: string;
  department: string;
  basic: number;
  allowances: number;
  additions: number;
  otherDed: number;
  employer: number;
  cost: number;
  prevNet: number | null;
  change: number | null;
  flagged: boolean;
}

export default function PayRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, call } = useApi();
  const [d, setD] = useState<RunDetail | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [comment, setComment] = useState('');
  const [ack, setAck] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Payslip | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, list] = await Promise.all([call<RunDetail>(`/payroll/runs/${id}`), call<Payslip[]>(`/payroll/runs/${id}/payslips/all`)]);
      setD(detail);
      setSlips(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this pay run.');
    }
  }, [call, id]);

  useEffect(() => {
    if (!ready) return;
    load();
    call<Branding>('/settings/organization-branding').then(setBranding).catch(() => setBranding(null));
  }, [ready, load, call]);

  const currency = d ? COUNTRY_CURRENCY[d.run.countryCode] ?? branding?.currency ?? 'ZMW' : 'ZMW';
  const money = (n: number) => formatMoney(n, currency);

  const flaggedIds = useMemo(() => new Set((d?.checks ?? []).filter((c) => c.severity !== 'INFO' && c.employeeId).map((c) => c.employeeId as string)), [d]);

  const rows: Row[] = useMemo(() => {
    if (!d) return [];
    return slips
      .map((p) => {
        const c = (p.components ?? {}) as Record<string, unknown> & { earnings?: Record<string, number>; employer?: Record<string, number> };
        const e = c.earnings ?? {};
        const adj = p.adjustments ?? [];
        const nonTaxable = adj.filter((a) => a.type === 'ADDITION' && !a.taxable).reduce((s, a) => s + a.amount, 0);
        const otherDed = adj.filter((a) => a.type === 'DEDUCTION').reduce((s, a) => s + a.amount, 0);
        const employer = Object.values(c.employer ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
        const prevNet = d.previous?.netByEmployee[p.employeeId] ?? null;
        return {
          p,
          name: `${p.employeeFirstName} ${p.employeeLastName}`,
          department: p.department ?? 'No department',
          basic: e.basicSalary ?? p.grossPay,
          allowances: (e.housingAllowance ?? 0) + (e.transportAllowance ?? 0) + (e.lunchAllowance ?? 0) + (e.otherAllowance ?? 0),
          additions: (e.taxableAdditions ?? 0) + nonTaxable,
          otherDed,
          employer,
          cost: p.grossPay + nonTaxable + employer,
          prevNet,
          change: pctChange(p.netPay, prevNet),
          flagged: flaggedIds.has(p.employeeId),
        };
      })
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
  }, [slips, d, flaggedIds]);

  const departments = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.department, (m.get(r.department) ?? 0) + 1));
    return [...m.entries()];
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === 'FLAGGED' && !r.flagged) return false;
    if (filter !== 'ALL' && filter !== 'FLAGGED' && r.department !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${r.name} ${r.p.employeeCode ?? ''}`.toLowerCase().includes(q);
  });

  const statutory = useMemo(() => {
    const emp = new Map<string, number>();
    const er = new Map<string, number>();
    for (const p of slips) {
      const c = (p.components ?? {}) as { statutory?: Record<string, number>; employer?: Record<string, number> };
      Object.entries(c.statutory ?? {}).forEach(([k, v]) => emp.set(k, (emp.get(k) ?? 0) + (Number(v) || 0)));
      Object.entries(c.employer ?? {}).forEach(([k, v]) => er.set(k, (er.get(k) ?? 0) + (Number(v) || 0)));
    }
    return { employee: [...emp.entries()], employer: [...er.entries()] };
  }, [slips]);

  async function act(path: string, body?: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await call(`/payroll/runs/${id}${path}`, { method: path === '' ? 'DELETE' : 'POST', body: body ? JSON.stringify(body) : undefined });
      setAction(null);
      setComment('');
      setAck(false);
      if (after) after();
      else await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;
  if (!d) return error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-400">Loading pay run…</p>;

  const { run, totals, previous, checks, approval, can } = d;
  const pt = previous?.totals;
  const status = RUN_STATUS[run.status] ?? { label: run.status, cls: 'bg-slate-100 text-slate-600' };
  const blocks = checks.filter((c) => c.severity === 'BLOCK');
  const toCheck = checks.filter((c) => c.severity === 'CHECK');
  const infos = checks.filter((c) => c.severity === 'INFO');

  const steps = [
    { key: 'DRAFT', label: 'Prepare & review' },
    { key: 'SUBMITTED', label: approval.required > 1 && run.status === 'SUBMITTED' ? `Approval ${approval.given.length} of ${approval.required}` : 'Awaiting approval' },
    { key: 'APPROVED', label: 'Approved & locked' },
    { key: 'PAID', label: 'Paid' },
  ];
  const at = steps.findIndex((s) => s.key === run.status);

  const kpis: Array<{ label: string; now: number; before?: number; strong?: boolean }> = [
    { label: 'Gross pay', now: totals.gross, before: pt?.gross },
    { label: 'Tax', now: totals.tax, before: pt?.tax },
    { label: 'Employee deductions', now: totals.employeeDeductions, before: pt?.employeeDeductions },
    { label: 'Net pay', now: totals.net, before: pt?.net },
    { label: 'Employer contributions', now: totals.employer, before: pt?.employer },
    { label: 'Total employer cost', now: totals.cost, before: pt?.cost, strong: true },
  ];

  const g2n = [
    { label: 'Net pay', v: totals.net, cls: 'bg-[color:var(--section)]' },
    { label: 'Tax', v: totals.tax, cls: 'bg-orange-400' },
    { label: 'Statutory deductions', v: totals.statutoryDeductions, cls: 'bg-sky-400' },
    { label: 'Other deductions', v: totals.otherDeductions, cls: 'bg-slate-400' },
  ].filter((x) => x.v > 0);
  const g2nTotal = g2n.reduce((s, x) => s + x.v, 0) || 1;

  function groupChecks(list: RunCheck[]) {
    const byCode = new Map<string, RunCheck[]>();
    list.forEach((c) => byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]));
    const out: Array<{ key: string; severity: Severity; title: string; detail: string; items: RunCheck[] }> = [];
    byCode.forEach((items, code) => {
      if (items.length > 1 && GROUP_TITLE[code]) out.push({ key: code, severity: items[0].severity, title: GROUP_TITLE[code](items.length), detail: items[0].detail, items });
      else items.forEach((c, i) => out.push({ key: `${code}-${i}`, severity: c.severity, title: c.title, detail: c.detail, items: [] }));
    });
    return out;
  }

  function registerCsv() {
    const head = ['Employee', 'Employee number', 'Department', 'Basic', 'Allowances', 'Additions', 'Gross', 'Tax', 'Statutory deductions', 'Other deductions', 'Net pay', 'Employer contributions', 'Total cost'];
    const body = rows.map((r) => [r.name, r.p.employeeCode ?? '', r.department, r.basic, r.allowances, r.additions, r.p.grossPay, r.p.tax, r.p.deductions, r.otherDed, r.p.netPay, r.employer, r.cost].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)));
    downloadCsv(`payroll-register-${run.countryCode}-${run.periodEnd.slice(0, 7)}.csv`, [head, ...body, ['Totals', '', '', '', '', '', totals.gross.toFixed(2), totals.tax.toFixed(2), totals.statutoryDeductions.toFixed(2), totals.otherDeductions.toFixed(2), totals.net.toFixed(2), totals.employer.toFixed(2), totals.cost.toFixed(2)]]);
  }
  function varianceCsv() {
    const head = ['Employee', 'Department', 'Net previous', 'Net now', 'Change', 'Change %'];
    const body = rows.map((r) => [r.name, r.department, r.prevNet == null ? 'new' : r.prevNet.toFixed(2), r.p.netPay.toFixed(2), r.prevNet == null ? '' : (r.p.netPay - r.prevNet).toFixed(2), r.change == null ? '' : r.change.toFixed(1)]);
    downloadCsv(`payroll-variance-${run.countryCode}-${run.periodEnd.slice(0, 7)}.csv`, [head, ...body]);
  }
  function departmentCsv() {
    const m = new Map<string, { n: number; gross: number; net: number; cost: number }>();
    rows.forEach((r) => {
      const x = m.get(r.department) ?? { n: 0, gross: 0, net: 0, cost: 0 };
      m.set(r.department, { n: x.n + 1, gross: x.gross + r.p.grossPay, net: x.net + r.p.netPay, cost: x.cost + r.cost });
    });
    downloadCsv(`payroll-departments-${run.countryCode}-${run.periodEnd.slice(0, 7)}.csv`, [
      ['Department', 'Employees', 'Gross', 'Net pay', 'Total cost'],
      ...[...m.entries()].map(([k, v]) => [k, v.n, v.gross.toFixed(2), v.net.toFixed(2), v.cost.toFixed(2)]),
    ]);
  }

  const actionPanel = action && (
    <div className="card space-y-3 ring-2 ring-[color:var(--section)]/30">
      <div className="card-head">
        <h2 className="card-title text-sm font-semibold text-ink">
          {action === 'submit' && 'Submit for approval'}
          {action === 'approve' && `Approve${approval.required > 1 ? ` (level ${approval.nextLevel} of ${approval.required})` : ''}`}
          {action === 'send-back' && 'Send back to the preparer'}
          {action === 'reopen' && 'Reopen this approved run'}
          {action === 'withdraw' && 'Withdraw from approval'}
        </h2>
        <p className="text-xs text-slate-500">
          {action === 'submit' && 'The approvers are emailed. The run is locked for changes while it waits.'}
          {action === 'approve' && (approval.given.length + 1 >= approval.required ? 'Your approval locks the run.' : 'A second approver is needed after you.')}
          {action === 'send-back' && 'The run goes back to draft so it can be corrected and resubmitted.'}
          {action === 'reopen' && 'The run goes back to draft and its approvals are cleared. The reason is kept in the history.'}
          {action === 'withdraw' && 'The run goes back to draft. Approvals given so far are cleared.'}
        </p>
      </div>
      {action === 'submit' && toCheck.length > 0 && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            I have reviewed the {toCheck.length} item{toCheck.length === 1 ? '' : 's'} marked “Check”.
            {approval.reasons.length === 0 && ' Accepting them may mean a second approval is needed.'}
          </span>
        </label>
      )}
      <div>
        <label className="label" htmlFor="run-comment">
          {action === 'reopen' ? 'Reason (required)' : action === 'send-back' && approval.sendBackNeedsComment ? 'Comment (required)' : 'Comment (optional)'}
        </label>
        <textarea id="run-comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          className={action === 'send-back' ? 'btn border border-red-200 bg-white text-red-700 hover:bg-red-50' : 'btn-primary'}
          disabled={busy || (action === 'submit' && toCheck.length > 0 && !ack) || (action === 'reopen' && !comment.trim()) || (action === 'send-back' && approval.sendBackNeedsComment && !comment.trim())}
          onClick={() => act(`/${action}`, action === 'submit' ? { comment, acknowledgeChecks: ack } : { comment })}
        >
          {busy ? 'Saving…' : { submit: 'Submit', approve: 'Approve', 'send-back': 'Send back', reopen: 'Reopen', withdraw: 'Withdraw' }[action]}
        </button>
        <button className="btn-secondary" onClick={() => setAction(null)}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/payroll" className="hover:text-ink">
          Payroll
        </Link>{' '}
        › <span className="text-ink">{runMonth(run.periodEnd)}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-ink">
              {runMonth(run.periodEnd)} pay run
            </h1>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>
              {run.countryCode} · {currency}
            </span>
            <span>
              {day(run.periodStart)} – {day(run.periodEnd)}
            </span>
            <span>Pay date {day(run.payDate ?? run.periodEnd)}</span>
            <span>{totals.employees} employees</span>
            {run.calculatedAt && (
              <span>
                Calculated {when(run.calculatedAt)}
                {d.preparedBy ? ` by ${d.preparedBy}` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none">Reports ▾</summary>
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-100 bg-white p-1.5 text-sm shadow-lg">
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={registerCsv}>
                Payroll register (CSV)
              </button>
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={varianceCsv} disabled={!previous}>
                Variance vs previous run (CSV)
              </button>
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={departmentCsv}>
                Department summary (CSV)
              </button>
            </div>
          </details>
          {can.recalculate && (
            <button className="btn-secondary" disabled={busy} onClick={() => act('/recalculate')}>
              Recalculate
            </button>
          )}
          {can.delete && (
            <button
              className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={() => window.confirm('Delete this draft pay run? Any additions or deductions it used are put back.') && act('', undefined, () => router.push('/payroll'))}
            >
              Delete
            </button>
          )}
          {can.withdraw && (
            <button className="btn-secondary" onClick={() => setAction('withdraw')}>
              Withdraw
            </button>
          )}
          {can.sendBack && (
            <button className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => setAction('send-back')}>
              Send back…
            </button>
          )}
          {can.reopen && (
            <button className="btn-secondary" onClick={() => setAction('reopen')}>
              Reopen…
            </button>
          )}
          {run.status === 'DRAFT' && (
            <button className="btn-primary" disabled={!can.submit} title={blocks.length ? 'Fix the items marked “Must fix” first' : undefined} onClick={() => setAction('submit')}>
              Submit for approval
            </button>
          )}
          {run.status === 'SUBMITTED' && (
            <button className="btn-primary" disabled={!can.approve} title={can.approveReason ?? undefined} onClick={() => setAction('approve')}>
              Approve
            </button>
          )}
          {can.markPaid && (
            <button className="btn-primary" disabled={busy} onClick={() => window.confirm('Mark this run as paid? It can no longer be reopened.') && act('/mark-paid')}>
              Mark as paid
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <ol className="card flex flex-wrap items-center gap-3 !py-4" aria-label="Pay run stages">
        {steps.map((s, i) => {
          const done = i < at || run.status === 'PAID';
          const current = i === at && run.status !== 'PAID';
          return (
            <li key={s.key} className="flex flex-1 items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? 'bg-emerald-600 text-white' : current ? 'bg-[color:var(--section)] text-white' : 'border border-slate-300 text-slate-400'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`whitespace-nowrap text-sm font-semibold ${done || current ? 'text-ink' : 'text-slate-400'}`}>{s.label}</span>
              {i < steps.length - 1 && <span className="h-px min-w-6 flex-1 bg-slate-200" />}
            </li>
          );
        })}
        {run.status === 'DRAFT' && blocks.length > 0 && (
          <li className="text-xs font-semibold text-red-600">
            {blocks.length} issue{blocks.length === 1 ? '' : 's'} to fix before submitting
          </li>
        )}
        {run.status === 'SUBMITTED' && !can.approve && can.approveReason && <li className="text-xs text-slate-500">{can.approveReason}</li>}
      </ol>

      {run.status === 'APPROVED' || run.status === 'PAID' ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong className="font-semibold">
            Approved{approval.given.length ? ` by ${approval.given.map((g) => g.name).join(' and ')}` : ''}
            {run.approvedAt ? ` on ${when(run.approvedAt)}` : ''}.
          </strong>{' '}
          {run.status === 'PAID'
            ? `Marked as paid${run.paidAt ? ` on ${when(run.paidAt)}` : ''}. The figures are final.`
            : 'The figures are locked. Reopening needs an approver and a reason, and clears the approvals.'}
        </p>
      ) : null}

      {actionPanel}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl p-4 ${k.strong ? 'bg-[#0f1a4d] text-white' : 'border border-slate-100 bg-white shadow-card'}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${k.strong ? 'text-indigo-200' : 'text-slate-500'}`}>{k.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${k.strong ? 'text-white' : 'text-ink'}`}>{money(k.now)}</p>
            <p className={`mt-0.5 text-xs ${k.strong ? 'text-indigo-200' : 'text-slate-500'}`}>
              <Delta now={k.now} before={k.before} />
            </p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card space-y-2.5">
          <div className="card-head flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-sm font-semibold text-ink">{run.status === 'DRAFT' ? 'Checks before submitting' : 'Checks'}</h2>
            <span className="text-xs text-slate-500">
              {blocks.length} to fix · {toCheck.length} to check · {infos.length} for information
            </span>
          </div>
          {checks.length === 0 && <p className="text-sm text-slate-500">Nothing to flag on this run.</p>}
          {groupChecks([...blocks, ...toCheck, ...(showInfo ? infos : infos.slice(0, 3))]).map((g) => {
            const sv = SEVERITY[g.severity];
            return (
              <div key={g.key} className={`flex gap-3 rounded-xl px-3.5 py-3 ${sv.bg}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sv.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className={`mr-2 text-[11px] font-bold uppercase tracking-wide ${sv.text}`}>{sv.label}</span>
                    <span className="font-semibold text-ink">{g.title}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{g.detail}</p>
                  {g.items.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {g.items
                        .map((c) => rows.find((r) => r.p.employeeId === c.employeeId)?.name ?? c.title.split(/ has | is |:/)[0])
                        .join(', ')}
                    </p>
                  )}
                </div>
                {g.items.length === 0 && checks.find((c) => c.title === g.title)?.employeeId && (
                  <Link href={`/people/${checks.find((c) => c.title === g.title)?.employeeId}`} className="self-center whitespace-nowrap text-xs font-semibold text-[color:var(--section)] hover:underline">
                    Open profile
                  </Link>
                )}
              </div>
            );
          })}
          {infos.length > 3 && (
            <button className="text-xs font-medium text-brand-blue underline" onClick={() => setShowInfo(!showInfo)}>
              {showInfo ? 'Show fewer' : `Show all ${infos.length} for information`}
            </button>
          )}
        </section>

        <div className="space-y-4">
          <section className="card space-y-3">
            <div className="card-head">
              <h2 className="card-title text-sm font-semibold text-ink">Approval</h2>
            </div>
            <p className="text-xs text-slate-500">
              {approval.required > 1 ? `Two approvals needed${approval.reasons.length ? `: ${approval.reasons.join('; ')}.` : '.'}` : 'One approval needed.'}
            </p>
            <ul className="space-y-2 text-sm">
              {approval.given.map((g, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>
                    <span className="font-medium text-ink">{g.name}</span>
                    {approval.required > 1 && g.level ? ` · level ${g.level}` : ''} <span className="text-xs text-slate-400">{when(g.at)}</span>
                    {g.comment && <span className="mt-0.5 block text-xs text-slate-500">“{g.comment}”</span>}
                  </span>
                </li>
              ))}
              {run.status === 'SUBMITTED' && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-500">●</span>
                  <span className="text-slate-600">
                    Waiting for {approval.required > 1 ? `a level ${approval.nextLevel} approver` : 'an approver'}
                    {approval.approvers.length > 0 && (
                      <span className="block text-xs text-slate-400">
                        {approval.approvers
                          .filter((a) => approval.required === 1 || a.level === 'ANY' || a.level === String(approval.nextLevel))
                          .map((a) => a.name)
                          .join(', ')}
                      </span>
                    )}
                  </span>
                </li>
              )}
              {run.status === 'DRAFT' && approval.given.length === 0 && (
                <li className="text-xs text-slate-500">
                  Approvers: {approval.approvers.length ? approval.approvers.map((a) => `${a.name}${a.level !== 'ANY' ? ` (level ${a.level})` : ''}`).join(', ') : 'none set'}.{' '}
                  <Link href="/settings/payroll" className="font-medium text-[color:var(--section)] hover:underline">
                    Approval settings
                  </Link>
                </li>
              )}
            </ul>
          </section>

          <section className="card space-y-3">
            <div className="card-head">
              <h2 className="card-title text-sm font-semibold text-ink">Gross to net</h2>
            </div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Share of gross pay">
              {g2n.map((x) => (
                <span key={x.label} className={x.cls} style={{ width: `${(x.v / g2nTotal) * 100}%` }} />
              ))}
            </div>
            <ul className="space-y-1.5 text-sm">
              {g2n.map((x) => (
                <li key={x.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className={`h-2.5 w-2.5 rounded-sm ${x.cls}`} />
                    {x.label}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {money(x.v)} <span className="font-normal text-slate-400">· {((x.v / g2nTotal) * 100).toFixed(1)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-2">
            <div className="card-head">
              <h2 className="card-title text-sm font-semibold text-ink">Statutory and employer contributions</h2>
            </div>
            {[...statutory.employee.map(([k, v]) => [labelFor(STATUTORY_LABELS, k), v, 'Deducted'] as const), ...statutory.employer.map(([k, v]) => [labelFor(EMPLOYER_LABELS, k), v, 'Employer'] as const)].map(([k, v, who]) => (
              <div key={`${who}-${k}`} className="flex items-center justify-between border-t border-slate-50 pt-2 text-sm first:border-0 first:pt-0">
                <span className="min-w-0 text-slate-600">
                  {k}
                  <span className="block text-xs text-slate-400">{who === 'Employer' ? 'Paid by the employer' : 'Deducted from pay'}</span>
                </span>
                <span className="shrink-0 pl-3 font-semibold tabular-nums text-ink">{money(v)}</span>
              </div>
            ))}
            {run.status !== 'DRAFT' && run.status !== 'SUBMITTED' && (
              <Link href="/payroll/submissions" className="block pt-1 text-xs font-semibold text-[color:var(--section)] hover:underline">
                Regulatory returns for this month
              </Link>
            )}
          </section>
        </div>
      </div>

      <section className="card overflow-hidden !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Employees</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              ['ALL', `All ${rows.length}`],
              ['FLAGGED', `Flagged ${rows.filter((r) => r.flagged).length}`],
              ...departments.map(([k, n]) => [k, `${k} ${n}`]),
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1 font-medium ${filter === k ? 'bg-[#0f1a4d] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <input className="input !w-48 !py-1.5 text-sm" placeholder="Search name or number" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search employees" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-sm tabular-nums">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 text-left font-semibold">Employee</th>
                {['Basic', 'Allowances', 'Additions', 'Gross', 'Tax', 'Statutory', 'Other ded.', 'Net pay', 'Net vs prev.', 'Employer cost'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.p.id} className="cursor-pointer border-t border-slate-50 hover:bg-slate-50/70" onClick={() => setOpen(r.p)}>
                  <td className="min-w-[220px] px-5 py-2.5">
                    <p className="whitespace-nowrap font-medium text-ink">
                      {r.name} {r.flagged && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title="Has checks" />}
                    </p>
                    <p className="whitespace-nowrap text-xs text-slate-400">
                      {r.p.jobTitle ?? '—'} · {r.department}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right">{money(r.basic)}</td>
                  <td className="px-3 py-2.5 text-right">{money(r.allowances)}</td>
                  <td className="px-3 py-2.5 text-right">{r.additions ? money(r.additions) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-ink">{money(r.p.grossPay)}</td>
                  <td className="px-3 py-2.5 text-right">{money(r.p.tax)}</td>
                  <td className="px-3 py-2.5 text-right">{money(r.p.deductions)}</td>
                  <td className="px-3 py-2.5 text-right">{r.otherDed ? money(r.otherDed) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-ink">{money(r.p.netPay)}</td>
                  <td className={`px-3 py-2.5 text-right text-xs font-semibold ${r.change == null ? 'text-slate-400' : Math.abs(r.change) > 15 ? 'text-amber-700' : 'text-slate-600'}`}>
                    {r.change == null ? (previous ? 'new' : '—') : Math.abs(r.change) < 0.05 ? '—' : `${r.change > 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2.5 pr-5 text-right text-slate-600">{money(r.cost)}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-center text-slate-500">
                    No employees match.
                  </td>
                </tr>
              )}
              {filter === 'ALL' && !query && rows.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-ink">
                  <td className="px-5 py-3">Totals · {totals.employees} employees</td>
                  <td className="px-3 py-3 text-right">{money(rows.reduce((s, r) => s + r.basic, 0))}</td>
                  <td className="px-3 py-3 text-right">{money(rows.reduce((s, r) => s + r.allowances, 0))}</td>
                  <td className="px-3 py-3 text-right">{money(rows.reduce((s, r) => s + r.additions, 0))}</td>
                  <td className="px-3 py-3 text-right">{money(totals.gross)}</td>
                  <td className="px-3 py-3 text-right">{money(totals.tax)}</td>
                  <td className="px-3 py-3 text-right">{money(totals.statutoryDeductions)}</td>
                  <td className="px-3 py-3 text-right">{money(totals.otherDeductions)}</td>
                  <td className="px-3 py-3 text-right">{money(totals.net)}</td>
                  <td className="px-3 py-3 text-right text-xs">{pt ? <Delta now={totals.net} before={pt.net} label="" /> : '—'}</td>
                  <td className="px-3 py-3 pr-5 text-right">{money(totals.cost)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-2">
        <div className="card-head">
          <h2 className="card-title text-sm font-semibold text-ink">History</h2>
        </div>
        {d.events.length === 0 && <p className="text-xs text-slate-500">This run was made before v030.A, so it has no history.</p>}
        <ol className="space-y-2">
          {[...d.events].reverse().map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2 text-sm">
              <span className="w-32 shrink-0 text-xs text-slate-400">{when(e.createdAt)}</span>
              <span className="font-medium text-ink">
                {ACTION_LABEL[e.action] ?? e.action}
                {e.action === 'APPROVED' && e.level && approval.required > 1 ? ` (level ${e.level})` : ''}
                {e.action === 'REOPENED' && e.data?.withdrawn ? ' (withdrawn)' : ''}
              </span>
              <span className="text-slate-500">by {e.actorName ?? '—'}</span>
              {e.comment && <span className="w-full pl-0 text-xs text-slate-500 sm:pl-[8.5rem]">“{e.comment}”</span>}
            </li>
          ))}
        </ol>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10" role="dialog" aria-modal="true" aria-label="Payslip" onClick={() => setOpen(null)}>
          <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-2 right-0 z-10 rounded-full bg-white p-1.5 text-slate-500 shadow hover:text-ink" onClick={() => setOpen(null)} aria-label="Close">
              <IconX />
            </button>
            <PayslipWithDownload payslip={open} branding={branding} />
          </div>
        </div>
      )}
    </div>
  );
}
