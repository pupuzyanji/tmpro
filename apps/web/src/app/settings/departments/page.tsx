'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { CsvImportButton } from '@/components/csv-import-button';
import { IconPlus, IconTrash } from '@/components/icons';

interface Department {
  id: string;
  name: string;
}
interface Section {
  id: string;
  departmentId: string;
  name: string;
}

export default function DepartmentsSettingsPage() {
  const { ready, call } = useApi();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingDept, setAddingDept] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newSectionName, setNewSectionName] = useState<Record<string, string>>({});

  function refresh() {
    return Promise.all([call<Department[]>('/settings/departments'), call<Section[]>('/settings/sections')])
      .then(([d, s]) => {
        setDepartments(d);
        setSections(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load departments.'));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, call]);

  async function createDepartment() {
    if (!deptName.trim()) return;
    try {
      await call('/settings/departments', { method: 'POST', body: JSON.stringify({ name: deptName }) });
      setDeptName('');
      setAddingDept(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create department.');
    }
  }

  async function removeDepartment(id: string) {
    try {
      await call(`/settings/departments/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete department (it may still have sections or employees).');
    }
  }

  async function createSection(departmentId: string) {
    const name = newSectionName[departmentId]?.trim();
    if (!name) return;
    try {
      await call('/settings/sections', { method: 'POST', body: JSON.stringify({ departmentId, name }) });
      setNewSectionName({ ...newSectionName, [departmentId]: '' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create section.');
    }
  }

  async function removeSection(id: string) {
    try {
      await call(`/settings/sections/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete section.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{departments.length} department{departments.length === 1 ? '' : 's'}</p>
        <div className="flex gap-2">
          <CsvImportButton
            endpoint="/settings/departments/import"
            onDone={refresh}
            sampleFileName="departments-sample.csv"
            sampleColumns={[{ header: 'name', example: 'Engineering' }]}
          />
          <CsvImportButton
            endpoint="/settings/sections/import"
            onDone={refresh}
            sampleFileName="sections-sample.csv"
            sampleColumns={[
              { header: 'department', example: 'Engineering' },
              { header: 'name', example: 'Platform' },
            ]}
          />
          <button className="btn-primary flex items-center gap-1.5 whitespace-nowrap py-1.5" onClick={() => setAddingDept(true)}>
            <IconPlus /> Add department
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Two import buttons: the first expects a <code>name</code> column for Departments, the second expects{' '}
        <code>department</code> and <code>name</code> columns for Sections.
      </p>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {addingDept && (
        <div className="card flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Department name</label>
            <input className="input" value={deptName} onChange={(e) => setDeptName(e.target.value)} autoFocus />
          </div>
          <button className="btn-primary" onClick={createDepartment}>
            Save
          </button>
          <button className="btn-secondary" onClick={() => setAddingDept(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-3">
        {departments.map((d) => {
          const deptSections = sections.filter((s) => s.departmentId === d.id);
          const isOpen = expanded[d.id] ?? true;
          return (
            <div key={d.id} className="card !p-0">
              <div className="flex items-center justify-between px-5 py-3">
                <button
                  className="flex items-center gap-2 text-left font-medium text-ink"
                  onClick={() => setExpanded({ ...expanded, [d.id]: !isOpen })}
                >
                  {d.name}
                  <span className="text-xs font-normal text-slate-400">
                    {deptSections.length} section{deptSections.length === 1 ? '' : 's'}
                  </span>
                </button>
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeDepartment(d.id)}>
                  <IconTrash />
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <ul className="space-y-1.5">
                    {deptSections.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
                        <span className="text-ink">{s.name}</span>
                        <button className="text-slate-400 hover:text-red-600" onClick={() => removeSection(s.id)}>
                          <IconTrash />
                        </button>
                      </li>
                    ))}
                    {deptSections.length === 0 && <p className="text-sm text-slate-400">No sections yet.</p>}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="input"
                      placeholder="New section name"
                      value={newSectionName[d.id] ?? ''}
                      onChange={(e) => setNewSectionName({ ...newSectionName, [d.id]: e.target.value })}
                    />
                    <button className="btn-secondary whitespace-nowrap" onClick={() => createSection(d.id)}>
                      + Add section
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {departments.length === 0 && <p className="text-sm text-slate-500">No departments yet.</p>}
      </div>
    </div>
  );
}
