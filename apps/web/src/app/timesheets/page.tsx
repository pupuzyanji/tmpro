'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { IconPlus } from '@/components/icons';
import { Timesheet, toDateInput } from '@/lib/timesheets-shared';
import { AddTimesheetModal, AddWeeklyTimesheetModal, EditTimesheetModal } from './timesheet-modals';

const PAGE_SIZE = 10;

interface MeSummary {
  jobTitle: string | null;
  location: string | null;
}

/** Timesheets (v022.A) — structurally a sibling of Requisitions' tab-bar
 *  page: "My Timesheets" (every allocated employee) plus a "Review" tab for
 *  whoever can decide entries (Supervisor: their team; Admin/HR: everyone).
 *  Gated at the sidebar by the tenant's Timesheets module toggle (see
 *  app-shell.tsx) and, per employee, by the timesheetsEnabled flag an
 *  Admin/HR sets in Settings → Employees — the module is the tenant opting
 *  in, the flag is who inside that tenant actually uses it. */
export default function TimesheetsPage() {
  const { session, ready, call } = useApi();
  const [mine, setMine] = useState<Timesheet[]>([]);
  const [reviewItems, setReviewItems] = useState<Timesheet[]>([]);
  const [me, setMe] = useState<MeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'review'>('mine');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [editing, setEditing] = useState<Timesheet | null>(null);

  const role = session?.user.role;
  const canReview = role === 'SUPERVISOR' || role === 'ADMIN' || role === 'HR';
  const reviewEndpoint = role === 'ADMIN' || role === 'HR' ? '/timesheets' : '/timesheets/team';

  async function refreshMine() {
    try {
      setMine(await call<Timesheet[]>('/timesheets/me'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your timesheets.');
    }
  }

  async function refreshReview() {
    if (!canReview) return;
    try {
      setReviewItems(await call<Timesheet[]>(reviewEndpoint));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load timesheets to review.');
    }
  }

  useEffect(() => {
    if (!ready) return;
    refreshMine();
    call<MeSummary>('/employees/me')
      .then(setMe)
      .catch(() => setMe(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || tab !== 'review') return;
    refreshReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  const rows = tab === 'mine' ? mine : reviewItems;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const employeeName = r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '';
      return [r.workSite, r.position, r.workType, r.status, employeeName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function decide(id: string, decision: 'approve' | 'decline') {
    try {
      await call(`/timesheets/${id}/${decision}`, { method: 'POST' });
      refreshReview();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that decision.');
    }
  }

  async function remove(id: string) {
    try {
      await call(`/timesheets/${id}`, { method: 'DELETE' });
      refreshMine();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this entry.');
    }
  }

  function formatBreaks(entry: Timesheet) {
    if (!entry.breaks || entry.breaks.length === 0) return '—';
    return `${entry.breaks.length} break${entry.breaks.length === 1 ? '' : 's'}`;
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Timesheets</h1>
          <p className="text-sm text-slate-500">
            {tab === 'mine'
              ? 'Log your hours and track their approval.'
              : 'Approve or decline pending timesheet entries.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'mine' && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setShowWeekly(true)}>
                Add Weekly Timesheet
              </button>
              <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setShowAdd(true)}>
                <IconPlus /> Add Timesheet
              </button>
            </>
          )}
          {canReview && (
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
              <button
                type="button"
                className={`rounded-lg px-3.5 py-1.5 transition-colors ${tab === 'mine' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
                onClick={() => setTab('mine')}
              >
                My Timesheets
              </button>
              <button
                type="button"
                className={`rounded-lg px-3.5 py-1.5 transition-colors ${tab === 'review' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
                onClick={() => setTab('review')}
              >
                Review
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="card !p-3">
        <input
          className="input"
          placeholder="Advanced search / filter — work site, position, work type, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              {tab === 'review' && <th className="px-4 py-3 font-medium">Employee</th>}
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Start Time</th>
              <th className="px-4 py-3 font-medium">End Time</th>
              <th className="px-4 py-3 font-medium">Breaks</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Work Site</th>
              <th className="px-4 py-3 font-medium">Position</th>
              <th className="px-4 py-3 font-medium">Work Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Info</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {tab === 'review' && (
                    <td className="px-4 py-3 text-slate-600">
                      {t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-600">{toDateInput(t.date)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.startTime}</td>
                  <td className="px-4 py-3 text-slate-600">{t.endTime}</td>
                  <td className="px-4 py-3 text-slate-600">{formatBreaks(t)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{t.totalHours}h</td>
                  <td className="px-4 py-3 text-slate-600">{t.workSite ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{t.position ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{t.workType ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-ink underline-offset-2 hover:underline"
                      onClick={() => setInfoId(infoId === t.id ? null : t.id)}
                    >
                      {infoId === t.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {tab === 'mine' && t.status === 'PENDING' && (
                      <div className="flex items-center gap-3">
                        <button type="button" className="text-xs font-medium text-ink hover:underline" onClick={() => setEditing(t)}>
                          Edit
                        </button>
                        <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => remove(t.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                    {tab === 'review' && t.status === 'PENDING' && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-600 hover:underline"
                          onClick={() => decide(t.id, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-red-600 hover:underline"
                          onClick={() => decide(t.id, 'decline')}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {t.status !== 'PENDING' && <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
                {infoId === t.id && (
                  <tr className="border-b border-slate-50 bg-slate-50/60">
                    <td colSpan={tab === 'review' ? 12 : 11} className="px-4 py-3 text-xs text-slate-600">
                      {t.breaks && t.breaks.length > 0 && (
                        <p className="mb-1">
                          <span className="font-medium text-ink">Breaks:</span>{' '}
                          {t.breaks.map((b) => `${b.start}–${b.end}`).join(', ')}
                        </p>
                      )}
                      <p className="mb-1">
                        <span className="font-medium text-ink">Notes:</span> {t.notes || '—'}
                      </p>
                      {t.decidedAt && (
                        <p>
                          <span className="font-medium text-ink">Decided:</span> {new Date(t.decidedAt).toLocaleString()}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={tab === 'review' ? 12 : 11} className="px-4 py-6 text-center text-sm text-slate-500">
                  {tab === 'mine' ? 'No timesheet entries yet.' : 'Nothing to review.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary py-1"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <AddTimesheetModal
          defaultWorkSite={me?.location ?? ''}
          defaultPosition={me?.jobTitle ?? ''}
          call={call}
          onClose={() => setShowAdd(false)}
          onSaved={refreshMine}
        />
      )}
      {showWeekly && (
        <AddWeeklyTimesheetModal
          defaultWorkSite={me?.location ?? ''}
          defaultPosition={me?.jobTitle ?? ''}
          call={call}
          onClose={() => setShowWeekly(false)}
          onSaved={refreshMine}
        />
      )}
      {editing && (
        <EditTimesheetModal timesheet={editing} call={call} onClose={() => setEditing(null)} onSaved={refreshMine} />
      )}
    </div>
  );
}
