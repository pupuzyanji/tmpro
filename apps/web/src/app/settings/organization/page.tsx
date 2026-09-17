'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { COUNTRIES, getCurrencies, getTimezones } from '@/lib/reference-data';
import { IconUpload } from '@/components/icons';

interface Organization {
  id: string | null;
  name: string | null;
  logoUrl: string | null;
  tagline: string | null;
  street: string | null;
  townCity: string | null;
  province: string | null;
  country: string | null;
  currency: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  superannuationNo: string | null;
  taxId: string | null;
  healthInsuranceId: string | null;
}

export default function OrganizationSettingsPage() {
  const { ready, call, upload } = useApi();
  const [org, setOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState<Partial<Organization>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const timezones = useMemo(() => getTimezones(), []);
  const currencies = useMemo(() => getCurrencies(), []);

  useEffect(() => {
    if (!ready) return;
    call<Organization>('/settings/organization').then((o) => {
      setOrg(o);
      setForm(o);
    });
  }, [ready, call]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // logoUrl is a (potentially large) base64 data URI and is updated
      // through its own dedicated upload endpoint — no need to round-trip
      // it back through this plain-fields save.
      const { logoUrl: _logoUrl, ...fields } = form;
      const updated = await call<Organization>('/settings/organization', {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      setOrg(updated);
      setForm(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError(null);
    try {
      const updated = await upload<Organization>('/settings/organization/logo', file);
      setOrg(updated);
      setForm(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload logo.');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  if (!org) return null;

  return (
    <div className="card max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Company profile</h2>
        <p className="text-xs text-slate-400">Shown across the app — login screen, top bar, payslips, announcements.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Organization name</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Tagline</label>
          <input className="input" value={form.tagline ?? ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Logo</label>
          <div className="flex items-center gap-3">
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="Organization logo" className="h-12 w-12 rounded-lg border border-slate-200 object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                No logo
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
            <button
              type="button"
              className="btn-secondary flex items-center gap-1.5 py-1.5"
              disabled={uploadingLogo}
              onClick={() => logoInputRef.current?.click()}
            >
              <IconUpload />
              {uploadingLogo ? 'Uploading…' : 'Upload logo'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Shown next to the organization name in the sidebar header.</p>
        </div>
        <div>
          <label className="label">Street</label>
          <input className="input" value={form.street ?? ''} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </div>
        <div>
          <label className="label">Town/City</label>
          <input className="input" value={form.townCity ?? ''} onChange={(e) => setForm({ ...form, townCity: e.target.value })} />
        </div>
        <div>
          <label className="label">Province</label>
          <input className="input" value={form.province ?? ''} onChange={(e) => setForm({ ...form, province: e.target.value })} />
        </div>
        <div>
          <label className="label">Country</label>
          <select className="input" value={form.country ?? ''} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            <option value="">—</option>
            {!COUNTRIES.some((c) => c.name === form.country) && form.country && (
              <option value={form.country}>{form.country}</option>
            )}
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input" value={form.currency ?? ''} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {!currencies.some((c) => c.code === form.currency) && form.currency && (
              <option value={form.currency}>{form.currency}</option>
            )}
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Drives money formatting across Payroll and employee salary figures.</p>
        </div>
        <div>
          <label className="label">Timezone</label>
          <select className="input" value={form.timezone ?? ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {!timezones.includes(form.timezone ?? '') && form.timezone && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Working hours start</label>
          <input
            className="input"
            value={form.workingHoursStart ?? ''}
            onChange={(e) => setForm({ ...form, workingHoursStart: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Working hours end</label>
          <input
            className="input"
            value={form.workingHoursEnd ?? ''}
            onChange={(e) => setForm({ ...form, workingHoursEnd: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Regulatory identifiers</h3>
          <p className="text-xs text-slate-400">Used when generating Regulatory Submission return files on the Payroll page.</p>
        </div>
        <div>
          <label className="label">Superannuation No.</label>
          <input
            className="input"
            value={form.superannuationNo ?? ''}
            onChange={(e) => setForm({ ...form, superannuationNo: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
          />
        </div>
        <div>
          <label className="label">Tax ID</label>
          <input
            className="input"
            value={form.taxId ?? ''}
            onChange={(e) => setForm({ ...form, taxId: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
          />
        </div>
        <div>
          <label className="label">Health Insurance ID</label>
          <input
            className="input"
            value={form.healthInsuranceId ?? ''}
            onChange={(e) => setForm({ ...form, healthInsuranceId: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && <span className="text-xs text-slate-400">Saved.</span>}
      </div>
    </div>
  );
}
