'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function NavBar() {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!session || pathname === '/login' || pathname === '/careers') return null;

  const links: Array<{ href: string; label: string }> = [{ href: '/dashboard', label: 'Dashboard' }];
  if (session.user.role === 'ADMIN' || session.user.role === 'SUPERVISOR') {
    links.push({ href: '/requisitions', label: 'Requisitions' });
  }
  links.push({ href: '/performance', label: 'Performance' });
  links.push({ href: '/payroll', label: 'Payroll' });

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-8">
          <span className="font-semibold text-ink tracking-tight">tmPro</span>
          <nav className="flex gap-5 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname.startsWith(l.href) ? 'font-medium text-accent' : 'text-slate-600 hover:text-ink'}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            {session.user.email} <span className="text-slate-400">· {session.user.role}</span>
          </span>
          <button
            className="btn-secondary py-1"
            onClick={() => {
              logout();
              router.push('/login');
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
