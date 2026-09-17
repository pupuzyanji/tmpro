'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Logo, LogoMark } from '@/components/logo';
import { Avatar } from '@/components/avatar';
import { ChangePasswordModal } from '@/components/change-password-modal';
import {
  IconGrid,
  IconUsers,
  IconCalendar,
  IconTarget,
  IconBriefcase,
  IconDollar,
  IconGraduationCap,
  IconDocument,
  IconChartBar,
  IconLogout,
  IconSettings,
  IconChevronRight,
  IconPalette,
} from '@/components/icons';

const PUBLIC_ROUTES = ['/login', '/register-organisation'];
// Prefix-matched, not exact — /careers/[tenantSlug] and its job-detail page
// are the actual public careers site; bare /careers just redirects into it.
// /platform-admin isn't public (it has its own login+auth — see
// lib/platform-auth.tsx) but it's never a tenant's own dashboard chrome:
// it has its own minimal layout, same reasoning as excluding /careers.
const PUBLIC_ROUTE_PREFIXES = ['/careers', '/platform-admin'];
const SIDEBAR_COLLAPSED_KEY = 'tmpro:sidebar-collapsed';
// Two theme options, flipped via `data-theme` on <html> (see globals.css for
// the CSS-variable definitions and layout.tsx for the flash-avoidance
// script): 'classic' is the original tmPro brand look (the CSS default, no
// attribute needed); 'midnight' is the second option modeled on a reference
// fintech-dashboard screenshot the user supplied.
const THEME_KEY = 'tmpro:theme';
type Theme = 'classic' | 'midnight';

