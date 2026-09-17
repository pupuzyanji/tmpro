'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';

// v019.A (follow-up): the HR role sees Settings too, but not the
// Organization/Branches/Departments/Designations tabs — those stay
// Admin-only, matched by the same split on the API side
// (SettingsController's per-method @Roles()). Everything else here
// (Employees, Leave, Training, Announcements, Org Chart) is open to HR.
const TABS = [
  { href: '/settings/organization', label: 'Organization', adminOnly: true },
  { href: '/settings/branches', label: 'Branches', adminOnly: true },
  { href: '/settings/departments', label: 'Departments', adminOnly: true },
  { href: '/settings/employees', label: 'Employees' },
  { href: '/settings/designations', label: 'Designations', adminOnly: true },
  { href: '/settings/leave', label: 'Leave' },
  { href: '/settings/training', label: 'Training' },
  { href: '/settings/announcements', label: 'Announcements' },
  { href: '/settings/org-chart', label: 'Org Chart' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useApi();
  const pathname = usePathname();

  if (!ready) return null;

  const role = session?.user.role;
  if (role !== 'ADMIN' && role !== 'HR') {
    return <p className="text-sm text-slate-500">Settings is an HR Admin area.</p>;
  }

  const isAdmin = role === 'ADMIN';
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const onAdminOnlyTab = !isAdmin && TABS.some((t) => t.adminOnly && (pathname === t.href || pathname.startsWith(t.href)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-slate-500">Define your organization structure — branches, departments, roles, and people.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== '/settings/organization' && pathname.startsWith(t.href));
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

      {onAdminOnlyTab ? (
        <p className="text-sm text-slate-500">
          Organization configuration is Admin-only — the HR role doesn&apos;t have access to this section.
        </p>
      ) : (
        children
      )}
    </div>
  );
}
