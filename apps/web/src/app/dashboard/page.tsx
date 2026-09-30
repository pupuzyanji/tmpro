'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { TeardropStat } from '@/components/teardrop-stat';
import { IconUsers } from '@/components/icons';
import { accentClass } from '@/lib/section-accent';
import type { LeaveOverview, LeaveTypeOverview } from '@/lib/leave';
import { formatMoney } from '@/lib/format';
import { COUNTRY_CURRENCY as RUN_CURRENCY, runMonth } from '@/app/payroll/shared';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  status: string;
  photoUrl: string | null;
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
/** v029.B — GET /contracts/expiring. */
interface ExpiringContract {
  contractId: string;
  employeeId: string;
  name: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  countryCode: string;
  contractType: string;
  startDate: string;
  endDate: string;
  daysLeft: number;
  noticePeriodDays: number | null;
  gratuity: { rate: number; accrued: number } | null;
}
interface ExpiringContracts {
  asOf: string;
  until: string;
  months: number;
  rows: ExpiringContract[];
}
/** v030.A — GET /payroll/approvals/mine. */
interface RunApproval {
  id: string;
  countryCode: string;
  periodEnd: string;
  payDate: string | null;
  level: number;
  required: number;
  totals: { employees: number; net: number; cost: number };
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
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOverview[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequestMine[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [supervisorSummary, setSupervisorSummary] = useState<SupervisorSummary | null>(null);
  const [expiring, setExpiring] = useState<ExpiringContracts | null>(null);
  const [runApprovals, setRunApprovals] = useState<RunApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user.role;
  const hasEmployeeProfile = role === 'EMPLOYEE' || role === 'SUPERVISOR' || role === 'HR';
  const personName = me ? `${me.firstName} ${me.lastName}` : (session?.user.email.split('@')[0] ?? '');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        if (hasEmployeeProfile) {
          // v028.B: balances come from the v028.A leave engine (/leave/me);
          // the old /leave/balances/me endpoint no longer exists.
          const [meRes, leaveRes, reqRes] = await Promise.all([
            call<Employee>('/employees/me'),
            call<LeaveOverview>('/leave/me'),
            call<LeaveRequestMine[]>('/leave/requests/me'),
          ]);
          setMe(meRes);
          setLeaveTypes(leaveRes.types);
          setMyRequests(reqRes);
        }
        if (role === 'EMPLOYEE') {
          setAnnouncements(await call<Announcement[]>('/announcements/me'));
        }
        // v030.A — pay runs waiting for this person's approval (any role can
        // be an approver). Best-effort: Payroll may be switched off.
        call<RunApproval[]>('/payroll/approvals/mine').then(setRunApprovals).catch(() => setRunApprovals([]));
        if (role === 'ADMIN' || role === 'HR') {
          setAdminSummary(await call<AdminSummary>('/dashboard/admin-summary'));
          // Best-effort: the dashboard still loads if contracts can't be read.
          call<ExpiringContracts>('/contracts/expiring').then(setExpiring).catch(() => setExpiring(null));
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
  // full Leave page — only the accruing type (annual leave, always relevant)
  // plus any balance-tracked type the person has actually applied for. The
  // full catalog is on the Leave page.
  const appliedForNames = new Set(myRequests.map((r) => r.leaveType.name));
  const dashboardBalances = leaveTypes.filter(
    (t) =>
      t.eligible &&
      (t.kind === 'ACCRUING' || (t.kind === 'ALLOWANCE' && appliedForNames.has(t.name))) &&
      (t.available ?? t.balance) !== undefined,
  );

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

      {runApprovals.length > 0 && <RunApprovalsPanel runs={runApprovals} />}
      {(role === 'ADMIN' || role === 'HR') && adminSummary && <AdminSummaryPanel summary={adminSummary} />}
      {(role === 'ADMIN' || role === 'HR') && expiring && <ContractsEndingPanel data={expiring} />}
      {role === 'SUPERVISOR' && supervisorSummary && <SupervisorSummaryPanel summary={supervisorSummary} />}

      {role === 'EMPLOYEE' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card accent-indigo">
            <p className="card-head card-title label">Unread announcements</p>
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
          <div className="card accent-magenta">
            <p className="card-head card-title label">Unapproved requests</p>
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
            <Link key={l.href} href={l.href} className={`card block hover:border-brand-blue/40 ${accentClass(l.href)}`}>
              <p className="card-head card-title text-sm font-semibold text-ink">{l.label}</p>
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
              {dashboardBalances.map((t) => {
                const left = t.available ?? t.balance ?? 0;
                return (
                  <Link
                    key={t.leaveTypeId}
                    href="/leave"
                    className="block rounded-lg border border-slate-100 bg-white p-2 shadow-sm hover:border-brand-blue/40"
                  >
                    <p className="truncate text-[9px] font-medium uppercase tracking-wide text-slate-500">{t.name}</p>
                    <p className="text-sm font-semibold leading-tight text-ink">
                      {left} <span className="text-[9px] font-normal text-slate-500">days left</span>
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {t.kind === 'ALLOWANCE'
                        ? `${t.used ?? 0}/${t.allotted ?? t.entitlement} taken`
                        : t.pending
                          ? `${t.pending} pending approval`
                          : t.nextAccrual
                            ? `+${t.nextAccrual.units} on ${new Date(t.nextAccrual.date).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })}`
                            : 'Accruing monthly'}
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
      <div className="card">
        <GlanceHead />
        <div className="flex flex-wrap items-center justify-around gap-6 py-1">
          <TeardropStat value={summary.headcount} label="Headcount" color="cyan" href="/people" />
          <TeardropStat value={summary.departmentCount} label="Departments" color="violet" href="/settings/departments" />
          {/* No single "all pending requests" page exists yet (leave and
              requisition approvals live on separate pages) — this scrolls
              down to the Pending Requests panel already on this page instead
              of linking away. */}
          <TeardropStat value={summary.pendingRequestsCount} label="Pending requests" color="orange" href="#admin-pending-requests" />
        </div>
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
      <div className="card">
        <GlanceHead />
        <div className="flex flex-wrap items-center justify-around gap-6">
          <TeardropStat value={summary.directReportsCount} label="Direct reports" color="cyan" size="md" href="/people" />
          <TeardropStat value={summary.pendingRequestsCount} label="Pending requests" color="orange" size="md" href="/leave" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <OnLeavePanel entries={summary.onLeave} title="Team on/about to go on leave" />
        <PendingRequestsPanel entries={summary.pendingRequests} title="Team pending requests" linkHref="/leave" />
        <BirthdaysPanel entries={summary.birthdays} title="Team birthdays (next 7 days)" />
      </div>
    </div>
  );
}

/** v028.B — the stats card's header. Midnight only: in Classic the rings
 *  carry their own accent bars (see TeardropStat). */
function GlanceHead() {
  return (
    <div className="card-head theme-midnight-only">
      <p className="card-title text-xs font-semibold uppercase tracking-wide text-slate-600">At a glance</p>
    </div>
  );
}

function Panel({
  title,
  children,
  empty,
  id,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
  id?: string;
  accent: 'cyan' | 'magenta' | 'orange';
}) {
  return (
    <div id={id} className={`card scroll-mt-6 accent-${accent}`}>
      <p className="card-head card-title mb-3 text-sm font-semibold text-ink">{title}</p>
      {empty ? <p className="text-xs text-slate-400">Nothing to show.</p> : <ul className="space-y-2.5">{children}</ul>}
    </div>
  );
}

function OnLeavePanel({ entries, title = 'Away or about to go on leave' }: { entries: OnLeaveEntry[]; title?: string }) {
  return (
    <Panel title={title} empty={entries.length === 0} accent="cyan">
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
    <Panel title={title} empty={entries.length === 0} id={id} accent="magenta">
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
    <Panel title={title} empty={entries.length === 0} accent="orange">
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

const CONTRACT_LABEL: Record<string, string> = {
  PERMANENT_PENSIONABLE: 'Permanent (pensionable)',
  PERMANENT_NON_PENSIONABLE: 'Permanent (non-pensionable)',
  FIXED_TERM: 'Fixed-term',
  TEMPORARY: 'Temporary',
  CASUAL: 'Casual',
};
const COUNTRY_CURRENCY: Record<string, string> = { ZM: 'ZMW', MW: 'MWK', NZ: 'NZD', AU: 'AUD', ZA: 'ZAR', ZW: 'USD', TZ: 'TZS', GB: 'GBP', FR: 'EUR' };

function endsLabel(daysLeft: number) {
  if (daysLeft < 0) return `Ended ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`;
  if (daysLeft === 0) return 'Ends today';
  if (daysLeft === 1) return 'Ends tomorrow';
  if (daysLeft < 60) return `${daysLeft} days left`;
  return `${Math.round(daysLeft / 30.4)} months left`;
}
function urgency(daysLeft: number) {
  if (daysLeft <= 30) return 'bg-red-50 text-red-700';
  if (daysLeft <= 90) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

/** v029.B — contracts ending in the next 6 months (and any that have ended
 *  while the person is still active), so renewals and exits are planned. */
function ContractsEndingPanel({ data }: { data: ExpiringContracts }) {
  const rows = data.rows;
  const within = (n: number) => rows.filter((r) => r.daysLeft <= n).length;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 8);
  return (
    <div className="card accent-purple">
      <div className="card-head flex flex-wrap items-center justify-between gap-2">
        <p className="card-title text-sm font-semibold text-ink">Contracts ending in the next {data.months} months</p>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="badge bg-red-50 text-red-700">{within(30)} within 30 days</span>
          <span className="badge bg-amber-50 text-amber-700">{within(90)} within 90 days</span>
          <span className="badge bg-slate-100 text-slate-600">{rows.length} in all</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">No contracts end before {new Date(data.until).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })}.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => (
              <li key={r.contractId}>
                <Link href={`/people/${r.employeeId}?tab=Job`} className="flex items-center gap-3 py-2.5 text-xs hover:opacity-80">
                  <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{r.name}</p>
                    <p className="truncate text-slate-400">
                      {CONTRACT_LABEL[r.contractType] ?? r.contractType}
                      {r.jobTitle ? ` · ${r.jobTitle}` : ''}
                      {r.department ? ` · ${r.department}` : ''}
                    </p>
                  </div>
                  {r.gratuity && (
                    <span className="hidden text-right text-slate-500 sm:block">
                      Gratuity {r.gratuity.rate}%
                      <br />
                      <span className="font-medium text-ink">{formatMoney(r.gratuity.accrued, COUNTRY_CURRENCY[r.countryCode])}</span>
                    </span>
                  )}
                  <span className="w-28 shrink-0 text-right">
                    <span className="block text-slate-500">{new Date(r.endDate).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span className={`badge mt-0.5 ${urgency(r.daysLeft)}`}>{endsLabel(r.daysLeft)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 8 && (
            <button className="mt-2 text-xs font-medium text-brand-blue underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** v030.A — pay runs waiting for the signed-in person's approval. */
function RunApprovalsPanel({ runs }: { runs: RunApproval[] }) {
  return (
    <div className="card accent-orange">
      <p className="card-head card-title text-sm font-semibold text-ink">Pay runs waiting for your approval</p>
      <ul className="divide-y divide-slate-100">
        {runs.map((r) => (
          <li key={r.id}>
            <Link href={`/payroll/runs/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80">
              <span>
                <span className="font-medium text-ink">
                  {r.countryCode} · {runMonth(r.periodEnd)}
                </span>
                <span className="block text-xs text-slate-500">
                  {r.totals.employees} employees · net {formatMoney(r.totals.net, RUN_CURRENCY[r.countryCode])}
                  {r.required > 1 ? ` · your approval is ${r.level} of ${r.required}` : ''}
                  {r.payDate ? ` · pay date ${new Date(r.payDate).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })}` : ''}
                </span>
              </span>
              <span className="btn-primary !py-1.5 text-xs">Review</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
