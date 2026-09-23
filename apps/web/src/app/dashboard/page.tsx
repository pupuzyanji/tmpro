'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { TeardropStat } from '@/components/teardrop-stat';
import { IconUsers } from '@/components/icons';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  status: string;
  photoUrl: string | null;
}
interface LeaveBalance {
  id: string;
  balanceDays: number;
  leaveType: { id: string; name: string; defaultAnnualDays: number };
}
interface LeaveRequestMine {
  id: string;
  status: string;
  days: number;
  startDate: string;
  leaveType: { name: string };
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
interface OnLeaveEntry {
  employeeId: string;
  name: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  state: 'ON_LEAVE' | 'UPCOMING';
}
interface PendingRequestEntry {
  id: string;
  type: 'LEAVE' | 'REQUISITION';
  // Only set for LEAVE entries — lets the row link to that person's Leave
  // tab; a REQUISITION entry has no single employee to point at, so it
  // links to Recruitment instead (see PendingRequestsPanel below).
  employeeId?: string;
  employeeName: string;
  summary: string;
  createdAt: string;
}
interface BirthdayEntry {
  employeeId: string;
  name: string;
  date: string;
  daysOut: number;
}
interface AdminSummary {
  headcount: number;
  departmentCount: number;
  pendingRequestsCount: number;
  onLeave: OnLeaveEntry[];
  pendingRequests: PendingRequestEntry[];
  birthdays: BirthdayEntry[];
}
interface SupervisorSummary {
  directReportsCount: number;
  pendingRequestsCount: number;
  onLeave: OnLeaveEntry[];
  pendingRequests: PendingRequestEntry[];
  birthdays: BirthdayEntry[];
}

const QUICK_LINKS: Record<string, Array<{ href: string; label: string; description: string }>> = {
  ADMIN: [
    { href: '/people', label: 'People', description: 'Browse the employee directory' },
    { href: '/requisitions', label: 'Recruitment', description: 'Approve headcount, review applicants' },
    { href: '/payroll', label: 'Payroll', description: 'Run this period’s pay cycle' },
  ],
  HR: [
    { href: '/people', label: 'People', description: 'Browse the employee directory' },
    { href: '/requisitions', label: 'Recruitment', description: 'Approve headcount, review applicants' },
    { href: '/payroll', label: 'Payroll', description: 'Run this period’s pay cycle' },
  ],
  SUPERVISOR: [
    { href: '/leave', label: 'Leave', description: 'Approve requests waiting on you' },
    { href: '/requisitions', label: 'Recruitment', description: 'Raise a requisition' },
    { href: '/performance', label: 'Performance', description: 'Track your goals' },
  ],
  EMPLOYEE: [
    { href: '/leave', label: 'Leave', description: 'Request time off, check your balance' },
    { href: '/performance', label: 'Performance', description: 'Track your goals' },
    { href: '/payroll', label: 'Payroll', description: 'View your payslips' },
  ],
};

function daysOutLabel(daysOut: number) {
  if (daysOut === 0) return 'Today';
  if (daysOut === 1) return 'Tomorrow';
  return `In ${daysOut} days`;
}

function monthDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
}

