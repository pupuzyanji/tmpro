'use client';

import { useState } from 'react';
import { MODULE_KEYS, CORE_MODULE_KEYS, UNGATED_MODULE_KEYS, type ModuleKey } from '@/lib/modules';

export interface TenantFormValues {
  organisationName: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  password: string;
  enabledModules: ModuleKey[];
  seatCap: string; // '' = unlimited
}

export const EMPTY_TENANT_FORM: TenantFormValues = {
  organisationName: '',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  password: '',
  enabledModules: [...CORE_MODULE_KEYS],
  seatCap: '',
};

/** Shared by "Add Tenant" and "Edit" (v019.A) — same field set either way,
 *  per the platform-admin spec: admin first name, surname, organisation
 *  name, email, (set/reset) password, then modules and seat cap. `mode`
 *  only changes copy and whether the password field is required. */
export function TenantFormModal({
  mode,
  initial,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: TenantFormValues;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: TenantFormValues) => void;
}) {
  const [values, setValues] = useState<TenantFormValues>(initial);

  function set<K extends keyof TenantFormValues>(key: K, value: TenantFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleModule(key: ModuleKey) {
    if (CORE_MODULE_KEYS.includes(key)) return;
    setValues((prev) => ({
      ...prev,
      enabledModules: prev.enabledModules.includes(key)
        ? prev.enabledModules.filter((m) => m !== key)
        : [...prev.enabledModules, key],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8">
      <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full rounded-t-2xl bg-brand-gradient" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(values);
          }}
          className="space-y-5 p-6"
        >
          <div>
            <h2 className="text-lg font-semibold text-ink">{mode === 'create' ? 'Add Tenant' : 'Edit Tenant'}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {mode === 'create'
                ? 'New tenants land in Inactive Tenants until you activate them.'
                : 'Update the organisation, its admin login, modules or seat cap.'}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="organisationName">
              Organisation name
            </label>
            <input
              id="organisationName"
              className="input"
              value={values.organisationName}
              onChange={(e) => set('organisationName', e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="adminFirstName">
                Tenant admin — first name
              </label>
              <input
                id="adminFirstName"
                className="input"
                value={values.adminFirstName}
                onChange={(e) => set('adminFirstName', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="adminLastName">
                Surname
              </label>
              <input
                id="adminLastName"
                className="input"
                value={values.adminLastName}
                onChange={(e) => set('adminLastName', e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="adminEmail">
              Admin email address
            </label>
            <input
              id="adminEmail"
              type="email"
              className="input"
              value={values.adminEmail}
              onChange={(e) => set('adminEmail', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              {mode === 'create' ? 'Set password' : 'Reset password'}
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={values.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={mode === 'edit' ? 'Leave blank to keep the current password' : undefined}
              required={mode === 'create'}
              minLength={8}
            />
            {mode === 'create' && <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>}
          </div>

          <div>
            <label className="label">Modules</label>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_KEYS.map((key) => {
                const isCore = CORE_MODULE_KEYS.includes(key);
                const isUngated = UNGATED_MODULE_KEYS.includes(key) && !isCore;
                const checked = isCore || values.enabledModules.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleModule(key)}
                    disabled={isCore}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      checked
                        ? 'border-transparent bg-brand-gradient-soft text-ink ring-1 ring-inset ring-[var(--accent-ring)]'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    } ${isCore ? 'cursor-default opacity-90' : ''}`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[9px] font-bold ${
                          checked ? 'border-transparent bg-brand-gradient text-white' : 'border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      {key}
                    </span>
                    {isCore && <span className="pl-6 text-[11px] text-slate-400">Always included</span>}
                    {isUngated && <span className="pl-6 text-[11px] text-slate-400">Not a separate module yet</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="seatCap">
              Seat capacity
            </label>
            <input
              id="seatCap"
              type="number"
              min={0}
              className="input"
              placeholder="Unlimited"
              value={values.seatCap}
              onChange={(e) => set('seatCap', e.target.value)}
            />
          </div>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'create' ? 'Add Tenant' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
