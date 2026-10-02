'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { IconChevronDown, IconEye, IconGrid, IconList, IconMail, IconMapPin, IconPhone, IconX } from '@/components/icons';
import { fmt } from '@/lib/format';
import { cachedPeople, loadPeople } from '@/lib/people-cache';

interface Employee {
  id: string;
  employeeCode?: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  status: string;
  startDate: string;
  managerId?: string | null;
  location?: string | null;
  workPhone?: string | null;
  email?: string | null;
  employmentType?: string | null;
  countryCode?: string | null;
}

type View = 'tiles' | 'list';
const VIEW_KEY = 'tmpro:people-view';
const LIST_PAGE_SIZE = 10;
const TILE_PAGE_SIZES = [12, 24, 48];
const NO_DEPARTMENT = 'No department';

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  CASUAL: 'Casual',
  INTERN: 'Intern',
};

type SortKey = 'name' | 'jobTitle' | 'department' | 'status' | 'startDate';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Employee' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'status', label: 'Status' },
  { key: 'startDate', label: 'Started' },
];

function sortValue(p: Employee, key: SortKey): string {
  switch (key) {
    case 'name':
      return `${p.lastName} ${p.firstName}`.toLowerCase();
    case 'jobTitle':
      return (p.jobTitle ?? '').toLowerCase();
    case 'department':
      return (p.department ?? '').toLowerCase();
    case 'status':
      return p.status.toLowerCase();
    case 'startDate':
      return p.startDate;
  }
}

const fullName = (p: Employee) => `${p.firstName} ${p.lastName}`;
const deptOf = (p: Employee) => p.department?.trim() || NO_DEPARTMENT;

/** People — v029.B: a paginated tile view grouped by department (the
 *  default), with a Quick view of each person, or the sortable list. */
