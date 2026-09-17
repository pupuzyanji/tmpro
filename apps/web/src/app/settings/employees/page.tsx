'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { CsvImportButton } from '@/components/csv-import-button';
import { IconPlus, IconUsers } from '@/components/icons';
import { COUNTRIES } from '@/lib/reference-data';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  status: string;
  managerId: string | null;
}
interface Branch {
  id: string;
  name: string;
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
interface Designation {
  id: string;
  title: string;
}
interface GenerateLoginsResult {
  created: Array<{ employeeId: string; name: string; email: string; role: 'SUPERVISOR' | 'EMPLOYEE' }>;
  skipped: Array<{ employeeId: string; name: string; reason: string }>;
  defaultPassword: string;
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  employeeCode: '',
  branchId: '',
  departmentId: '',
  sectionId: '',
  designationId: '',
  managerId: '',
  employmentType: 'FULL_TIME',
  sourceOfHire: '',
  workPhone: '',
  countryCode: 'ZM',
};

export default function EmployeesSettingsPage() {
  const { ready, call } = useApi();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [generatingLogins, setGeneratingLogins] = useState(false);
  const [loginsResult, setLoginsResult] = useState<GenerateLoginsResult | null>(null);

  function refresh() {
    return Promise.all([
      call<Employee[]>('/employees'),
      call<Branch[]>('/settings/branches'),
      call<Department[]>('/settings/departments'),
      call<Section[]>('/settings/sections'),
      call<Designation[]>('/settings/designations'),
    ])
      .then(([e, b, d, s, des]) => {
        setEmployees(e);
        setBranches(b);
        setDepartments(d);
        setSections(s);
        setDesignations(des);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load employees.'));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, call]);

  const sectionsForDept = useMemo(
    () => sections.filter((s) => s.departmentId === form.departmentId),
    [sections, form.departmentId],
  );

  async function create() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    try {
      await call('/employees', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          countryCode: form.countryCode,
          employeeCode: form.employeeCode || undefined,
          branchId: form.branchId || undefined,
          departmentId: form.departmentId || undefined,
          sectionId: form.sectionId || undefined,
          designationId: form.designationId || undefined,
          managerId: form.managerId || undefined,
          employmentType: form.employmentType || undefined,
          sourceOfHire: form.sourceOfHire || undefined,
          workPhone: form.workPhone || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setAdding(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create employee.');
    }
  }

  async function generateLogins() {
    setGeneratingLogins(true);
    setError(null);
    try {
      setLoginsResult(await call<GenerateLoginsResult>('/employees/generate-logins', { method: 'POST' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate logins.');
    } finally {
      setGeneratingLogins(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {employees.length} employee{employees.length === 1 ? '' : 's'} — configure reporting lines, designation,
          department and section here; personal details are filled in from their People profile.
        </p>
        <div className="flex gap-2">
          <CsvImportButton
            endpoint="/employees/import"
            onDone={refresh}
            sampleFileName="employees-sample.csv"
            sampleColumns={[
              { header: 'firstName', example: 'Sam' },
              { header: 'lastName', example: 'Employee' },
              { header: 'employeeCode', example: 'EMP-1042' },
              { header: 'jobTitle', example: 'Software Engineer' },
              { header: 'countryCode', example: 'ZM' },
              { header: 'managerCode', example: 'EMP-1001' },
              { header: 'sourceOfHire', example: 'Referral' },
              { header: 'workPhone', example: '+260 97 123 4567' },
              { header: 'employmentType', example: 'FULL_TIME' },
            ]}
          />
          <button
            className="btn-secondary flex items-center gap-1.5 whitespace-nowrap py-1.5"
            onClick={generateLogins}
            disabled={generatingLogins}
          >
            <IconUsers /> {generatingLogins ? 'Generating…' : 'Generate logins'}
          </button>
          <button className="btn-primary flex items-center gap-1.5 whitespace-nowrap py-1.5" onClick={() => setAdding(true)}>
            <IconPlus /> Add employee
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Import columns: employeeCode, firstName, lastName, jobTitle, branch, department, section, designation,
        employmentType, sourceOfHire, workPhone, managerCode (an existing employee&apos;s employeeCode), countryCode.
      </p>
      <p className="text-xs text-slate-400">
        &quot;Generate logins&quot; creates a sign-in for every employee who doesn&apos;t have one yet, using their
        personal email (People profile → Personal Details) — Supervisor if anyone reports to them, Employee
        otherwise — all sharing one default password you&apos;ll need to pass on yourself.
      </p>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loginsResult && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Logins generated</p>
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setLoginsResult(null)}>
              Dismiss
            </button>
          </div>
          {loginsResult.created.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Created ({loginsResult.created.length}) — default password:{' '}
                <span className="font-mono text-ink">{loginsResult.defaultPassword}</span>
              </p>
              <ul className="space-y-1">
                {loginsResult.created.map((c) => (
                  <li key={c.employeeId} className="flex items-center justify-between text-xs">
                    <span className="text-ink">{c.name}</span>
                    <span className="text-slate-500">
                      {c.email} · <span className="badge bg-slate-100 text-slate-600">{c.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No new logins were needed.</p>
          )}
          {loginsResult.skipped.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skipped ({loginsResult.skipped.length})
              </p>
              <ul className="space-y-1">
                {loginsResult.skipped.map((s) => (
                  <li key={s.employeeId} className="flex items-center justify-between text-xs">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-slate-400">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {adding && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">First name</label>
            <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div>
            <label className="label">Employee ID</label>
            <input className="input" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Branch</label>
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Designation</label>
            <select className="input" value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
              <option value="">—</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select
              className="input"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value, sectionId: '' })}
            >
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Section</label>
            <select className="input" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
              <option value="">—</option>
              {sectionsForDept.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reports to (direct manager)</label>
            <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">No manager</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Employment type</label>
            <select className="input" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
              {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Source of hire</label>
            <input className="input" value={form.sourceOfHire} onChange={(e) => setForm({ ...form, sourceOfHire: e.target.value })} />
          </div>
          <div>
            <label className="label">Work phone</label>
            <input className="input" value={form.workPhone} onChange={(e) => setForm({ ...form, workPhone: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" onClick={create}>
              Create employee
            </button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Employee ID</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Department</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <Link href={`/people/${e.id}`} className="flex items-center gap-3">
                    <Avatar name={`${e.firstName} ${e.lastName}`} photoUrl={e.photoUrl} size="sm" />
                    <span className="font-medium text-ink">
                      {e.firstName} {e.lastName}
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-600">{e.employeeCode ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{e.jobTitle ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{e.department ?? '—'}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={e.status} kind="employee" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
