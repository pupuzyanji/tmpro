'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { IconChevronRight, IconPencil, IconTrash } from '@/components/icons';
import { type Adjustment, type Branding, type EmployeeOption } from '../shared';

/** Additions/deductions an Admin schedules onto an employee's future payroll
 *  runs — a one-off bonus, or an advance clawed back over several runs.
 *  Applied automatically inside the next matching payroll run(s). Any
 *  still-PENDING adjustment can be edited in place (type/label/amount/how
 *  many runs it applies over) — once it's COMPLETED or CANCELLED it's
 *  locked in, since payslips already carry a snapshot of what applied. */
export default function AdjustmentsPage() {
  const { session, ready, call } = useApi();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const isAdmin = session?.user.role === 'ADMIN' || session?.user.role === 'HR';

  async function refresh() {
    if (!ready) return;
    try {
      const [employeesRes, adjustmentsRes] = await Promise.all([
        call<EmployeeOption[]>('/employees'),
        call<Adjustment[]>('/payroll/adjustments'),
      ]);
      setEmployees(employeesRes);
      setAdjustments(adjustmentsRes);
      setBranding(await call<Branding>('/settings/organization-branding').catch(() => null));
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Could not load adjustments.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function employeeLabel(id: string) {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}${e.employeeCode ? ` (${e.employeeCode})` : ''}` : id;
  }

  async function cancelAdjustment(id: string) {
    try {
      await call(`/payroll/adjustments/${id}`, { method: 'DELETE' });
      setAdjustments(await call<Adjustment[]>('/payroll/adjustments'));
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : 'Could not cancel that adjustment.');
    }
  }

  if (!ready) return null;
  if (!isAdmin) return <p className="text-sm text-slate-500">Additions & Deductions is an HR Admin area.</p>;

  return (
    <div className="space-y-4">
      {pageError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      <AdjustmentsPanel
        employees={employees}
        adjustments={adjustments}
        currency={branding?.currency ?? null}
        employeeLabel={employeeLabel}
        onChanged={async () => setAdjustments(await call<Adjustment[]>('/payroll/adjustments'))}
        onCancel={cancelAdjustment}
        call={call}
      />
    </div>
  );
}

function AdjustmentsPanel({
  employees,
  adjustments,
  currency,
  employeeLabel,
  onChanged,
  onCancel,
  call,
}: {
  employees: EmployeeOption[];
  adjustments: Adjustment[];
  currency: string | null;
  employeeLabel: (id: string) => string;
  onChanged: () => Promise<void>;
  onCancel: (id: string) => void;
  call: ReturnType<typeof useApi>['call'];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [type, setType] = useState<'ADDITION' | 'DEDUCTION'>('ADDITION');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [occurrences, setOccurrences] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setSelectedEmployeeIds([]);
    setType('ADDITION');
    setLabel('');
    setAmount('');
    setOccurrences('1');
    setError(null);
  }

  function startEdit(a: Adjustment) {
    setEditingId(a.id);
    setSelectedEmployeeIds([a.employeeId]);
    setType(a.type);
    setLabel(a.label);
    setAmount(String(a.amount));
    setOccurrences(String(a.occurrences));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !amount) return;
    if (!editingId && selectedEmployeeIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await call(`/payroll/adjustments/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            type,
            label,
            amount: parseFloat(amount),
            occurrences: parseInt(occurrences, 10) || 1,
          }),
        });
      } else {
        await call('/payroll/adjustments', {
          method: 'POST',
          body: JSON.stringify({
            employeeIds: selectedEmployeeIds,
            type,
            label,
            amount: parseFloat(amount),
            occurrences: parseInt(occurrences, 10) || 1,
          }),
        });
      }
      resetForm();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that adjustment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Additions & deductions</h2>
        <p className="text-xs text-slate-400">
          Schedule a one-off bonus or a deduction (e.g. an advance drawn) for one or more employees. It applies
          automatically the next time payroll runs for their country — over as many runs as you choose. Any
          not-yet-applied adjustment can be edited later.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {editingId ? (
          <div className="sm:col-span-2">
            <p className="label">Employee</p>
            <p className="text-sm text-ink">{employeeLabel(selectedEmployeeIds[0])}</p>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="label">Employees</label>
            <EmployeeMultiSelect employees={employees} selectedIds={selectedEmployeeIds} onChange={setSelectedEmployeeIds} />
          </div>
        )}
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="ADDITION">Addition (e.g. bonus)</option>
            <option value="DEDUCTION">Deduction (e.g. advance repayment)</option>
          </select>
        </div>
        <div>
          <label className="label">Label</label>
          <input className="input" placeholder="e.g. Advance, Bonus" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount per run</label>
          <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Apply over how many pay runs</label>
          <input type="number" min={1} className="input" value={occurrences} onChange={(e) => setOccurrences(e.target.value)} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Schedule'}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-1">
        {adjustments.map((a) => (
          <div key={a.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
            <div>
              <p className="font-medium text-ink">
                {employeeLabel(a.employeeId)} — {a.label}
              </p>
              <p className="text-xs text-slate-400">
                {a.type === 'ADDITION' ? '+' : '−'}
                {formatMoney(a.amount, currency)} per run · {a.appliedCount}/{a.occurrences} applied ·{' '}
                <span
                  className={
                    a.status === 'PENDING' ? 'text-amber-600' : a.status === 'COMPLETED' ? 'text-emerald-600' : 'text-slate-400'
                  }
                >
                  {a.status}
                </span>
              </p>
            </div>
            {a.status === 'PENDING' && (
              <div className="flex shrink-0 items-center gap-3">
                <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(a)}>
                  <IconPencil />
                </button>
                <button className="text-slate-400 hover:text-red-600" onClick={() => onCancel(a.id)}>
                  <IconTrash />
                </button>
              </div>
            )}
          </div>
        ))}
        {adjustments.length === 0 && <p className="text-sm text-slate-500">No adjustments scheduled.</p>}
      </div>
    </div>
  );
}

/** A closed-by-default dropdown (styled like a normal `.input` select) that
 *  opens into a checkbox list, so picking several employees for one
 *  adjustment doesn't need a permanently-open scrolling box taking up form
 *  space. Closes on an outside click or Escape; the trigger summarizes the
 *  current selection (name(s), or a count once there are more than two). */
function EmployeeMultiSelect({
  employees,
  selectedIds,
  onChange,
}: {
  employees: EmployeeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function label(id: string) {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : id;
  }

  const summary =
    selectedIds.length === 0
      ? 'Select employees…'
      : selectedIds.length <= 2
        ? selectedIds.map(label).join(', ')
        : `${selectedIds.length} employees selected`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selectedIds.length === 0 ? 'text-slate-400' : 'text-ink'}>{summary}</span>
        <span className={`inline-block shrink-0 text-slate-400 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}>
          <IconChevronRight />
        </span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs text-slate-400">{selectedIds.length} selected</span>
            {selectedIds.length > 0 && (
              <button type="button" className="text-xs text-slate-400 hover:text-ink" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
          {employees.map((emp) => (
            <label key={emp.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-ink hover:bg-slate-50">
              <input type="checkbox" checked={selectedIds.includes(emp.id)} onChange={() => toggle(emp.id)} />
              {emp.firstName} {emp.lastName} {emp.employeeCode && <span className="text-slate-400">({emp.employeeCode})</span>}
            </label>
          ))}
          {employees.length === 0 && <p className="px-1 text-xs text-slate-400">No employees yet.</p>}
        </div>
      )}
    </div>
  );
}
