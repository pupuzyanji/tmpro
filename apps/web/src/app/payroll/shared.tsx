'use client';

import { useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { IconPrinter } from '@/components/icons';

export interface PayRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  countryCode: string;
  status: string;
}

export interface PayComponents {
  earnings: {
    basicSalary: number;
    housingAllowance: number;
    transportAllowance: number;
    lunchAllowance: number;
    otherAllowance?: number;
  };
  // Statutory line items vary by country ruleset (ZM: paye/napsa/nhi; NZ:
  // paye/accLevy/kiwiSaver) — rendered dynamically via STATUTORY_LABELS.
  statutory: Record<string, number>;
  // How much of the pay period this payslip actually earned — set by the
  // day-by-day proration engine in payroll.service.ts. `prorated` is false
  // for the common case (payableDays === periodTotalDays), so a normal
  // full-period payslip renders no different from before this existed.
  proration?: { payableDays: number; periodTotalDays: number; prorated: boolean };
}

export interface AdjustmentSnapshot {
  label: string;
  type: 'ADDITION' | 'DEDUCTION';
  amount: number;
}

export interface Payslip {
  id: string;
  payRunId: string;
  employeeId: string;
  grossPay: number;
  tax: number;
  deductions: number;
  netPay: number;
  components: Partial<PayComponents> | Record<string, never>;
  adjustments: AdjustmentSnapshot[];
  createdAt: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  // Regulatory identifiers — displayed on the payslip identity block and
  // used to build Regulatory Submission return files on the Submissions tab.
  taxId: string | null;
  ssn: string | null;
  nhiId: string | null;
  idNo: string | null;
  dateOfBirth: string | null;
  employmentType: string;
  periodStart: string;
  periodEnd: string;
  countryCode: string;
}

export interface Branding {
  name: string | null;
  logoUrl: string | null;
  currency: string | null;
  superannuationNo?: string | null;
  taxId?: string | null;
  healthInsuranceId?: string | null;
}

export interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}

