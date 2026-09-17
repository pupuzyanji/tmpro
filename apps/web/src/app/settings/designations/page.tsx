'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { CsvImportButton } from '@/components/csv-import-button';
import { IconPencil, IconPlus, IconTrash } from '@/components/icons';

interface Designation {
  id: string;
  title: string;
  reportsToDesignationId: string | null;
}

export default function DesignationsSettingsPage() {
  const { ready, call } = useApi();
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [reportsTo, setReportsTo] = useState('');

  function refresh() {
    return call<Designation[]>('/settings/designations')
      .then(setDesignations)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load designations.'));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, call]);

  function resetForm() {
    setTitle('');
    setReportsTo('');
    setAdding(false);
    setEditingId(null);
  }

  function startEdit(d: Designation) {
    setEditingId(d.id);
    setTitle(d.title);
    setReportsTo(d.reportsToDesignationId ?? '');
    setAdding(true);
  }

  async function save() {
    if (!title.trim()) return;
    try {
      const body = JSON.stringify({ title, reportsToDesignationId: reportsTo || undefined });
      if (editingId) {
        await call(`/settings/designations/${editingId}`, { method: 'PATCH', body });
      } else {
        await call('/settings/designations', { method: 'POST', body });
      }
      resetForm();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save designation.');
    }
  }

  async function remove(id: string) {
    try {
      await call(`/settings/designations/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete designation.');
    }
  }

  function titleOf(id: string | null) {
    if (!id) return '—';
    return designations.find((d) => d.id === id)?.title ?? '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {designations.length} designation{designations.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <CsvImportButton
            endpoint="/settings/designations/import"
            onDone={refresh}
            sampleFileName="designations-sample.csv"
            sampleColumns={[
              { header: 'title', example: 'Engineering Manager' },
              { header: 'reportsTo', example: 'Head of Engineering' },
            ]}
          />
          <button
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap py-1.5"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            <IconPlus /> Add designation
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Import expects <code>title</code> and an optional <code>reportsTo</code> column (the title of another
        designation).
      </p>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {adding && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <p className="text-sm font-semibold text-ink sm:col-span-2">{editingId ? 'Edit designation' : 'New designation'}</p>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Reports to</label>
            <select className="input" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
              <option value="">No one (top of the org)</option>
              {designations
                .filter((d) => d.id !== editingId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" onClick={save}>
              Save
            </button>
            <button className="btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Reports to</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {designations.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-ink">{d.title}</td>
                <td className="px-5 py-3 text-slate-600">{titleOf(d.reportsToDesignationId)}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(d)}>
                      <IconPencil />
                    </button>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => remove(d.id)}>
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {designations.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">
                  No designations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
