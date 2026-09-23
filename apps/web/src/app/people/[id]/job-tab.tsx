'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { AddableList, useOrgOptions } from './shared';
import {
  ALLOWANCE_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  PAY_TYPES,
  allowanceTypeLabel,
  fmtOrDash,
  personName,
  toDateInput,
  type EmployeeDetail,
} from './types';
import { formatMoney } from '@/lib/format';
import { COUNTRIES, countryName, getCurrencies } from '@/lib/reference-data';
import { IconPencil, IconPlus, IconTrash } from '@/components/icons';

interface StatusEntry {
  id: string;
  status: string;
  comment: string | null;
  effectiveDate: string;
}
interface TypeEntry {
  id: string;
  employmentType: string;
  comment: string | null;
  effectiveDate: string;
}
interface Allowance {
  type: string;
  amount: number;
  note?: string | null;
}
interface CompensationEntry {
  id: string;
  payRate: number;
  payType: string;
  currency: string;
  allowances: Allowance[];
  // Contracted hours/week this rate assumes — null means full-time
  // standard (40). A changed value from the previous entry is how a
  // working-hours change (e.g. a move to part-time) gets recorded; it
  // scales MONTHLY/ANNUAL pay proportionally and is read directly as the
  // weekly hours for HOURLY.
  hoursPerWeek: number | null;
  changeReason: string | null;
  comment: string | null;
  effectiveDate: string;
}
interface JobEntry {
  id: string;
  location: string | null;
  locationBranchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  // v020.A — absorbed from General Info's removed "Work" section.
  sectionId: string | null;
  sourceOfHire: string | null;
  workPhone: string | null;
  countryCode: string | null;
  startDate: string | null;
  comment: string | null;
  effectiveDate: string;
}

function grossPay(row: CompensationEntry): number {
  const allowanceTotal = (row.allowances ?? []).reduce((sum, a) => sum + (a.amount || 0), 0);
  return (row.payRate || 0) + allowanceTotal;
}

/** The Job tab: four dated, append-only history logs, each rendered as a
 *  table (most-recent-entry-first, as the API already sorts them) with
 *  Admin-only Edit-in-place + Delete. Each "+ Add"/edit save appends or
 *  patches an entry AND (server-side) pushes the resulting "current" value
 *  onto the live employee record, so re-fetching the profile after a change
 *  keeps General Info's Work section in sync without any extra logic here. */
export function JobTab({
  person,
  onRefreshPerson,
  call,
  canEdit,
  currency,
}: {
  person: EmployeeDetail;
  onRefreshPerson: () => void;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  currency: string | null;
}) {
  const org = useOrgOptions();

  return (
    <div className="space-y-6">
      <StatusHistoryCard employeeId={person.id} call={call} canEdit={canEdit} onRefreshPerson={onRefreshPerson} />
      <TypeHistoryCard employeeId={person.id} call={call} canEdit={canEdit} onRefreshPerson={onRefreshPerson} />
      <CompensationHistoryCard
        employeeId={person.id}
        call={call}
        canEdit={canEdit}
        onRefreshPerson={onRefreshPerson}
        orgCurrency={currency}
      />
      <JobHistoryCard employeeId={person.id} call={call} canEdit={canEdit} onRefreshPerson={onRefreshPerson} org={org} />
    </div>
  );
}

