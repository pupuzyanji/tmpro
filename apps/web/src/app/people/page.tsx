'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
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

export default function PeoplePage() {
  const { session, ready, call } = useApi();
  const [people, setPeople] = useState<Employee[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Job title</th>
              <th className="px-5 py-3 font-medium">Department</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
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
      </div>
    </div>
  );
}
