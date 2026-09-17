'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { AddableList, useOrgOptions } from './shared';
import { GOAL_STATUSES, fmtOrDash, toDateInput, personName, type EmployeeDetail } from './types';

interface ReviewEntry {
  id: string;
  reviewerId: string | null;
  jobKnowledge: number | null;
  workQuality: number | null;
  attendance: number | null;
  communication: number | null;
  dependability: number | null;
  date: string;
}
interface CommentEntry {
  id: string;
  reviewerId: string | null;
  comment: string;
  date: string;
}
interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  supervisorId: string | null;
  employeeAssessment: string | null;
  supervisorAssessment: string | null;
}

const RATING_FIELDS = [
  { name: 'jobKnowledge', label: 'Job knowledge' },
  { name: 'workQuality', label: 'Work quality' },
  { name: 'attendance', label: 'Attendance' },
  { name: 'communication', label: 'Communication' },
  { name: 'dependability', label: 'Dependability' },
] as const;

export function PerformanceTab({
  person,
  call,
  canEdit,
}: {
  person: EmployeeDetail;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const org = useOrgOptions();

  return (
    <div className="space-y-6">
      <ReviewsCard employeeId={person.id} call={call} canEdit={canEdit} org={org} />
      <CommentsCard employeeId={person.id} call={call} canEdit={canEdit} org={org} />
      <GoalsCard employeeId={person.id} call={call} canEdit={canEdit} org={org} />
    </div>
  );
}

function ratingScore(r: ReviewEntry) {
  const vals = [r.jobKnowledge, r.workQuality, r.attendance, r.communication, r.dependability].filter(
    (v): v is number => v != null,
  );
  if (vals.length === 0) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function ReviewsCard({
  employeeId,
  call,
  canEdit,
  org,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  org: ReturnType<typeof useOrgOptions>;
}) {
  const [items, setItems] = useState<ReviewEntry[]>([]);

  function refresh() {
    return call<ReviewEntry[]>(`/employees/${employeeId}/performance/reviews`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<ReviewEntry>
      title="Performance reviews"
      items={items}
      canEdit={canEdit}
      emptyText="No performance reviews on file."
      addFields={[
        { name: 'reviewerId', label: 'Reviewer', type: 'select', options: org.employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })) },
        { name: 'date', label: 'Date', type: 'date' },
        ...RATING_FIELDS.map((f) => ({ name: f.name, label: `${f.label} (1–5)`, type: 'number' as const })),
      ]}
      onAdd={async (v) => {
        const body: Record<string, unknown> = { reviewerId: v.reviewerId || undefined, date: v.date || undefined };
        for (const f of RATING_FIELDS) {
          body[f.name] = v[f.name] ? parseInt(v[f.name], 10) : undefined;
        }
        await call(`/employees/${employeeId}/performance/reviews`, { method: 'POST', body: JSON.stringify(body) });
        await refresh();
      }}
      onEdit={async (id, v) => {
        const body: Record<string, unknown> = { reviewerId: v.reviewerId || undefined, date: v.date || undefined };
        for (const f of RATING_FIELDS) {
          body[f.name] = v[f.name] ? parseInt(v[f.name], 10) : undefined;
        }
        await call(`/employees/${employeeId}/performance/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        await refresh();
      }}
      editValuesFor={(row) => {
        const values: Record<string, string> = { reviewerId: row.reviewerId ?? '', date: toDateInput(row.date) };
        for (const f of RATING_FIELDS) {
          const v = row[f.name as keyof ReviewEntry];
          values[f.name] = v != null ? String(v) : '';
        }
        return values;
      }}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/performance/reviews/${id}`, { method: 'DELETE' });
        await refresh();
      }}
      renderRow={(row) => (
        <>
          <span className="font-medium">Score: {ratingScore(row) ?? '—'}</span>
          <span className="text-slate-500">By {personName(org.employees.find((e) => e.id === row.reviewerId)) ?? 'Unknown'}</span>
          <span className="text-slate-400">{fmtOrDash(row.date)}</span>
        </>
      )}
    />
  );
}

