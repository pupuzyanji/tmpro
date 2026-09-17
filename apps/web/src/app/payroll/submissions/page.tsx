'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { hasComponents, type PayRun, type Payslip } from '../shared';

interface OrgIdentifiers {
  superannuationNo: string | null;
  taxId: string | null;
  healthInsuranceId: string | null;
}

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

function toDDMMYYYY(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function employmentNature(type: string) {
  switch (type) {
    case 'FULL_TIME':
      return 'Permanent';
    case 'PART_TIME':
      return 'Part-Time';
    case 'CONTRACT':
      return 'Contract';
    case 'INTERN':
      return 'Intern';
    default:
      return type;
  }
}

/** Every (year, month) that has at least one pay run on file, newest first —
 *  the dropdown options for every Regulatory Submission section are
 *  restricted to periods payroll has actually been run for. */
function usePeriodOptions(runs: PayRun[]) {
  return useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    for (const r of runs) {
      const d = new Date(r.periodEnd);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      seen.set(`${year}-${month}`, { year, month });
    }
    return Array.from(seen.values()).sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [runs]);
}

function runsForPeriod(runs: PayRun[], year: number, month: number) {
  return runs.filter((r) => {
    const d = new Date(r.periodEnd);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export default function SubmissionsPage() {
  const { session, ready, call } = useApi();
  const isAdmin = session?.user.role === 'ADMIN' || session?.user.role === 'HR';
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [org, setOrg] = useState<OrgIdentifiers | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !isAdmin) return;
    Promise.all([call<PayRun[]>('/payroll/runs'), call<OrgIdentifiers>('/settings/organization')])
      .then(([r, o]) => {
        setRuns(r);
        setOrg(o);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load submissions data.'));
  }, [ready, isAdmin, call]);

  if (!ready) return null;
  if (!isAdmin) return <p className="text-sm text-slate-500">Regulatory Submission is an HR Admin area.</p>;

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-400">
        Month/Year selections below only offer periods payroll has already been run for. Figures are pulled from
        each employee&apos;s payslip for the selected month; a blank Middle Name reflects that this scaffold doesn&apos;t
        yet capture one, and Total Tax Credit / Tax Adjusted aren&apos;t tracked yet so they export as 0 — both are
        known gaps pending a dedicated field.
      </p>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <SuperannuationSection runs={runs} org={org} call={call} />
      <PayeSection runs={runs} call={call} />
      <HealthInsuranceSection runs={runs} org={org} call={call} />
    </div>
  );
}

function PeriodPicker({
  runs,
  year,
  month,
  onYear,
  onMonth,
  onGenerate,
  generating,
}: {
  runs: PayRun[];
  year: number | '';
  month: number | '';
  onYear: (y: number) => void;
  onMonth: (m: number) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const options = usePeriodOptions(runs);
  const years = Array.from(new Set(options.map((o) => o.year))).sort((a, b) => b - a);
  const monthsForYear = options.filter((o) => o.year === year).map((o) => o.month);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Year</label>
        <select className="input" value={year} onChange={(e) => onYear(parseInt(e.target.value, 10))}>
          <option value="">—</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Month</label>
        <select className="input" value={month} onChange={(e) => onMonth(parseInt(e.target.value, 10))} disabled={!year}>
          <option value="">—</option>
          {monthsForYear.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-primary" disabled={!year || !month || generating} onClick={onGenerate}>
        {generating ? 'Generating…' : 'Generate Return File'}
      </button>
    </div>
  );
}

function ResultTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-2 text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-slate-400">
                No eligible payslips for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** "Superannuation Returns:" — Company Superannuation No, Year, Month No,
 *  each employee's SSN/ID/name/DOB, Gross Pay, and the NAPSA deduction
 *  (individual + a matching employer contribution line), for every payslip
 *  that has a NAPSA statutory line in the selected period. */
function SuperannuationSection({
  runs,
  org,
  call,
}: {
  runs: PayRun[];
  org: OrgIdentifiers | null;
  call: ReturnType<typeof useApi>['call'];
}) {
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = [
    'Company Superannuation No',
    'Year',
    'Month No',
    'Social Security No',
    'ID No',
    'Surname',
    'First Name',
    'Middle Name',
    'Date of Birth',
    'Gross Pay',
    'Individual NAPSA Deduction',
    'Company NAPSA Contribution',
  ];

  async function generate() {
    if (!year || !month) return;
    setGenerating(true);
    setError(null);
    try {
      const matchingRuns = runsForPeriod(runs, year, month);
      const slips = (await Promise.all(matchingRuns.map((r) => call<Payslip[]>(`/payroll/runs/${r.id}/payslips`)))).flat();
      const built = slips
        .filter((p) => hasComponents(p) && p.components.statutory.napsa != null)
        .map((p) => {
          const napsa = hasComponents(p) ? p.components.statutory.napsa ?? 0 : 0;
          return [
            org?.superannuationNo ?? '',
            year,
            month,
            p.ssn ?? '',
            p.idNo ?? '',
            p.employeeLastName,
            p.employeeFirstName,
            '',
            toDDMMYYYY(p.dateOfBirth),
            p.grossPay,
            napsa,
            napsa,
          ] as (string | number)[];
        });
      setRows(built);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the Superannuation return.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Superannuation Returns:</h2>
      <PeriodPicker runs={runs} year={year} month={month} onYear={setYear} onMonth={setMonth} onGenerate={generate} generating={generating} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ResultTable headers={headers} rows={rows} />
      <button
        className="btn-secondary"
        disabled={rows.length === 0}
        onClick={() => downloadCsv(`superannuation-return-${year}-${month}.csv`, headers, rows)}
      >
        Export to CSV
      </button>
    </div>
  );
}

/** "PAYE Return" — tpin (Tax ID), full name, employment nature, gross/
 *  chargeable emoluments (both = Gross Pay, per spec), total tax credit
 *  (not tracked — exports 0), tax deducted (the PAYE statutory line, or
 *  the flat `tax` figure for a ruleset without a components breakdown), and
 *  tax adjusted (not tracked — exports 0). Applies to any payslip with a
 *  tax figure, not just the ZM-specific sections above. */
function PayeSection({ runs, call }: { runs: PayRun[]; call: ReturnType<typeof useApi>['call'] }) {
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = [
    'tpin',
    'fullName',
    'employmentNature',
    'grossEmoluments',
    'chargeableEmoluments',
    'totalTaxCredit',
    'taxDeducted',
    'taxAdjusted',
  ];

  async function generate() {
    if (!year || !month) return;
    setGenerating(true);
    setError(null);
    try {
      const matchingRuns = runsForPeriod(runs, year, month);
      const slips = (await Promise.all(matchingRuns.map((r) => call<Payslip[]>(`/payroll/runs/${r.id}/payslips`)))).flat();
      const built = slips.map((p) => {
        const taxDeducted = hasComponents(p) ? p.components.statutory.paye ?? p.tax : p.tax;
        return [
          p.taxId ?? '',
          `${p.employeeFirstName} ${p.employeeLastName}`,
          employmentNature(p.employmentType),
          p.grossPay,
          p.grossPay,
          0,
          taxDeducted,
          0,
        ] as (string | number)[];
      });
      setRows(built);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the PAYE return.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">PAYE Return</h2>
      <PeriodPicker runs={runs} year={year} month={month} onYear={setYear} onMonth={setMonth} onGenerate={generate} generating={generating} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ResultTable headers={headers} rows={rows} />
      <button
        className="btn-secondary"
        disabled={rows.length === 0}
        onClick={() => downloadCsv(`paye-return-${year}-${month}.csv`, headers, rows)}
      >
        Export to CSV
      </button>
    </div>
  );
}

/** "Health Insurance Return" — Company Health Insurance ID, Return Year/
 *  Month No, each employee's Health Insurance ID/ID No/name/DOB, Basic Pay
 *  from Compensation, and the NHIMA deduction (individual + a matching
 *  employer contribution line), for every payslip with an NHI statutory
 *  line in the selected period. */
function HealthInsuranceSection({
  runs,
  org,
  call,
}: {
  runs: PayRun[];
  org: OrgIdentifiers | null;
  call: ReturnType<typeof useApi>['call'];
}) {
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = [
    'Company Health Insurance ID',
    'Return Year',
    'Return Month No',
    'Individual Health Insurance ID',
    'Individual ID No',
    'Surname',
    'First Name',
    'Middle Name',
    'Date of Birth',
    'Basic Pay',
    'NHIMA Deducted',
    'Company NHIMA Contribution',
  ];

  async function generate() {
    if (!year || !month) return;
    setGenerating(true);
    setError(null);
    try {
      const matchingRuns = runsForPeriod(runs, year, month);
      const slips = (await Promise.all(matchingRuns.map((r) => call<Payslip[]>(`/payroll/runs/${r.id}/payslips`)))).flat();
      const built = slips
        .filter((p) => hasComponents(p) && p.components.statutory.nhi != null)
        .map((p) => {
          const nhi = hasComponents(p) ? p.components.statutory.nhi ?? 0 : 0;
          const basicPay = hasComponents(p) ? p.components.earnings.basicSalary : 0;
          return [
            org?.healthInsuranceId ?? '',
            year,
            month,
            p.nhiId ?? '',
            p.idNo ?? '',
            p.employeeLastName,
            p.employeeFirstName,
            '',
            toDDMMYYYY(p.dateOfBirth),
            basicPay,
            nhi,
            nhi,
          ] as (string | number)[];
        });
      setRows(built);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the Health Insurance return.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Health Insurance Return</h2>
      <PeriodPicker runs={runs} year={year} month={month} onYear={setYear} onMonth={setMonth} onGenerate={generate} generating={generating} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ResultTable headers={headers} rows={rows} />
      <button
        className="btn-secondary"
        disabled={rows.length === 0}
        onClick={() => downloadCsv(`health-insurance-return-${year}-${month}.csv`, headers, rows)}
      >
        Export to CSV
      </button>
    </div>
  );
}