export default function PeoplePage() {
  const { session, ready, call } = useApi();
  const [people, setPeople] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>('tiles');
  const [tileSize, setTileSize] = useState(TILE_PAGE_SIZES[0]);
  const [quick, setQuick] = useState<Employee | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'tiles') setView(saved);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  function changeView(v: View) {
    setView(v);
    setPage(1);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  // v030.C — show the list from the last visit at once, then refresh it in
  // the background; until the first load finishes show placeholders, never
  // an empty "no employees" message.
  const cacheKey = session ? `${session.tenant.slug}:${session.user.id}` : null;
  useEffect(() => {
    if (!ready || !session || !cacheKey) return;
    const have = cachedPeople(cacheKey);
    if (have) {
      setPeople(have);
      setLoaded(true);
    }
    let cancelled = false;
    loadPeople(cacheKey, session.accessToken)
      .then((list) => {
        if (cancelled) return;
        setPeople(list);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load employees.');
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cacheKey]);

  useEffect(() => {
    if (!quick) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setQuick(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.jobTitle ?? ''} ${p.department ?? ''} ${p.location ?? ''}`.toLowerCase().includes(q),
    );
  }, [people, query]);

  const sorted = useMemo(() => {
    if (view === 'tiles') {
      // Department groups A–Z ("No department" last), then people by name.
      return [...filtered].sort((a, b) => {
        const da = deptOf(a);
        const db = deptOf(b);
        if (da !== db) {
          if (da === NO_DEPARTMENT) return 1;
          if (db === NO_DEPARTMENT) return -1;
          return da.localeCompare(db);
        }
        return sortValue(a, 'name').localeCompare(sortValue(b, 'name'));
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sortValue(a, sortKey).localeCompare(sortValue(b, sortKey)) * dir);
  }, [filtered, sortKey, sortDir, view]);

  const pageSize = view === 'tiles' ? tileSize : LIST_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Keep the current page in range whenever the search shrinks the result set.
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => sorted.slice((safePage - 1) * pageSize, safePage * pageSize), [sorted, safePage, pageSize]);

  const deptTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filtered) m.set(deptOf(p), (m.get(deptOf(p)) ?? 0) + 1);
    return m;
  }, [filtered]);

  const groups = useMemo(() => {
    const out: Array<{ name: string; people: Employee[] }> = [];
    for (const p of paged) {
      const d = deptOf(p);
      const last = out.at(-1);
      if (last && last.name === d) last.people.push(p);
      else out.push({ name: d, people: [p] });
    }
    return out;
  }, [paged]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  if (!ready) return null;

  // The API already scopes what comes back — full directory for Admin/HR,
  // the team (plus self) for a Supervisor, just their own record for an
  // Employee — so the page just renders whatever it receives.
  const scopeLabel =
    session?.user.role === 'ADMIN' || session?.user.role === 'HR'
      ? `${filtered.length} of ${people.length} employees`
      : session?.user.role === 'SUPERVISOR'
        ? `${filtered.length} of ${people.length} on your team`
        : 'Your profile';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">People</h1>
          <p className="text-sm text-slate-500">{loaded ? scopeLabel : 'Loading…'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input !w-72"
            placeholder="Search people…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label="View">
            {(
              [
                ['tiles', 'Tiles', <IconGrid key="g" />],
                ['list', 'List', <IconList key="l" />],
              ] as const
            ).map(([v, label, icon]) => (
              <button
                key={v}
                type="button"
                title={`${label} view`}
                aria-pressed={view === v}
                onClick={() => changeView(v)}
                className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? 'bg-[color:var(--section)] text-white' : 'text-slate-500 hover:text-ink'
                }`}
              >
                <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {view === 'tiles' ? (
        <div className="space-y-6">
          {!loaded && <TileSkeleton />}
          {loaded && filtered.length === 0 && (
            <p className="card text-center text-sm text-slate-500">{query ? `No employees match “${query}”.` : 'No employees yet.'}</p>
          )}
          {groups.map((g) => (
            <section key={g.name} className="rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-100">
              <h2 className="mb-3 text-sm font-semibold text-ink">
                {g.name} <span className="font-normal text-slate-400">({deptTotals.get(g.name) ?? g.people.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.people.map((p) => (
                  <PersonTile key={p.id} p={p} onQuick={() => setQuick(p)} />
                ))}
              </div>
            </section>
          ))}
          {sorted.length > 0 && (
            <Pager
              from={(safePage - 1) * pageSize + 1}
              to={Math.min(safePage * pageSize, sorted.length)}
              total={sorted.length}
              page={safePage}
              pageCount={pageCount}
              onPage={setPage}
              extra={
                <label className="flex items-center gap-1.5">
                  Per page
                  <select
                    className="input !w-auto !py-1 !pl-2 !pr-7 text-xs"
                    value={tileSize}
                    onChange={(e) => {
                      setTileSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {TILE_PAGE_SIZES.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              }
              className="card !py-3"
            />
          )}
        </div>
      ) : (
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-5 py-3 font-medium">
                    <button type="button" className="flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span
                        className={`transition-transform ${sortKey === c.key ? 'text-ink' : 'text-slate-300'} ${sortKey === c.key && sortDir === 'desc' ? 'rotate-180' : ''}`}
                      >
                        <IconChevronDown />
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/people/${p.id}`} className="flex items-center gap-3">
                      <Avatar name={fullName(p)} photoUrl={p.photoUrl} size="sm" />
                      <span className="font-medium text-ink">{fullName(p)}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.jobTitle ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{p.department ?? '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={p.status} kind="employee" />
                  </td>
                  <td className="px-5 py-3 text-slate-500">{fmt(p.startDate)}</td>
                </tr>
              ))}
              {!loaded &&
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0" aria-hidden="true">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <span className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
                        <span className="h-3 w-36 animate-pulse rounded bg-slate-200" />
                      </span>
                    </td>
                    {[28, 24, 14, 20].map((w, j) => (
                      <td key={j} className="px-5 py-3">
                        <span className="block h-3 animate-pulse rounded bg-slate-100" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {loaded && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                    {query ? `No employees match “${query}”.` : 'No employees yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {sorted.length > 0 && (
            <Pager
              from={(safePage - 1) * pageSize + 1}
              to={Math.min(safePage * pageSize, sorted.length)}
              total={sorted.length}
              page={safePage}
              pageCount={pageCount}
              onPage={setPage}
              className="border-t border-slate-100 px-5 py-3"
            />
          )}
        </div>
      )}

      {quick && <QuickView p={quick} manager={quick.managerId ? byId.get(quick.managerId) : undefined} onClose={() => setQuick(null)} />}
    </div>
  );
}

/** Placeholder tiles shown while the directory loads for the first time. */
function TileSkeleton() {
  return (
    <section className="rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-100" aria-busy="true" aria-label="Loading people">
      <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3.5 rounded-xl border border-slate-100 bg-white p-4 shadow-card">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PersonTile({ p, onQuick }: { p: Employee; onQuick: () => void }) {
  return (
    <div className="group relative flex gap-3.5 rounded-xl border border-slate-100 bg-white p-4 shadow-card transition-shadow hover:shadow-md">
      <Avatar name={fullName(p)} photoUrl={p.photoUrl} size="lg" />
      <div className="min-w-0 flex-1 pr-9">
        <p className="truncate font-semibold text-ink" title={fullName(p)}>
          {fullName(p)}
        </p>
        <p className="truncate text-sm text-slate-500">{p.jobTitle ?? '—'}</p>
        <Link href={`/people/${p.id}`} className="mt-1.5 inline-block text-sm font-semibold text-[color:var(--section)] hover:underline">
          View full profile
        </Link>
        {p.location && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0">
            <IconMapPin />
            <span className="truncate">{p.location}</span>
          </p>
        )}
        {p.status !== 'ACTIVE' && (
          <div className="mt-1.5">
            <StatusBadge status={p.status} kind="employee" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onQuick}
        className="absolute right-3 top-3 flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] leading-tight text-slate-500 hover:bg-slate-50 hover:text-ink"
        aria-label={`Quick view of ${fullName(p)}`}
      >
        <span className="text-[color:var(--section)]">
          <IconEye />
        </span>
        Quick
        <br />
        view
      </button>
    </div>
  );
}

function QuickView({ p, manager, onClose }: { p: Employee; manager?: Employee; onClose: () => void }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Department', p.department ?? '—'],
    ['Employee number', p.employeeCode ?? '—'],
    ['Employment', EMPLOYMENT_LABEL[p.employmentType ?? ''] ?? p.employmentType ?? '—'],
    ['Started', fmt(p.startDate)],
    ['Reports to', manager ? fullName(manager) : '—'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Quick view of ${fullName(p)}`}>
      <div className="card relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-ink" aria-label="Close">
          <IconX />
        </button>
        <div className="flex items-center gap-4">
          <Avatar name={fullName(p)} photoUrl={p.photoUrl} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink">{fullName(p)}</p>
            <p className="text-sm text-slate-500">{p.jobTitle ?? '—'}</p>
            <div className="mt-1">
              <StatusBadge status={p.status} kind="employee" />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 text-sm text-slate-600 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-slate-400">
          {p.email && (
            <a href={`mailto:${p.email}`} className="flex items-center gap-2 hover:text-ink">
              <IconMail />
              {p.email}
            </a>
          )}
          {p.workPhone && (
            <a href={`tel:${p.workPhone}`} className="flex items-center gap-2 hover:text-ink">
              <IconPhone />
              {p.workPhone}
            </a>
          )}
          {p.location && (
            <p className="flex items-center gap-2">
              <IconMapPin />
              {p.location}
            </p>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-400">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <Link href={`/people/${p.id}`} className="btn-primary">
            View full profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function Pager({
  from,
  to,
  total,
  page,
  pageCount,
  onPage,
  extra,
  className = '',
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  onPage: (n: number) => void;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 ${className}`}>
      <p>
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-3">
        {extra}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-slate-400">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
