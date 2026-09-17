'use client';

import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { fmt } from '@/lib/format';

interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

interface ReportDef {
  key: string;
  label: string;
  description: string;
  endpoint: string;
  adminOnly?: boolean;
  columns: Column<Row>[];
}

const REPORTS: ReportDef[] = [
  {
    key: 'leave-accumulated',
    label: 'Leave days accumulated',
    description: 'Leave days taken within the selected range, and each person’s current remaining balance.',
    endpoint: '/reports/leave-accumulated',
    columns: [
      { key: 'name', label: 'Staff', render: (r) => r.name },
      { key: 'taken', label: 'Days taken in range', render: (r) => r.daysTakenInRange },
      { key: 'balance', label: 'Current balance', render: (r) => r.currentBalance },
    ],
  },
  {
    key: 'goals-set',
    label: 'Performance goals set',
    description: 'How many goals were set for each person within the selected range.',
    endpoint: '/reports/goals-set',
    columns: [
      { key: 'name', label: 'Staff', render: (r) => r.name },
      { key: 'count', label: 'Goals set', render: (r) => r.goalsSet },
      { key: 'titles', label: 'Recent goals', render: (r) => (r.titles as string[]).join(', ') || '—' },
    ],
  },
  {
    key: 'appraisals-conducted',
    label: 'Performance appraisals conducted',
    description: 'Scored performance reviews logged for each person within the selected range.',
    endpoint: '/reports/appraisals-conducted',
    columns: [
      { key: 'name', label: 'Staff', render: (r) => r.name },
      { key: 'count', label: 'Appraisals conducted', render: (r) => r.appraisalsConducted },
      { key: 'last', label: 'Most recent', render: (r) => fmt(r.lastDate) },
    ],
  },
  {
    key: 'unresponded-requests',
    label: 'Unresponded requests per supervisor',
    description: 'Leave requests still pending a decision, grouped by the requester’s supervisor.',
    endpoint: '/reports/unresponded-requests',
    adminOnly: true,
    columns: [
      { key: 'supervisor', label: 'Supervisor', render: (r) => r.supervisorName },
      { key: 'count', label: 'Unresponded requests', render: (r) => r.unresponded },
    ],
  },
  {
    key: 'contracts-missing',
    label: 'Contract copies not on file',
    description: 'Staff with no Contract document uploaded (Documents tab), filtered by hire date.',
    endpoint: '/reports/contracts-missing',
    columns: [
      { key: 'name', label: 'Staff', render: (r) => r.name },
      { key: 'title', label: 'Job title', render: (r) => r.jobTitle ?? '—' },
      { key: 'start', label: 'Start date', render: (r) => fmt(r.startDate) },
    ],
  },
  {
    key: 'ids-missing',
    label: 'ID copies not on file',
    description: 'Staff with no ID document uploaded (Documents tab), filtered by hire date.',
    endpoint: '/reports/ids-missing',
    columns: [
      { key: 'name', label: 'Staff', render: (r) => r.name },
      { key: 'title', label: 'Job title', render: (r) => r.jobTitle ?? '—' },
      { key: 'start', label: 'Start date', render: (r) => fmt(r.startDate) },
    ],
  },
];

export default function ReportsPage() {
  const { session, ready, call } = useApi();
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  if (!ready) return null;

  const isAdmin = session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  if (session?.user.role === 'EMPLOYEE') {
    return <p className="text-sm text-slate-500">Reports are available to Supervisors and HR Admins.</p>;
  }

  const available = REPORTS.filter((r) => isAdmin || !r.adminOnly);
  const active = available.find((r) => r.key === reportKey) ?? available[0];

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const data = await call<Row[]>(`${active.endpoint}${qs ? `?${qs}` : ''}`);
      setRows(data);
      setRanAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run this report.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? 'Org-wide reporting, with a date range where the report supports one.'
            : 'Scoped to your direct reports, with a date range where the report supports one.'}
        </p>
      </div>

      <div className="card grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Report</label>
          <select
            className="input"
            value={active.key}
            onChange={(e) => {
              setReportKey(e.target.value);
              setRows(null);
            }}
          >
            {available.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="sm:col-span-3 text-xs text-slate-400">{active.description}</p>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {rows && (
        <div className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{active.label}</p>
            {ranAt && <p className="text-xs text-slate-400">Run at {ranAt} · {rows.length} row{rows.length === 1 ? '' : 's'}</p>}
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">No rows for this range.</p>
          ) : (
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  {active.columns.map((c) => (
                    <th key={c.key} className="py-2 pr-4 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.employeeId ?? row.supervisorId ?? i} className="border-b border-slate-50 last:border-0">
                    {active.columns.map((c) => (
                      <td key={c.key} className="py-2 pr-4 text-ink">
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