function StatusHistoryCard({
  employeeId,
  call,
  canEdit,
  onRefreshPerson,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  onRefreshPerson: () => void;
}) {
  const [items, setItems] = useState<StatusEntry[]>([]);

  function refresh() {
    return call<StatusEntry[]>(`/employees/${employeeId}/history/status`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<StatusEntry>
      title="Employee status"
      items={items}
      canEdit={canEdit}
      addLabel="Update"
      emptyText="No status history on file."
      addFields={[
        { name: 'status', label: 'Status', type: 'select', options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })) },
        { name: 'effectiveDate', label: 'Effective date', type: 'date' },
        { name: 'comment', label: 'Comment', type: 'textarea', span2: true },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/history/status`, {
          method: 'POST',
          body: JSON.stringify({ ...v, effectiveDate: v.effectiveDate || undefined }),
        });
        await refresh();
        onRefreshPerson();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/history/status/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, effectiveDate: v.effectiveDate || undefined }),
        });
        await refresh();
        onRefreshPerson();
      }}
      editValuesFor={(row) => ({
        status: row.status,
        effectiveDate: toDateInput(row.effectiveDate),
        comment: row.comment ?? '',
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/history/status/${id}`, { method: 'DELETE' });
        await refresh();
        onRefreshPerson();
      }}
      columns={[
        { header: 'Effective Date', render: (row) => fmtOrDash(row.effectiveDate) },
        { header: 'Status', render: (row) => <span className="font-medium">{row.status.replace('_', ' ')}</span> },
        { header: 'Comment', render: (row) => row.comment ?? '—' },
      ]}
    />
  );
}

function TypeHistoryCard({
  employeeId,
  call,
  canEdit,
  onRefreshPerson,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  onRefreshPerson: () => void;
}) {
  const [items, setItems] = useState<TypeEntry[]>([]);

  function refresh() {
    return call<TypeEntry[]>(`/employees/${employeeId}/history/employment-type`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<TypeEntry>
      title="Employment type"
      items={items}
      canEdit={canEdit}
      addLabel="Update"
      emptyText="No employment-type history on file."
      addFields={[
        {
          name: 'employmentType',
          label: 'Employment type',
          type: 'select',
          options: EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') })),
        },
        { name: 'effectiveDate', label: 'Effective date', type: 'date' },
        { name: 'comment', label: 'Comment', type: 'textarea', span2: true },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/history/employment-type`, {
          method: 'POST',
          body: JSON.stringify({ ...v, effectiveDate: v.effectiveDate || undefined }),
        });
        await refresh();
        onRefreshPerson();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/history/employment-type/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, effectiveDate: v.effectiveDate || undefined }),
        });
        await refresh();
        onRefreshPerson();
      }}
      editValuesFor={(row) => ({
        employmentType: row.employmentType,
        effectiveDate: toDateInput(row.effectiveDate),
        comment: row.comment ?? '',
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/history/employment-type/${id}`, { method: 'DELETE' });
        await refresh();
        onRefreshPerson();
      }}
      columns={[
        { header: 'Effective Date', render: (row) => fmtOrDash(row.effectiveDate) },
        { header: 'Employment Type', render: (row) => <span className="font-medium">{row.employmentType.replace('_', ' ')}</span> },
        { header: 'Comment', render: (row) => row.comment ?? '—' },
      ]}
    />
  );
}

/** One row of the pay-period breakdown every native payroll ruleset reads
 *  from (Basic Pay Rate + typed Allowances) — the same shape for every
 *  country, no more country-specific styling of this section. Custom (not
 *  AddableList) since the Allowances sub-list needs repeatable rows; the
 *  same form is reused for both Add and Edit-in-place. */