export interface Adjustment {
  id: string;
  employeeId: string;
  type: 'ADDITION' | 'DEDUCTION';
  label: string;
  amount: number;
  occurrences: number;
  appliedCount: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

// Any native ruleset (ZM, NZ, and future ones) populates the same
// { earnings, statutory } shape for a proper Pay-Advice-style layout;
// rulesets without one (a plain partner-routed run) fall back to the
// simple Gross/Tax/Deductions/Net summary below.
export function hasComponents(p: Payslip): p is Payslip & { components: PayComponents } {
  const c = p.components as Partial<PayComponents> | undefined;
  return !!c && !!c.earnings && !!c.statutory;
}

export const STATUTORY_LABELS: Record<string, string> = {
  paye: 'PAYE Income Tax',
  napsa: 'NAPSA (5%)',
  nhi: 'National Health Insurance (1% of Basic Pay)',
  accLevy: 'ACC Earner Levy',
  kiwiSaver: 'KiwiSaver',
  // ZW
  aidsLevy: 'AIDS Levy (3% of PAYE)',
  nssa: 'NSSA Contribution',
  // MW
  pension: 'Pension Contribution',
  // ZA
  uif: 'UIF Contribution',
  // TZ
  nssf: 'NSSF Contribution',
  // GB
  nationalInsurance: 'National Insurance',
  // FR
  socialContributions: 'Social Contributions',
};

export function labelFor(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function payrollReference(orgName: string | null | undefined, periodEndIso: string, employeeCode: string) {
  const initials = (orgName ?? 'TMPRO')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join('')
    .toUpperCase();
  const d = new Date(periodEndIso);
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const year = d.getFullYear();
  const suffix = employeeCode.slice(-3).padStart(3, '0');
  return `${initials || 'TMPRO'}/${month}/${year}/${suffix}`;
}

/** Wraps a PayslipCard with a Print action — opens a new window containing
 *  just this payslip's markup (plus the page's own stylesheets) and invokes
 *  the browser's native print dialog on it, so printing one payslip doesn't
 *  drag in the sidebar/nav chrome around it. */
export function PayslipWithDownload({ payslip, branding }: { payslip: Payslip; branding: Branding | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  function printPayslip() {
    if (!ref.current) return;
    setPrinting(true);
    try {
      const printWindow = window.open('', '_blank', 'width=800,height=1000');
      if (!printWindow) return;
      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((el) => el.outerHTML)
        .join('\n');
      const namePart = `${payslip.employeeFirstName} ${payslip.employeeLastName}`;
      printWindow.document.write(
        `<!DOCTYPE html><html><head><title>Payslip — ${namePart}</title>${styles}<style>body{background:#fff;padding:24px;}</style></head><body>${ref.current.outerHTML}</body></html>`,
      );
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div ref={ref}>
        <PayslipCard payslip={payslip} branding={branding} />
      </div>
      <button type="button" className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs" onClick={printPayslip} disabled={printing}>
        <IconPrinter /> Print
      </button>
    </div>
  );
}

/** Renders the Zambia "PAY ADVICE" layout (earnings split, statutory
 *  deductions, net pay, reference footer) when the payslip carries a
 *  components breakdown; falls back to a simple Gross/Tax/Deductions/Net
 *  summary for rulesets (like NZ) that don't populate one. Either layout
 *  also shows a line-item breakdown of any ad-hoc additions/deductions
 *  (advances, bonuses) applied to this specific pay run, and the employee's
 *  Tax ID/SSN/NHI ID for use in Regulatory Submissions. */
export function PayslipCard({ payslip: p, branding }: { payslip: Payslip; branding: Branding | null }) {
  const reference = useMemo(() => payrollReference(branding?.name, p.periodEnd, p.employeeCode ?? p.id), [branding, p]);
  const currency = branding?.currency ?? 'ZMW';
  const adjustments = p.adjustments ?? [];

  if (!hasComponents(p)) {
    const proration = (p.components as Partial<PayComponents> | undefined)?.proration;
    return (
      <div className="card space-y-3 text-sm">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Gross" value={formatMoney(p.grossPay, currency)} />
          <Stat label="Tax" value={formatMoney(p.tax, currency)} />
          <Stat label="Deductions" value={formatMoney(p.deductions, currency)} />
          <Stat label="Net pay" value={formatMoney(p.netPay, currency)} emphasis />
        </div>
        <ProrationNote proration={proration} />
        <IdentifiersRow p={p} />
        <AdjustmentsList adjustments={adjustments} currency={currency} />
      </div>
    );
  }

  const { earnings, statutory } = p.components;

  return (
    <div className="card space-y-4 text-sm">
      <div className="flex items-start justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
          )}
          <p className="font-bold text-ink">{branding?.name ?? 'Employer'}</p>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Pay Advice</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs text-slate-500">
        <div>
          <p className="label">Pay date</p>
          <p className="text-ink">{fmt(p.createdAt)}</p>
        </div>
        <div>
          <p className="label">Period</p>
          <p className="text-ink">
            {fmt(p.periodStart)} – {fmt(p.periodEnd)}
          </p>
        </div>
        <div>
          <p className="label">Pay frequency</p>
          <p className="text-ink">Monthly</p>
        </div>
      </div>

      <ProrationNote proration={p.components.proration} />

      <div className="grid grid-cols-3 gap-3 text-xs text-slate-500">
        <div>
          <p className="label">Employee name</p>
          <p className="text-ink">
            {p.employeeFirstName} {p.employeeLastName}
          </p>
          <p className="label mt-1.5">Employee number</p>
          <p className="text-ink">{p.employeeCode ?? '—'}</p>
        </div>
        <div>
          <p className="label">Position</p>
          <p className="text-ink">{p.jobTitle ?? '—'}</p>
          <p className="label mt-1.5">Department</p>
          <p className="text-ink">{p.department ?? '—'}</p>
        </div>
        <div>
          <p className="label">Employer</p>
          <p className="text-ink">{branding?.name ?? '—'}</p>
          <p className="label mt-1.5">Currency</p>
          <p className="text-ink">{currency}</p>
        </div>
      </div>

      <IdentifiersRow p={p} />

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</p>
        <Row label="Basic Salary" value={earnings.basicSalary} currency={currency} />
        <Row label="Housing Allowance" value={earnings.housingAllowance} currency={currency} />
        <Row label="Transport Allowance" value={earnings.transportAllowance} currency={currency} />
        <Row label="Meal/Lunch Allowance" value={earnings.lunchAllowance} currency={currency} />
        {!!earnings.otherAllowance && <Row label="Other Allowance" value={earnings.otherAllowance} currency={currency} />}
        <Row label="Gross / Taxable Pay" value={p.grossPay} currency={currency} bold />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Statutory / Tax deductions</p>
        {Object.entries(statutory).map(([key, value]) => (
          <Row key={key} label={labelFor(STATUTORY_LABELS, key)} value={value} currency={currency} />
        ))}
        <Row label="Total Deductions" value={p.deductions + p.tax} currency={currency} bold />
      </div>

      <AdjustmentsList adjustments={adjustments} currency={currency} />

      <div className="rounded-lg bg-brand-blue/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-ink">Net Pay</p>
          <p className="text-lg font-bold text-ink">{formatMoney(p.netPay, currency)}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">Payroll reference: {reference}</p>
    </div>
  );
}

/** A visible flag whenever this payslip isn't a full, unprorated period —
 *  a new hire, a leaver, a mid-period rate/hours change, or unpaid leave —
 *  so a smaller-than-expected net pay always comes with an on-payslip
 *  explanation rather than looking like an unexplained shortfall. */
function ProrationNote({ proration }: { proration: PayComponents['proration'] }) {
  if (!proration?.prorated) return null;
  return (
    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Prorated — paid for {proration.payableDays} of {proration.periodTotalDays} days this period.
    </div>
  );
}

function IdentifiersRow({ p }: { p: Payslip }) {
  if (!p.taxId && !p.ssn && !p.nhiId) return null;
  return (
    <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
      <div>
        <p className="label">Tax ID</p>
        <p className="text-ink">{p.taxId ?? '—'}</p>
      </div>
      <div>
        <p className="label">SSN</p>
        <p className="text-ink">{p.ssn ?? '—'}</p>
      </div>
      <div>
        <p className="label">NHI ID</p>
        <p className="text-ink">{p.nhiId ?? '—'}</p>
      </div>
    </div>
  );
}

export function AdjustmentsList({ adjustments, currency }: { adjustments: AdjustmentSnapshot[]; currency: string }) {
  if (adjustments.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Adjustments this run</p>
      {adjustments.map((a, i) => (
        <div key={i} className="flex items-center justify-between border-b border-slate-50 py-1 text-slate-600 last:border-0">
          <span>{a.label}</span>
          <span className={a.type === 'ADDITION' ? 'text-emerald-600' : 'text-red-600'}>
            {a.type === 'ADDITION' ? '+' : '−'}
            {formatMoney(a.amount, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Row({ label, value, currency, bold }: { label: string; value: number; currency: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-slate-50 py-1 last:border-0 ${bold ? 'font-semibold text-ink' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span>{formatMoney(value, currency)}</span>
    </div>
  );
}

export function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={emphasis ? 'font-semibold text-ink' : 'text-ink'}>{value}</p>
    </div>
  );
}
