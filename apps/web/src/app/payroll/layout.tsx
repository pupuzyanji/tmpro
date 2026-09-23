'use client';

import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { TabBar } from '@/components/tab-bar';
import { IconDollar, IconAdjustments, IconShield } from '@/components/icons';

const TABS = [
  { href: '/payroll', label: 'Pay Runs', icon: <IconDollar /> },
  { href: '/payroll/adjustments', label: 'Additions & Deductions', icon: <IconAdjustments /> },
  { href: '/payroll/submissions', label: 'Regulatory Submission', icon: <IconShield /> },
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

      <TabBar
        items={TABS.map((t) => ({
          key: t.href,
          label: t.label,
          icon: t.icon,
          href: t.href,
          active: pathname === t.href || (t.href !== '/payroll' && pathname.startsWith(t.href)),
        }))}
      />

      {children}
    </div>
  );
}