interface Branding {
  name: string | null;
  logoUrl: string | null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [branding, setBranding] = useState<Branding | null>(null);
  // Remembered per-browser (not per-user data, so localStorage is fine here)
  // so the sidebar stays collapsed/expanded across page loads.
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('classic');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    if (!session) return;
    apiFetch<Branding>('/settings/organization-branding', session.accessToken)
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [session]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
      // The inline script in layout.tsx already set the `data-theme`
      // attribute before paint (to avoid a flash) — this just brings React's
      // own state in sync with what's on the page.
      setTheme(document.documentElement.getAttribute('data-theme') === 'midnight' ? 'midnight' : 'classic');
    } catch {
      // localStorage unavailable (private browsing, etc.) — default expanded/classic
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // best-effort only
      }
      return next;
    });
  }

  function toggleTheme() {
    setTheme((prev) => {
      const next: Theme = prev === 'classic' ? 'midnight' : 'classic';
      if (next === 'midnight') {
        document.documentElement.setAttribute('data-theme', 'midnight');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // best-effort only
      }
      return next;
    });
  }

  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) || PUBLIC_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!session || isPublicRoute) {
    // No sidebar chrome on the login/careers/registration screens — just the
    // page itself. Checked even for a signed-in visitor (e.g. an admin
    // previewing their own tenant's careers page), not only when signed out.
    return <>{children}</>;
  }

  const isAdminOrSupervisor =
    session.user.role === 'ADMIN' || session.user.role === 'SUPERVISOR' || session.user.role === 'HR';

  // Which modules this tenant has (set by the platform admin — see
  // /platform-admin). Missing/undefined (a session cached from before
  // v018.A) is treated as "everything on" rather than "nothing on" — this
  // filter is cosmetic UX only, ModuleGuard on the API is the real gate,
  // and failing open here avoids silently hiding nav for anyone signed in
  // with a stale localStorage session until they next log in.
  const enabledModules = session.tenant.enabledModules;
  const hasModule = (key: string) => !enabledModules || enabledModules.includes(key);

  const links: Array<{ href: string; label: string; icon: React.ReactNode }> = [
    { href: '/dashboard', label: 'Dashboard', icon: <IconGrid /> },
  ];
  // People is visible to every role — Admin sees the full directory, a
  // Supervisor sees their team, an Employee sees just themselves. The API
  // scopes the data; the nav link itself is unconditional (Employee
  // Records is core, not a gateable module — see lib/modules.ts).
  links.push({ href: '/people', label: 'People', icon: <IconUsers /> });
  if (hasModule('Leave & Attendance')) {
    links.push({ href: '/leave', label: 'Leave', icon: <IconCalendar /> });
  }
  if (hasModule('Performance Management')) {
    links.push({ href: '/performance', label: 'Performance', icon: <IconTarget /> });
  }
  if (isAdminOrSupervisor && hasModule('Recruitment')) {
    links.push({ href: '/requisitions', label: 'Recruitment', icon: <IconBriefcase /> });
  }
  if (hasModule('Payroll')) {
    links.push({ href: '/payroll', label: 'Payroll', icon: <IconDollar /> });
  }
  if (hasModule('Training & LMS')) {
    links.push({ href: '/training', label: 'Training', icon: <IconGraduationCap /> });
  }
  links.push({ href: '/documents', label: 'Documents', icon: <IconDocument /> });
  if (isAdminOrSupervisor && hasModule('Reports & Analytics')) {
    links.push({ href: '/reports', label: 'Reports', icon: <IconChartBar /> });
  }
  if (session.user.role === 'ADMIN' || session.user.role === 'HR') {
    links.push({ href: '/settings', label: 'Settings', icon: <IconSettings /> });
  }

  const personName = session.user.email.split('@')[0].replace('.', ' ');

  return (
    <>
    <div className="flex min-h-screen">
      <aside
        className={`relative flex shrink-0 flex-col bg-sidebar-gradient py-5 transition-[width] duration-200 ${
          collapsed ? 'w-[4.5rem] px-2' : 'w-60 px-4'
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-7 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-transform hover:text-ink"
        >
          <span className={`inline-block transition-transform ${collapsed ? '' : 'rotate-180'}`}>
            <IconChevronRight />
          </span>
        </button>

        <div className={`mb-8 flex ${collapsed ? 'justify-center' : 'px-2'}`}>
          {collapsed ? <LogoMark size={28} /> : <Logo />}
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map((l) => {
            const isActive = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                title={collapsed ? l.label : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${isActive ? 'bg-[var(--nav-active-bg)] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                {l.icon}
                {!collapsed && l.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-2 border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={toggleTheme}
            title={collapsed ? `Switch to ${theme === 'classic' ? 'Midnight' : 'Classic'} theme` : undefined}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <IconPalette />
              {!collapsed && (theme === 'classic' ? 'Classic theme' : 'Midnight theme')}
            </span>
            {!collapsed && (
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  theme === 'midnight' ? 'bg-white/30' : 'bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    theme === 'midnight' ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            )}
          </button>
        </div>

        <div className="mt-2 border-t border-white/10 pt-4">
          <button
            type="button"
            title={collapsed ? 'Change password' : undefined}
            onClick={() => setShowPasswordModal(true)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/10 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <Avatar name={personName} size="sm" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">{session.user.email}</p>
                <p className="text-[11px] text-white/60">{session.user.role}</p>
              </div>
            )}
          </button>
          <button
            title={collapsed ? 'Log out' : undefined}
            className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? 'justify-center' : ''
            }`}
            onClick={() => {
              logout();
              router.push('/login');
            }}
          >
            <IconLogout />
            {!collapsed && 'Log out'}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-8 py-4">
          <div className="flex items-center gap-2.5">
            {branding?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
            )}
            <div className="leading-tight">
              <p className="text-sm font-bold text-ink">{branding?.name || session.tenant.name}</p>
              <p className="text-[11px] text-slate-400">Talent Management Portal</p>
            </div>
          </div>
          <Avatar name={personName} size="sm" />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
    {showPasswordModal && (
      <ChangePasswordModal accessToken={session.accessToken} onClose={() => setShowPasswordModal(false)} />
    )}
    </>
  );
}