function CompensationHistoryCard({
  employeeId,
  call,
  canEdit,
  onRefreshPerson,
  orgCurrency,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  onRefreshPerson: () => void;
  orgCurrency: string | null;
}) {
  const [items, setItems] = useState<CompensationEntry[]>([]);
  const currencies = getCurrencies();

  function refresh() {
    return call<CompensationEntry[]>(`/employees/${employeeId}/history/compensation`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currency, setCurrency] = useState(orgCurrency ?? 'ZMW');
  const [payRate, setPayRate] = useState('');
  const [payType, setPayType] = useState<string>('MONTHLY');
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [allowances, setAllowances] = useState<Array<{ type: string; amount: string; note: string }>>([]);
  const [changeReason, setChangeReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdding() {
    setEditingId(null);
    setCurrency(orgCurrency ?? 'ZMW');
    setPayRate('');
    setPayType('MONTHLY');
    setHoursPerWeek('');
    setAllowances([]);
    setChangeReason('');
    setEffectiveDate('');
    setComment('');
    setError(null);
    setFormOpen(true);
  }

  function startEdit(row: CompensationEntry) {
    setEditingId(row.id);
    setCurrency(row.currency ?? orgCurrency ?? 'ZMW');
    setPayRate(String(row.payRate ?? ''));
    setPayType(row.payType ?? 'MONTHLY');
    setHoursPerWeek(row.hoursPerWeek != null ? String(row.hoursPerWeek) : '');
    setAllowances((row.allowances ?? []).map((a) => ({ type: a.type, amount: String(a.amount ?? ''), note: a.note ?? '' })));
    setChangeReason(row.changeReason ?? '');
    setEffectiveDate(toDateInput(row.effectiveDate));
    setComment(row.comment ?? '');
    setError(null);
    setFormOpen(true);
  }

  async function remove(id: string) {
    await call(`/employees/${employeeId}/history/compensation/${id}`, { method: 'DELETE' });
    await refresh();
    onRefreshPerson();
  }

  function addAllowanceRow() {
    setAllowances((rows) => [...rows, { type: 'HOUSING', amount: '', note: '' }]);
  }
  function updateAllowanceRow(i: number, patch: Partial<{ type: string; amount: string; note: string }>) {
    setAllowances((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeAllowanceRow(i: number) {
    setAllowances((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        payRate: parseFloat(payRate) || 0,
        payType,
        currency,
        allowances: allowances
          .filter((a) => a.amount)
          .map((a) => ({ type: a.type, amount: parseFloat(a.amount) || 0, note: a.note || undefined })),
        hoursPerWeek: hoursPerWeek ? parseFloat(hoursPerWeek) : undefined,
        changeReason: changeReason || undefined,
        comment: comment || undefined,
        effectiveDate: effectiveDate || undefined,
      });
      if (editingId) {
        await call(`/employees/${employeeId}/history/compensation/${editingId}`, { method: 'PATCH', body });
      } else {
        await call(`/employees/${employeeId}/history/compensation`, { method: 'POST', body });
      }
      setFormOpen(false);
      setEditingId(null);
      await refresh();
      onRefreshPerson();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compensation</h2>
        {canEdit && !formOpen && (
          <button className="btn-secondary flex items-center gap-1.5 whitespace-nowrap py-1" onClick={startAdding}>
            <IconPlus /> Update
          </button>
        )}
      </div>

      {formOpen && (
        <div className="space-y-3 rounded-md bg-slate-50 p-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm font-semibold text-ink">{editingId ? 'Edit compensation entry' : 'New compensation entry'}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {!currencies.some((c) => c.code === currency) && <option value={currency}>{currency}</option>}
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Basic pay rate</label>
              <input type="number" className="input" value={payRate} onChange={(e) => setPayRate(e.target.value)} />
            </div>
            <div>
              <label className="label">Pay type</label>
              <select className="input" value={payType} onChange={(e) => setPayType(e.target.value)}>
                {PAY_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Hours/week</label>
              <input
                type="number"
                className="input"
                placeholder="40 (standard)"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label">Allowances</label>
              <button type="button" className="btn-secondary flex items-center gap-1.5 py-1 text-xs" onClick={addAllowanceRow}>
                <IconPlus /> Add allowance
              </button>
            </div>
            {allowances.map((a, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={a.type} onChange={(e) => updateAllowanceRow(i, { type: e.target.value })}>
                    {ALLOWANCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input
                    type="number"
                    className="input"
                    value={a.amount}
                    onChange={(e) => updateAllowanceRow(i, { amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Note (optional)</label>
                  <input
                    className="input"
                    value={a.note}
                    onChange={(e) => updateAllowanceRow(i, { note: e.target.value })}
                    placeholder={a.type === 'OTHER' ? 'e.g. Phone allowance' : undefined}
                  />
                </div>
                <button
                  type="button"
                  className="mb-2 shrink-0 text-slate-400 hover:text-red-600"
                  onClick={() => removeAllowanceRow(i)}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
            {allowances.length === 0 && <p className="text-xs text-slate-400">No allowances added.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Change reason</label>
              <input className="input" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
            </div>
            <div>
              <label className="label">Effective date</label>
              <input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Comment</label>
              <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 font-medium">Effective Date</th>
              <th className="px-2 py-2 font-medium">Gross Pay</th>
              <th className="px-2 py-2 font-medium">Basic Pay Rate</th>
              <th className="px-2 py-2 font-medium">Pay Type</th>
              <th className="px-2 py-2 font-medium">Hours/Week</th>
              <th className="px-2 py-2 font-medium">Allowances</th>
              <th className="px-2 py-2 font-medium">Change Reason</th>
              <th className="px-2 py-2 font-medium">Comment</th>
              {canEdit && <th className="px-2 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-0">
                <td className="px-2 py-2 align-top text-slate-500">{fmtOrDash(row.effectiveDate)}</td>
                <td className="px-2 py-2 align-top font-medium text-ink">{formatMoney(grossPay(row), row.currency)}</td>
                <td className="px-2 py-2 align-top text-ink">{formatMoney(row.payRate, row.currency)}</td>
                <td className="px-2 py-2 align-top text-slate-500">{row.payType?.toLowerCase()}</td>
                <td className="px-2 py-2 align-top text-slate-500">{row.hoursPerWeek ?? '40 (standard)'}</td>
                <td className="px-2 py-2 align-top text-slate-500">
                  {row.allowances?.length > 0
                    ? row.allowances.map((a) => `${allowanceTypeLabel(a.type)} ${formatMoney(a.amount, row.currency)}`).join(' · ')
                    : '—'}
                </td>
                <td className="px-2 py-2 align-top text-slate-500">{row.changeReason ?? '—'}</td>
                <td className="px-2 py-2 align-top text-slate-500">{row.comment ?? '—'}</td>
                {canEdit && (
                  <td className="px-2 py-2 align-top text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(row)}>
                        <IconPencil />
                      </button>
                      <button className="text-slate-400 hover:text-red-600" onClick={() => remove(row.id)}>
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-sm text-slate-400">
                  No compensation history on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JobHistoryCard({
  employeeId,
  call,
  canEdit,
  onRefreshPerson,
  org,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  onRefreshPerson: () => void;
  org: ReturnType<typeof useOrgOptions>;
}) {
  const [items, setItems] = useState<JobEntry[]>([]);

  function refresh() {
    return call<JobEntry[]>(`/employees/${employeeId}/history/job-info`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const branchOptions = org.branches.map((b) => ({
    value: b.id,
    label: [b.townCity, b.country].filter(Boolean).join(', ') || b.name,
  }));
  // Sections aren't filtered by the entry's Department here the way General
  // Info's old Work card did — AddableList's add/edit form doesn't support
  // one field's options reacting to another field's live value — so every
  // section is listed, qualified with its department, to stay unambiguous.
  const sectionOptions = org.sections.map((s) => ({
    value: s.id,
    label: `${s.name}${org.departments.find((d) => d.id === s.departmentId)?.name ? ` (${org.departments.find((d) => d.id === s.departmentId)?.name})` : ''}`,
  }));
  const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));

  return (
    <AddableList<JobEntry>
      title="Job information"
      items={items}
      canEdit={canEdit}
      addLabel="Update"
      emptyText="No job-information history on file."
      addFields={[
        { name: 'locationBranchId', label: 'Location', type: 'select', options: branchOptions },
        { name: 'departmentId', label: 'Department', type: 'select', options: org.departments.map((d) => ({ value: d.id, label: d.name })) },
        { name: 'sectionId', label: 'Section', type: 'select', options: sectionOptions },
        {
          name: 'designationId',
          label: 'Designation',
          type: 'select',
          options: org.designations.map((d) => ({ value: d.id, label: d.title })),
        },
        {
          name: 'managerId',
          label: 'Reports to',
          type: 'select',
          options: org.employees.filter((e) => e.id !== employeeId).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
        },
        { name: 'sourceOfHire', label: 'Source of hire' },
        { name: 'workPhone', label: 'Work phone' },
        { name: 'countryCode', label: 'Country', type: 'select', options: countryOptions },
        { name: 'startDate', label: 'Start date', type: 'date' },
        { name: 'effectiveDate', label: 'Effective date', type: 'date' },
        { name: 'comment', label: 'Comment', type: 'textarea', span2: true },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/history/job-info`, {
          method: 'POST',
          body: JSON.stringify({
            locationBranchId: v.locationBranchId || undefined,
            departmentId: v.departmentId || undefined,
            sectionId: v.sectionId || undefined,
            designationId: v.designationId || undefined,
            managerId: v.managerId || undefined,
            sourceOfHire: v.sourceOfHire || undefined,
            workPhone: v.workPhone || undefined,
            countryCode: v.countryCode || undefined,
            startDate: v.startDate || undefined,
            effectiveDate: v.effectiveDate || undefined,
            comment: v.comment || undefined,
          }),
        });
        await refresh();
        onRefreshPerson();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/history/job-info/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            locationBranchId: v.locationBranchId || undefined,
            departmentId: v.departmentId || undefined,
            sectionId: v.sectionId || undefined,
            designationId: v.designationId || undefined,
            managerId: v.managerId || undefined,
            sourceOfHire: v.sourceOfHire || undefined,
            workPhone: v.workPhone || undefined,
            countryCode: v.countryCode || undefined,
            startDate: v.startDate || undefined,
            effectiveDate: v.effectiveDate || undefined,
            comment: v.comment || undefined,
          }),
        });
        await refresh();
        onRefreshPerson();
      }}
      editValuesFor={(row) => ({
        locationBranchId: row.locationBranchId ?? '',
        departmentId: row.departmentId ?? '',
        sectionId: row.sectionId ?? '',
        designationId: row.designationId ?? '',
        managerId: row.managerId ?? '',
        sourceOfHire: row.sourceOfHire ?? '',
        workPhone: row.workPhone ?? '',
        countryCode: row.countryCode ?? '',
        startDate: toDateInput(row.startDate),
        effectiveDate: toDateInput(row.effectiveDate),
        comment: row.comment ?? '',
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/history/job-info/${id}`, { method: 'DELETE' });
        await refresh();
        onRefreshPerson();
      }}
      columns={[
        { header: 'Effective Date', render: (row) => fmtOrDash(row.effectiveDate) },
        { header: 'Location', render: (row) => row.location ?? '—' },
        { header: 'Department', render: (row) => (row.departmentId ? org.departments.find((d) => d.id === row.departmentId)?.name ?? '—' : '—') },
        { header: 'Section', render: (row) => (row.sectionId ? org.sections.find((s) => s.id === row.sectionId)?.name ?? '—' : '—') },
        { header: 'Designation', render: (row) => (row.designationId ? org.designations.find((d) => d.id === row.designationId)?.title ?? '—' : '—') },
        { header: 'Reports To', render: (row) => (row.managerId ? personName(org.employees.find((e) => e.id === row.managerId)) : '—') },
        { header: 'Source of Hire', render: (row) => row.sourceOfHire ?? '—' },
        { header: 'Work Phone', render: (row) => row.workPhone ?? '—' },
        { header: 'Country', render: (row) => (row.countryCode ? `${countryName(row.countryCode)} (${row.countryCode})` : '—') },
        { header: 'Start Date', render: (row) => fmtOrDash(row.startDate) },
        { header: 'Comment', render: (row) => row.comment ?? '—' },
      ]}
    />
  );
}
