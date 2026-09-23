'use client';

import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/use-api';
import { TabBar } from '@/components/tab-bar';
import {
  IconBuilding,
  IconMapPin,
  IconGrid,
  IconUsers,
  IconTag,
  IconCalendar,
  IconGraduationCap,
  IconMegaphone,
  IconSitemap,
} from '@/components/icons';

// v019.A (follow-up): the HR role sees Settings too, but not the
// Organization/Branches/Departments/Designations tabs — those stay
// Admin-only, matched by the same split on the API side
// (SettingsController's per-method @Roles()). Everything else here
// (Employees, Leave, Training, Announcements, Org Chart) is open to HR.
const TABS = [
  { href: '/settings/organization', label: 'Organization', icon: <IconBuilding />, adminOnly: true },
  { href: '/settings/branches', label: 'Branches', icon: <IconMapPin />, adminOnly: true },
  { href: '/settings/departments', label: 'Departments', icon: <IconGrid />, adminOnly: true },
  { href: '/settings/employees', label: 'Employees', icon: <IconUsers /> },
  { href: '/settings/designations', label: 'Designations', icon: <IconTag />, adminOnly: true },
  { href: '/settings/leave', label: 'Leave', icon: <IconCalendar /> },
  { href: '/settings/training', label: 'Training', icon: <IconGraduationCap /> },
  { href: '/settings/announcements', label: 'Announcements', icon: <IconMegaphone /> },
  { href: '/settings/org-chart', label: 'Org Chart', icon: <IconSitemap /> },
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

      <TabBar
        items={tabs.map((t) => ({
          key: t.href,
          label: t.label,
          icon: t.icon,
          href: t.href,
          active: pathname === t.href || (t.href !== '/settings/organization' && pathname.startsWith(t.href)),
        }))}
      />

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
