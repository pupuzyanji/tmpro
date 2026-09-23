'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { IconChevronDown } from '@/components/icons';
import { fmt } from '@/lib/format';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  status: string;
  startDate: string;
}

const PAGE_SIZE = 10;

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

export default function PeoplePage() {
  const { session, ready, call } = useApi();
  const [people, setPeople] = useState<Employee[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!ready) return;
    call<Employee[]>('/employees')
      .then(setPeople)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load employees.'));
  }, [ready, call]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.jobTitle ?? ''} ${p.department ?? ''}`.toLowerCase().includes(q),
    );
  }, [people, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sortValue(a, sortKey).localeCompare(sortValue(b, sortKey)) * dir);
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Keep the current page in range whenever the search or sort shrinks/grows
  // the result set (e.g. searching down to 3 rows while sitting on page 3).
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [sorted, safePage]);

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
  // Employee — so the page just renders whatever it receives. The subtitle
  // reflects which of those views the signed-in user is looking at.
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
          <p className="text-sm text-slate-500">{scopeLabel}</p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="Search by name, title, department…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-5 py-3 font-medium">
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-ink"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    <span className={`transition-transform ${sortKey === c.key ? 'text-ink' : 'text-slate-300'} ${sortKey === c.key && sortDir === 'desc' ? 'rotate-180' : ''}`}>
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
                    <Avatar name={`${p.firstName} ${p.lastName}`} photoUrl={p.photoUrl} size="sm" />
                    <span className="font-medium text-ink">
                      {p.firstName} {p.lastName}
                    </span>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                  No employees match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span className="text-slate-400">
                Page {safePage} of {pageCount}
              </span>
              <button
                type="button"
                className="btn-secondary px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
