'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { IconPencil, IconPlus, IconTrash } from '@/components/icons';
import { fmt } from '@/lib/format';

interface Announcement {
  id: string;
  title: string;
  body: string;
  scope: 'ORGANIZATION' | 'DEPARTMENT' | 'SECTION';
  departmentId: string | null;
  sectionId: string | null;
  createdAt: string;
}
interface Department {
  id: string;
  name: string;
}
interface Section {
  id: string;
  departmentId: string;
  name: string;
}

export default function AnnouncementsSettingsPage() {
  const { ready, call } = useApi();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'ORGANIZATION' | 'DEPARTMENT' | 'SECTION'>('ORGANIZATION');
  const [departmentId, setDepartmentId] = useState('');
  const [sectionId, setSectionId] = useState('');

  function refresh() {
    return Promise.all([
      call<Announcement[]>('/settings/announcements'),
      call<Department[]>('/settings/departments'),
      call<Section[]>('/settings/sections'),
    ])
      .then(([a, d, s]) => {
        setAnnouncements([...a].reverse());
        setDepartments(d);
        setSections(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load announcements.'));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, call]);

  function resetForm() {
    setTitle('');
    setBody('');
    setScope('ORGANIZATION');
    setDepartmentId('');
    setSectionId('');
    setAdding(false);
    setEditingId(null);
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setScope(a.scope);
    setDepartmentId(a.departmentId ?? '');
    setSectionId(a.sectionId ?? '');
    setAdding(true);
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    try {
      const payload = JSON.stringify({
        title,
        body,
        scope,
        departmentId: scope === 'DEPARTMENT' ? departmentId || undefined : undefined,
        sectionId: scope === 'SECTION' ? sectionId || undefined : undefined,
      });
      if (editingId) {
        await call(`/settings/announcements/${editingId}`, { method: 'PATCH', body: payload });
      } else {
        await call('/settings/announcements', { method: 'POST', body: payload });
      }
      resetForm();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save announcement.');
    }
  }

  async function remove(id: string) {
    try {
      await call(`/settings/announcements/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete announcement.');
    }
  }

  function scopeLabel(a: Announcement) {
    if (a.scope === 'ORGANIZATION') return 'Entire organization';
    if (a.scope === 'DEPARTMENT') return `Department · ${departments.find((d) => d.id === a.departmentId)?.name ?? '—'}`;
    return `Section · ${sections.find((s) => s.id === a.sectionId)?.name ?? '—'}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Sent to every dashboard in scope — organization-wide, or filtered to a department or section.
        </p>
        <button
          className="btn-primary flex items-center gap-1.5 whitespace-nowrap py-1.5"
          onClick={() => {
            resetForm();
            setAdding(true);
          }}
        >
          <IconPlus /> New announcement
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {adding && (
        <div className="card space-y-3">
          <p className="text-sm font-semibold text-ink">{editingId ? 'Edit announcement' : 'New announcement'}</p>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Audience</label>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="ORGANIZATION">Entire organization</option>
                <option value="DEPARTMENT">A department</option>
                <option value="SECTION">A section</option>
              </select>
            </div>
            {scope === 'DEPARTMENT' && (
              <div>
                <label className="label">Department</label>
                <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Choose…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === 'SECTION' && (
              <div>
                <label className="label">Section</label>
                <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <option value="">Choose…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save}>
              {editingId ? 'Save' : 'Send'}
            </button>
            <button className="btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {announcements.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{a.title}</p>
                <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {scopeLabel(a)} · {fmt(a.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(a)}>
                  <IconPencil />
                </button>
                <button className="text-slate-400 hover:text-red-600" onClick={() => remove(a.id)}>
                  <IconTrash />
                </button>
              </div>
            </div>
          </div>
        ))}
        {announcements.length === 0 && <p className="text-sm text-slate-500">No announcements sent yet.</p>}
      </div>
    </div>
  );
}