function CommentsCard({
  employeeId,
  call,
  canEdit,
  org,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  org: ReturnType<typeof useOrgOptions>;
}) {
  const [items, setItems] = useState<CommentEntry[]>([]);

  function refresh() {
    return call<CommentEntry[]>(`/employees/${employeeId}/performance/comments`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<CommentEntry>
      title="Performance comments"
      items={items}
      canEdit={canEdit}
      emptyText="No comments on file."
      addFields={[
        { name: 'reviewerId', label: 'From', type: 'select', options: org.employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })) },
        { name: 'date', label: 'Date', type: 'date' },
        { name: 'comment', label: 'Comment', type: 'textarea', span2: true },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/performance/comments`, {
          method: 'POST',
          body: JSON.stringify({ ...v, reviewerId: v.reviewerId || undefined, date: v.date || undefined }),
        });
        await refresh();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/performance/comments/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, reviewerId: v.reviewerId || undefined, date: v.date || undefined }),
        });
        await refresh();
      }}
      editValuesFor={(row) => ({
        reviewerId: row.reviewerId ?? '',
        date: toDateInput(row.date),
        comment: row.comment,
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/performance/comments/${id}`, { method: 'DELETE' });
        await refresh();
      }}
      renderRow={(row) => (
        <>
          <span className="font-medium">{personName(org.employees.find((e) => e.id === row.reviewerId)) ?? 'Unknown'}</span>
          <span className="text-slate-500">{row.comment}</span>
          <span className="text-slate-400">{fmtOrDash(row.date)}</span>
        </>
      )}
    />
  );
}

function GoalsCard({
  employeeId,
  call,
  canEdit,
  org,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  org: ReturnType<typeof useOrgOptions>;
}) {
  const [items, setItems] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return call<Goal[]>(`/employees/${employeeId}/performance/goals`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Performance goals</h2>
        {canEdit && !adding && (
          <button className="btn-secondary whitespace-nowrap py-1" onClick={() => setAdding(true)}>
            + Add goal
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {adding && (
        <GoalForm
          org={org}
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            try {
              await call(`/employees/${employeeId}/performance/goals`, { method: 'POST', body: JSON.stringify(body) });
              setAdding(false);
              await refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not save goal.');
            }
          }}
        />
      )}
      <div className="space-y-2">
        {items.map((g) =>
          editingId === g.id ? (
            <GoalForm
              key={g.id}
              goal={g}
              org={org}
              onCancel={() => setEditingId(null)}
              onSave={async (body) => {
                try {
                  await call(`/employees/${employeeId}/performance/goals/${g.id}`, { method: 'PATCH', body: JSON.stringify(body) });
                  setEditingId(null);
                  await refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Could not save goal.');
                }
              }}
            />
          ) : (
            <div key={g.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-ink">{g.title}</span>
                  <StatusBadge status={g.status} kind="goal" />
                  {g.dueDate && <span className="text-slate-400">Due {fmtOrDash(g.dueDate)}</span>}
                </div>
                {canEdit && (
                  <button className="btn-secondary py-1" onClick={() => setEditingId(g.id)}>
                    Edit
                  </button>
                )}
              </div>
              {g.description && <p className="mt-1 text-slate-500">{g.description}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                {g.supervisorId && <span>Supervisor: {personName(org.employees.find((e) => e.id === g.supervisorId))}</span>}
                {g.employeeAssessment && <span>Employee assessment: {g.employeeAssessment}</span>}
                {g.supervisorAssessment && <span>Supervisor assessment: {g.supervisorAssessment}</span>}
              </div>
            </div>
          ),
        )}
        {items.length === 0 && !adding && <p className="text-sm text-slate-400">No goals set yet.</p>}
      </div>
    </div>
  );
}

function GoalForm({
  goal,
  org,
  onSave,
  onCancel,
}: {
  goal?: Goal;
  org: ReturnType<typeof useOrgOptions>;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    dueDate: toDateInput(goal?.dueDate),
    supervisorId: goal?.supervisorId ?? '',
    status: goal?.status ?? 'NOT_STARTED',
    employeeAssessment: goal?.employeeAssessment ?? '',
    supervisorAssessment: goal?.supervisorAssessment ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        ...form,
        dueDate: form.dueDate || undefined,
        supervisorId: form.supervisorId || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Title</label>
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <label className="label">Due date</label>
        <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {GOAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Supervisor</label>
        <select className="input" value={form.supervisorId} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>
          <option value="">—</option>
          {org.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Employee assessment</label>
        <input className="input" value={form.employeeAssessment} onChange={(e) => setForm({ ...form, employeeAssessment: e.target.value })} />
      </div>
      <div>
        <label className="label">Supervisor assessment</label>
        <input className="input" value={form.supervisorAssessment} onChange={(e) => setForm({ ...form, supervisorAssessment: e.target.value })} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
