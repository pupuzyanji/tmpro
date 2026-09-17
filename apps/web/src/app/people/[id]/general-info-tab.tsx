'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { AddableList, Field, SectionHeader, nameOf, useOrgOptions } from './shared';
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  fmtOrDash,
  toDateInput,
  personName,
  type EmployeeDetail,
} from './types';
import { BLOOD_GROUPS, COUNTRIES, countryName } from '@/lib/reference-data';
import { formatMoney } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { IconUpload } from '@/components/icons';

interface WorkExperience {
  id: string;
  company: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}
interface Education {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
}
interface Dependent {
  id: string;
  name: string;
  relationship: string | null;
  dateOfBirth: string | null;
}

export function GeneralInfoTab({
  person,
  onSaved,
  call,
  canEdit,
  canEditSalary,
  currency,
}: {
  person: EmployeeDetail;
  onSaved: (p: EmployeeDetail) => void;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
  canEditSalary: boolean;
  currency: string | null;
}) {
  const org = useOrgOptions();

  return (
    <div className="space-y-6">
      <BasicInfoCard person={person} onSaved={onSaved} call={call} canEdit={canEdit} />
      <WorkCard
        person={person}
        onSaved={onSaved}
        call={call}
        canEdit={canEdit}
        canEditSalary={canEditSalary}
        org={org}
        currency={currency}
      />
      <PersonalDetailsCard person={person} onSaved={onSaved} call={call} canEdit={canEdit} />
      <WorkExperienceCard employeeId={person.id} call={call} canEdit={canEdit} />
      <EducationCard employeeId={person.id} call={call} canEdit={canEdit} />
      <DependentsCard employeeId={person.id} call={call} canEdit={canEdit} />
    </div>
  );
}

// --- Basic Info ------------------------------------------------------------