export default function DashboardPage() {
  const { session, ready, call } = useApi();
  const [me, setMe] = useState<Employee | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequestMine[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [supervisorSummary, setSupervisorSummary] = useState<SupervisorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user.role;
  const hasEmployeeProfile = role === 'EMPLOYEE' || role === 'SUPERVISOR' || role === 'HR';
  const personName = me ? `${me.firstName} ${me.lastName}` : (session?.user.email.split('@')[0] ?? '');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        if (hasEmployeeProfile) {
          const [meRes, balRes, reqRes] = await Promise.all([
            call<Employee>('/employees/me'),
            call<LeaveBalance[]>('/leave/balances/me'),
            call<LeaveRequestMine[]>('/leave/requests/me'),
          ]);
          setMe(meRes);
          setBalances(balRes);
          setMyRequests(reqRes);
        }
        if (role === 'EMPLOYEE') {
          setAnnouncements(await call<Announcement[]>('/announcements/me'));
        }
        if (role === 'ADMIN' || role === 'HR') {
          setAdminSummary(await call<AdminSummary>('/dashboard/admin-summary'));
        }
        if (role === 'SUPERVISOR') {
          setSupervisorSummary(await call<SupervisorSummary>('/dashboard/supervisor-summary'));
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load dashboard data.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, role]);

  async function markRead(id: string) {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
    try {
      await call(`/announcements/${id}/read`, { method: 'POST' });
    } catch {
      // best-effort — a failed mark-as-read isn't worth surfacing an error for
    }
  }

  if (!ready) return null;

  const unreadAnnouncements = announcements.filter((a) => !a.read);
  const pendingMyRequests = myRequests.filter((r) => r.status === 'PENDING');

  // The dashboard's own leave balances are a quick-glance widget, not the
  // full Leave page — only Annual Leave (always relevant) plus any type the
  // person has actually applied for. Every other type they've never touched
  // sits at zero and just adds noise here (the full catalog is still on the
  // Leave page).
  const appliedForNames = new Set(myRequests.map((r) => r.leaveType.name));
  const dashboardBalances = balances.filter((b) => b.leaveType.name === 'Annual Leave' || appliedForNames.has(b.leaveType.name));

  const mainColumn = (
    <div className="min-w-0 space-y-8">
      <div className="flex items-center gap-4">
        <Avatar name={personName} photoUrl={me?.photoUrl} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {me ? `${me.firstName} ${me.lastName}` : `Welcome, ${role === 'ADMIN' || role === 'HR' ? 'HR Admin' : personName}`}
          </h1>
          <p className="text-sm text-slate-500">
            {me ? (
              <>
                {me.jobTitle} {me.department && `· ${me.department}`}
              </>
            ) : (
              session?.tenant.name
            )}
          </p>
        </div>
      </div>

      {(role === 'ADMIN' || role === 'HR') && adminSummary && <AdminSummaryPanel summary={adminSummary} />}
      {role === 'SUPERVISOR' && supervisorSummary && <SupervisorSummaryPanel summary={supervisorSummary} />}

      {role === 'EMPLOYEE' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card">
            <p className="label">Unread announcements</p>
            <p className="text-2xl font-semibold text-ink">{unreadAnnouncements.length}</p>
            {unreadAnnouncements.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {unreadAnnouncements.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => markRead(a.id)}
                      className="w-full rounded-md border border-slate-100 px-2.5 py-1.5 text-left text-xs hover:border-brand-blue/40"
                      title="Mark as read"
                    >
                      <p className="font-medium text-ink">{a.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-slate-500">{a.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-400">You&apos;re all caught up.</p>
            )}
          </div>
          <div className="card">
            <p className="label">Unapproved requests</p>
            <p className="text-2xl font-semibold text-ink">{pendingMyRequests.length}</p>
            {pendingMyRequests.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {pendingMyRequests.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link href="/leave" className="flex items-center justify-between text-xs hover:text-brand-blue">
                      <span className="text-ink">{r.leaveType.name}</span>
                      <span className="text-slate-400">
                        {r.days} day{r.days === 1 ? '' : 's'} · waiting on your supervisor
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Nothing waiting on approval.</p>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Quick links</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(QUICK_LINKS[role ?? 'EMPLOYEE'] ?? []).map((l) => (
            <Link key={l.href} href={l.href} className="card block hover:border-brand-blue/40">
              <p className="text-sm font-semibold text-ink">{l.label}</p>
              <p className="mt-1 text-xs text-slate-500">{l.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {hasEmployeeProfile && dashboardBalances.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-start">
          {mainColumn}
          <div className="space-y-2 lg:sticky lg:top-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Leave balance</h2>
            <div className="space-y-1.5">
              {dashboardBalances.map((b) => {
                const total = b.leaveType.defaultAnnualDays;
                const taken = Math.max(0, total - b.balanceDays);
                return (
                  <Link
                    key={b.id}
                    href="/leave"
                    className="block rounded-lg border border-slate-100 bg-white p-2 shadow-sm hover:border-brand-blue/40"
                  >
                    <p className="truncate text-[9px] font-medium uppercase tracking-wide text-slate-500">{b.leaveType.name}</p>
                    <p className="text-sm font-semibold leading-tight text-ink">
                      {b.balanceDays} <span className="text-[9px] font-normal text-slate-500">days left</span>
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {taken}/{total} taken
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        mainColumn
      )}
    </div>
  );
}

function AdminSummaryPanel({ summary }: { summary: AdminSummary }) {
  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-around gap-6 py-6">
        <TeardropStat value={summary.headcount} label="Headcount" color="cyan" href="/people" />
        <TeardropStat value={summary.departmentCount} label="Departments" color="violet" href="/settings/departments" />
        {/* No single "all pending requests" page exists yet (leave and
            requisition approvals live on separate pages) — this scrolls
            down to the Pending Requests panel already on this page instead
            of linking away. */}
        <TeardropStat value={summary.pendingRequestsCount} label="Pending requests" color="orange" href="#admin-pending-requests" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <OnLeavePanel entries={summary.onLeave} />
        <PendingRequestsPanel entries={summary.pendingRequests} id="admin-pending-requests" />
        <BirthdaysPanel entries={summary.birthdays} />
      </div>
    </div>
  );
}

function SupervisorSummaryPanel({ summary }: { summary: SupervisorSummary }) {
  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-around gap-6 py-5">
        <TeardropStat value={summary.directReportsCount} label="Direct reports" color="cyan" size="md" href="/people" />
        <TeardropStat value={summary.pendingRequestsCount} label="Pending requests" color="orange" size="md" href="/leave" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <OnLeavePanel entries={summary.onLeave} title="Team on/about to go on leave" />
        <PendingRequestsPanel entries={summary.pendingRequests} title="Team pending requests" linkHref="/leave" />
        <BirthdaysPanel entries={summary.birthdays} title="Team birthdays (next 7 days)" />
      </div>
    </div>
  );
}

function Panel({ title, children, empty, id }: { title: string; children: React.ReactNode; empty: boolean; id?: string }) {
  return (
    <div id={id} className="card scroll-mt-6">
      <p className="mb-3 text-sm font-semibold text-ink">{title}</p>
      {empty ? <p className="text-xs text-slate-400">Nothing to show.</p> : <ul className="space-y-2.5">{children}</ul>}
    </div>
  );
}

function OnLeavePanel({ entries, title = 'Away or about to go on leave' }: { entries: OnLeaveEntry[]; title?: string }) {
  return (
    <Panel title={title} empty={entries.length === 0}>
      {entries.slice(0, 6).map((e) => (
        <li key={`${e.employeeId}-${e.startDate}`}>
          <Link href={`/people/${e.employeeId}?tab=Leave`} className="flex items-center justify-between text-xs hover:opacity-80">
            <div>
              <p className="font-medium text-ink">{e.name}</p>
              <p className="text-slate-400">
                {e.leaveType} · {monthDay(e.startDate)} – {monthDay(e.endDate)}
              </p>
            </div>
            <span className={`badge ${e.state === 'ON_LEAVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {e.state === 'ON_LEAVE' ? 'On leave' : 'Upcoming'}
            </span>
          </Link>
        </li>
      ))}
    </Panel>
  );
}

function PendingRequestsPanel({
  entries,
  title = 'Pending requests',
  linkHref,
  id,
}: {
  entries: PendingRequestEntry[];
  title?: string;
  linkHref?: string;
  id?: string;
}) {
  // Whole-panel `linkHref` (Supervisor -> /leave, where every entry is a
  // team leave request anyway) and a per-row link both render an <a> —
  // nesting the two is invalid HTML, so a row only gets its own link when
  // the panel as a whole doesn't already have one (Admin's view, which also
  // mixes in REQUISITION rows that need a different destination).
  const content = (
    <Panel title={title} empty={entries.length === 0} id={id}>
      {entries.slice(0, 6).map((e) =>
        linkHref ? (
          <li key={e.id} className="text-xs">
            <p className="font-medium text-ink">{e.employeeName}</p>
            <p className="text-slate-400">{e.summary}</p>
          </li>
        ) : (
          <li key={e.id}>
            <Link
              href={e.type === 'LEAVE' && e.employeeId ? `/people/${e.employeeId}?tab=Leave` : '/requisitions'}
              className="block text-xs hover:opacity-80"
            >
              <p className="font-medium text-ink">{e.employeeName}</p>
              <p className="text-slate-400">{e.summary}</p>
            </Link>
          </li>
        ),
      )}
    </Panel>
  );
  if (!linkHref) return content;
  return (
    <Link href={linkHref} className="block hover:opacity-90">
      {content}
    </Link>
  );
}

function BirthdaysPanel({ entries, title = 'Upcoming birthdays' }: { entries: BirthdayEntry[]; title?: string }) {
  return (
    <Panel title={title} empty={entries.length === 0}>
      {entries.slice(0, 6).map((e) => (
        <li key={e.employeeId}>
          <Link href={`/people/${e.employeeId}`} className="flex items-center justify-between text-xs hover:opacity-80">
            <span className="flex items-center gap-1.5 text-ink">
              <IconUsers /> {e.name}
            </span>
            <span className="text-slate-400">
              {monthDay(e.date)} · {daysOutLabel(e.daysOut)}
            </span>
          </Link>
        </li>
      ))}
    </Panel>
  );
}
