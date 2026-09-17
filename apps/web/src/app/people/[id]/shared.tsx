'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { IconPencil, IconPlus, IconTrash } from '@/components/icons';
import type {
  BranchOption,
  DepartmentOption,
  DesignationOption,
  EmployeeOption,
  SectionOption,
} from './types';

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-sm text-ink">{value ?? '—'}</p>
    </div>
  );
}

export function SectionHeader({
  title,
  canEdit,
  editing,
  onEdit,
}: {
  title: string;
  canEdit: boolean;
  editing?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {canEdit && !editing && onEdit && (
        <button className="btn-secondary py-1" onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

/** The org-structure lookups (branches/departments/sections/designations)
 *  plus the employee directory (for manager/reviewer/supervisor pickers) —
 *  shared across the General Info, Job, and Performance tabs so each isn't
 *  re-fetching the same four lists. */
export function useOrgOptions() {
  const { ready, call } = useApi();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready || loaded) return;
    Promise.all([
      call<EmployeeOption[]>('/employees'),
      call<BranchOption[]>('/settings/branches'),
      call<DepartmentOption[]>('/settings/departments'),
      call<SectionOption[]>('/settings/sections'),
      call<DesignationOption[]>('/settings/designations'),
    ])
      .then(([e, b, d, s, des]) => {
        setEmployees(e);
        setBranches(b);
        setDepartments(d);
        setSections(s);
        setDesignations(des);
        setLoaded(true);
      })
      .catch(() => {
        // Non-admin roles can't read most Settings endpoints — the tabs that
        // need these options are Admin-only to edit anyway, so a silent
        // empty list is fine for read-only viewers.
      });
  }, [ready, loaded, call]);

  return { employees, branches, departments, sections, designations };
}

export function nameOf<T extends { id: string }>(list: T[], id: string | null, key: keyof T): string | null {
  if (!id) return null;
  const row = list.find((r) => r.id === id);
  return row ? ((row[key] as unknown as string) ?? null) : null;
}

export interface AddField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  span2?: boolean;
}

export interface TableColumn<T> {
  header: string;
  render: (row: T) => React.ReactNode;
}

/** A titled card holding a dated/append-only or freely-addable list — Work
 *  Experience / Education / Dependents on the General Info tab, the four
 *  Job-tab history logs, and the Performance tab's Reviews/Comments/Goals
 *  all share this same "list of rows + an inline add/edit form" shape.
 *
 *  Two row-rendering modes: pass `renderRow` for the original flex-wrap row
 *  list, or `columns` for a proper `<table>` (Job tab history — most recent
 *  entry first, as `items` is already sorted by the API). Pass `onEdit` +
 *  `editValuesFor` to add an Edit action alongside Delete; the same add
 *  form is reused, pre-filled from the row being edited. */
export function AddableList<T extends { id: string }>({
  title,
  items,
  renderRow,
  columns,
  canEdit,
  addLabel = 'Add',
  addFields,
  onAdd,
  onEdit,
  editValuesFor,
  onDelete,
  emptyText,
}: {
  title: string;
  items: T[];
  renderRow?: (row: T) => React.ReactNode;
  columns?: TableColumn<T>[];
  canEdit: boolean;
  addLabel?: string;
  addFields: AddField[];
  onAdd: (values: Record<string, string>) => Promise<void>;
  onEdit?: (id: string, values: Record<string, string>) => Promise<void>;
  editValuesFor?: (row: T) => Record<string, string>;
  onDelete?: (id: string) => Promise<void>;
  emptyText: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setValues({});
    setError(null);
  }

  function startEdit(row: T) {
    setEditingId(row.id);
    setAdding(false);
    setValues(editValuesFor ? editValuesFor(row) : {});
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (editingId && onEdit) {
        await onEdit(editingId, values);
      } else {
        await onAdd(values);
      }
      setValues({});
      setAdding(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const formOpen = adding || editingId !== null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {canEdit && !formOpen && (
          <button className="btn-secondary flex items-center gap-1.5 whitespace-nowrap py-1" onClick={() => setAdding(true)}>
            <IconPlus /> {addLabel}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {formOpen && (
        <div className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
          <p className="text-sm font-semibold text-ink sm:col-span-2">{editingId ? 'Edit entry' : addLabel}</p>
          {addFields.map((f) => (
            <div key={f.name} className={f.span2 ? 'sm:col-span-2' : undefined}>
              <label className="label">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea className="input" rows={2} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
              ) : f.type === 'select' ? (
                <select className="input" value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type ?? 'text'}
                  className="input"
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {columns ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                {columns.map((c) => (
                  <th key={c.header} className="px-2 py-2 font-medium">
                    {c.header}
                  </th>
                ))}
                {canEdit && (onEdit || onDelete) && <th className="px-2 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 last:border-0">
                  {columns.map((c) => (
                    <td key={c.header} className="px-2 py-2 text-ink align-top">
                      {c.render(row)}
                    </td>
                  ))}
                  {canEdit && (onEdit || onDelete) && (
                    <td className="px-2 py-2 text-right align-top">
                      <div className="flex items-center justify-end gap-3">
                        {onEdit && (
                          <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(row)}>
                            <IconPencil />
                          </button>
                        )}
                        {onDelete && (
                          <button className="text-slate-400 hover:text-red-600" onClick={() => onDelete(row.id)}>
                            <IconTrash />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-2 py-4 text-sm text-slate-400">
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-ink">{renderRow?.(row)}</div>
              {canEdit && (onEdit || onDelete) && (
                <div className="flex items-center gap-3">
                  {onEdit && (
                    <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(row)}>
                      <IconPencil />
                    </button>
                  )}
                  {onDelete && (
                    <button className="text-slate-400 hover:text-red-600" onClick={() => onDelete(row.id)}>
                      <IconTrash />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-400">{emptyText}</p>}
        </div>
      )}
    </div>
  );
}
