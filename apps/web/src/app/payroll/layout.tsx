'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';

const TABS = [
  { href: '/payroll', label: 'Pay Runs' },
  { href: '/payroll/adjustments', label: 'Additions & Deductions' },
  { href: '/payroll/submissions', label: 'Regulatory Submission' },
];

/** Payroll's tab nav (Admin/HR) — Employees/Supervisors just see their own
 *  payslips (rendered by page.tsx without any tab chrome around it), same as
 *  before this was split into tabs. */
export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useApi();
  const pathname = usePathname();

  if (!ready) return null;

  if (session?.user.role !== 'ADMIN' && session?.user.role !== 'HR') {
    return <div className="space-y-6">{children}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Payroll</h1>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== '/payroll' && pathname.startsWith(t.href));
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-ink'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