function BasicInfoCard({
  person,
  onSaved,
  call,
  canEdit,
}: {
  person: EmployeeDetail;
  onSaved: (p: EmployeeDetail) => void;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const { upload } = useApi();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: person.firstName,
    lastName: person.lastName,
    employeeCode: person.employeeCode ?? '',
    email: person.email ?? '',
    mobileNo: person.mobileNo ?? '',
    dateOfBirth: toDateInput(person.dateOfBirth),
    gender: person.gender ?? '',
    maritalStatus: person.maritalStatus ?? '',
    nationality: person.nationality ?? '',
    bloodGroup: person.bloodGroup ?? '',
    idNo: person.idNo ?? '',
    ssn: person.ssn ?? '',
    nhiId: person.nhiId ?? '',
    taxId: person.taxId ?? '',
    hobbies: person.hobbies ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    setError(null);
    try {
      const updated = await upload<EmployeeDetail>(`/employees/${person.id}/photo`, file);
      onSaved({ ...person, ...updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  function reset() {
    setForm({
      firstName: person.firstName,
      lastName: person.lastName,
      employeeCode: person.employeeCode ?? '',
      email: person.email ?? '',
      mobileNo: person.mobileNo ?? '',
      dateOfBirth: toDateInput(person.dateOfBirth),
      gender: person.gender ?? '',
      maritalStatus: person.maritalStatus ?? '',
      nationality: person.nationality ?? '',
      bloodGroup: person.bloodGroup ?? '',
      idNo: person.idNo ?? '',
      ssn: person.ssn ?? '',
      nhiId: person.nhiId ?? '',
      taxId: person.taxId ?? '',
      hobbies: person.hobbies ?? '',
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await call<EmployeeDetail>(`/employees/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          maritalStatus: form.maritalStatus || undefined,
        }),
      });
      onSaved({ ...person, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-4">
      <SectionHeader title="Basic info" canEdit={canEdit} editing={editing} onEdit={() => setEditing(true)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <Avatar name={`${person.firstName} ${person.lastName}`} photoUrl={person.photoUrl} size="lg" />
        {canEdit && (
          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadPhoto(file);
              }}
            />
            <button
              type="button"
              className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
              disabled={uploadingPhoto}
              onClick={() => photoInputRef.current?.click()}
            >
              <IconUpload />
              {uploadingPhoto ? 'Uploading…' : person.photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">First name</label>
            <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div>
            <label className="label">Employee ID No</label>
            <input className="input" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
          </div>
          <div>
            <label className="label">Personal email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Mobile no.</label>
            <input className="input" value={form.mobileNo} onChange={(e) => setForm({ ...form, mobileNo: e.target.value })} />
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Marital status</label>
            <select className="input" value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
              <option value="">—</option>
              {MARITAL_STATUSES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nationality</label>
            <select className="input" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })}>
              <option value="">—</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.nationality}>
                  {c.nationality}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Blood group</label>
            <select className="input" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
              <option value="">—</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ID No</label>
            <input className="input" value={form.idNo} onChange={(e) => setForm({ ...form, idNo: e.target.value })} />
          </div>
          <div>
            <label className="label">Social Security No.</label>
            <input className="input" value={form.ssn} onChange={(e) => setForm({ ...form, ssn: e.target.value })} />
          </div>
          <div>
            <label className="label">Health Insurance No.</label>
            <input className="input" value={form.nhiId} onChange={(e) => setForm({ ...form, nhiId: e.target.value })} />
          </div>
          <div>
            <label className="label">Tax ID</label>
            <input className="input" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Hobbies</label>
            <input className="input" value={form.hobbies} onChange={(e) => setForm({ ...form, hobbies: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                reset();
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" value={person.firstName} />
          <Field label="Last name" value={person.lastName} />
          <Field label="Employee ID No" value={person.employeeCode} />
          <Field label="Login email" value={person.account?.email} />
          <Field label="Personal email" value={person.email} />
          <Field label="Mobile no." value={person.mobileNo} />
          <Field label="Date of birth" value={fmtOrDash(person.dateOfBirth)} />
          <Field label="Gender" value={person.gender?.replace(/_/g, ' ')} />
          <Field label="Marital status" value={person.maritalStatus} />
          <Field label="Nationality" value={person.nationality} />
          <Field label="Blood group" value={person.bloodGroup} />
          <Field label="ID No" value={person.idNo} />
          <Field label="Social Security No." value={person.ssn} />
          <Field label="Health Insurance No." value={person.nhiId} />
          <Field label="Tax ID" value={person.taxId} />
          <Field label="Hobbies" value={person.hobbies} />
        </div>
      )}
    </div>
  );
}

// --- Work --------------------------------------------------------------

function WorkCard({
  person,
  onSaved,
  call,
  canEdit,
  canEditSalary,
  org,
  currency,
}: {
  person: EmployeeDetail;
  onSaved: (p: EmployeeDetail) => void;
  call: ReturnType<typeof useApi>['call'];
  currency: string | null;
  canEdit: boolean;
  canEditSalary: boolean;
  org: ReturnType<typeof useOrgOptions>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    branchId: person.branchId ?? '',
    departmentId: person.departmentId ?? '',
    sectionId: person.sectionId ?? '',
    designationId: person.designationId ?? '',
    managerId: person.managerId ?? '',
    sourceOfHire: person.sourceOfHire ?? '',
    employmentType: person.employmentType,
    workPhone: person.workPhone ?? '',
    location: person.location ?? '',
    startDate: toDateInput(person.startDate),
    countryCode: person.countryCode,
    annualSalary: person.annualSalary?.toString() ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionsForDept = org.sections.filter((s) => s.departmentId === form.departmentId);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        branchId: form.branchId || undefined,
        departmentId: form.departmentId || undefined,
        sectionId: form.sectionId || undefined,
        designationId: form.designationId || undefined,
        managerId: form.managerId || undefined,
        sourceOfHire: form.sourceOfHire || undefined,
        employmentType: form.employmentType,
        workPhone: form.workPhone || undefined,
        location: form.location || undefined,
        startDate: form.startDate || undefined,
        countryCode: form.countryCode,
      };
      if (canEditSalary) body.annualSalary = form.annualSalary ? parseFloat(form.annualSalary) : undefined;
      const updated = await call<EmployeeDetail>(`/employees/${person.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved({ ...person, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-4">
      <SectionHeader title="Work" canEdit={canEdit} editing={editing} onEdit={() => setEditing(true)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Branch</label>
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">—</option>
              {org.branches.map((b) => (
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
              {org.designations.map((d) => (
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
              {org.departments.map((d) => (
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
            <label className="label">Reports to</label>
            <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">No manager</option>
              {org.employees
                .filter((e) => e.id !== person.id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Source of hire</label>
            <input className="input" value={form.sourceOfHire} onChange={(e) => setForm({ ...form, sourceOfHire: e.target.value })} />
          </div>
          <div>
            <label className="label">Employment type</label>
            <select className="input" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Work phone</label>
            <input className="input" value={form.workPhone} onChange={(e) => setForm({ ...form, workPhone: e.target.value })} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
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
          {canEditSalary && (
            <div>
              <label className="label">Annual salary</label>
              <input
                type="number"
                className="input"
                value={form.annualSalary}
                onChange={(e) => setForm({ ...form, annualSalary: e.target.value })}
              />
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Branch" value={nameOf(org.branches, person.branchId, 'name')} />
          <Field label="Department" value={person.department} />
          <Field label="Section" value={nameOf(org.sections, person.sectionId, 'name')} />
          <Field label="Designation" value={person.jobTitle} />
          <Field label="Reports to" value={personName(person.manager)} />
          <Field label="Source of hire" value={person.sourceOfHire} />
          <Field label="Employment type" value={person.employmentType.replace('_', ' ')} />
          <Field label="Work phone" value={person.workPhone} />
          <Field label="Location" value={person.location} />
          <Field label="Start date" value={fmtOrDash(person.startDate)} />
          <Field label="Country" value={person.countryCode ? `${countryName(person.countryCode)} (${person.countryCode})` : null} />
          {canEditSalary && (
            <Field
              label="Annual salary"
              value={person.annualSalary != null ? formatMoney(person.annualSalary, currency) : null}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- Personal Details ----------------------------------------------------

function PersonalDetailsCard({
  person,
  onSaved,
  call,
  canEdit,
}: {
  person: EmployeeDetail;
  onSaved: (p: EmployeeDetail) => void;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    fatherName: person.fatherName ?? '',
    motherName: person.motherName ?? '',
    spouseName: person.spouseName ?? '',
    address1: person.address1 ?? '',
    address2: person.address2 ?? '',
    city: person.city ?? '',
    state: person.state ?? '',
    country: person.country ?? '',
    zipCode: person.zipCode ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await call<EmployeeDetail>(`/employees/${person.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      onSaved({ ...person, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-4">
      <SectionHeader title="Personal details" canEdit={canEdit} editing={editing} onEdit={() => setEditing(true)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Father&apos;s name</label>
            <input className="input" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
          </div>
          <div>
            <label className="label">Mother&apos;s name</label>
            <input className="input" value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} />
          </div>
          <div>
            <label className="label">Spouse name</label>
            <input className="input" value={form.spouseName} onChange={(e) => setForm({ ...form, spouseName: e.target.value })} />
          </div>
          <div>
            <label className="label">Address line 1</label>
            <input className="input" value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} />
          </div>
          <div>
            <label className="label">Address line 2</label>
            <input className="input" value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              <option value="">—</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Zip / postal code</label>
            <input className="input" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Father's name" value={person.fatherName} />
          <Field label="Mother's name" value={person.motherName} />
          <Field label="Spouse name" value={person.spouseName} />
          <Field label="Address line 1" value={person.address1} />
          <Field label="Address line 2" value={person.address2} />
          <Field label="City" value={person.city} />
          <Field label="State" value={person.state} />
          <Field label="Country" value={person.country} />
          <Field label="Zip / postal code" value={person.zipCode} />
        </div>
      )}
    </div>
  );
}

// --- Addable sub-lists ---------------------------------------------------

function WorkExperienceCard({
  employeeId,
  call,
  canEdit,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<WorkExperience[]>([]);

  function refresh() {
    return call<WorkExperience[]>(`/employees/${employeeId}/work-experience`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<WorkExperience>
      title="Work experience"
      items={items}
      canEdit={canEdit}
      emptyText="No prior work experience on file."
      addFields={[
        { name: 'company', label: 'Company' },
        { name: 'title', label: 'Title' },
        { name: 'startDate', label: 'Start date', type: 'date' },
        { name: 'endDate', label: 'End date', type: 'date' },
        { name: 'description', label: 'Description', type: 'textarea', span2: true },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/work-experience`, {
          method: 'POST',
          body: JSON.stringify({ ...v, startDate: v.startDate || undefined, endDate: v.endDate || undefined }),
        });
        await refresh();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/work-experience/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, startDate: v.startDate || undefined, endDate: v.endDate || undefined }),
        });
        await refresh();
      }}
      editValuesFor={(row) => ({
        company: row.company,
        title: row.title ?? '',
        startDate: toDateInput(row.startDate),
        endDate: toDateInput(row.endDate),
        description: row.description ?? '',
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/work-experience/${id}`, { method: 'DELETE' });
        await refresh();
      }}
      renderRow={(row) => (
        <>
          <span className="font-medium">{row.company}</span>
          {row.title && <span className="text-slate-500">{row.title}</span>}
          <span className="text-slate-400">
            {fmtOrDash(row.startDate)} – {row.endDate ? fmtOrDash(row.endDate) : 'Present'}
          </span>
        </>
      )}
    />
  );
}

function EducationCard({
  employeeId,
  call,
  canEdit,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Education[]>([]);

  function refresh() {
    return call<Education[]>(`/employees/${employeeId}/education`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<Education>
      title="Education"
      items={items}
      canEdit={canEdit}
      emptyText="No education history on file."
      addFields={[
        { name: 'institution', label: 'Institution' },
        { name: 'degree', label: 'Degree' },
        { name: 'fieldOfStudy', label: 'Field of study' },
        { name: 'startDate', label: 'Start date', type: 'date' },
        { name: 'endDate', label: 'End date', type: 'date' },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/education`, {
          method: 'POST',
          body: JSON.stringify({ ...v, startDate: v.startDate || undefined, endDate: v.endDate || undefined }),
        });
        await refresh();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/education/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, startDate: v.startDate || undefined, endDate: v.endDate || undefined }),
        });
        await refresh();
      }}
      editValuesFor={(row) => ({
        institution: row.institution,
        degree: row.degree ?? '',
        fieldOfStudy: row.fieldOfStudy ?? '',
        startDate: toDateInput(row.startDate),
        endDate: toDateInput(row.endDate),
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/education/${id}`, { method: 'DELETE' });
        await refresh();
      }}
      renderRow={(row) => (
        <>
          <span className="font-medium">{row.institution}</span>
          {row.degree && <span className="text-slate-500">{row.degree}</span>}
          {row.fieldOfStudy && <span className="text-slate-500">{row.fieldOfStudy}</span>}
          <span className="text-slate-400">
            {fmtOrDash(row.startDate)} – {row.endDate ? fmtOrDash(row.endDate) : 'Present'}
          </span>
        </>
      )}
    />
  );
}

function DependentsCard({
  employeeId,
  call,
  canEdit,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Dependent[]>([]);

  function refresh() {
    return call<Dependent[]>(`/employees/${employeeId}/dependents`).then(setItems).catch(() => {});
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return (
    <AddableList<Dependent>
      title="Dependents"
      items={items}
      canEdit={canEdit}
      emptyText="No dependents on file."
      addFields={[
        { name: 'name', label: 'Name' },
        { name: 'relationship', label: 'Relationship' },
        { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      ]}
      onAdd={async (v) => {
        await call(`/employees/${employeeId}/dependents`, {
          method: 'POST',
          body: JSON.stringify({ ...v, dateOfBirth: v.dateOfBirth || undefined }),
        });
        await refresh();
      }}
      onEdit={async (id, v) => {
        await call(`/employees/${employeeId}/dependents/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...v, dateOfBirth: v.dateOfBirth || undefined }),
        });
        await refresh();
      }}
      editValuesFor={(row) => ({
        name: row.name,
        relationship: row.relationship ?? '',
        dateOfBirth: toDateInput(row.dateOfBirth),
      })}
      onDelete={async (id) => {
        await call(`/employees/${employeeId}/dependents/${id}`, { method: 'DELETE' });
        await refresh();
      }}
      renderRow={(row) => (
        <>
          <span className="font-medium">{row.name}</span>
          {row.relationship && <span className="text-slate-500">{row.relationship}</span>}
          <span className="text-slate-400">{fmtOrDash(row.dateOfBirth)}</span>
        </>
      )}
    />
  );
}
