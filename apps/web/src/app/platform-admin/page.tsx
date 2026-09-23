'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlatformApi } from '@/lib/use-platform-api';
import { usePlatformAuth } from '@/lib/platform-auth';
import { ApiError } from '@/lib/api';
import { MODULE_KEYS, type ModuleKey } from '@/lib/modules';
import { LogoMark } from '@/components/logo';
import { TabBar } from '@/components/tab-bar';
import { IconCheckCircle, IconPauseCircle, IconClock } from '@/components/icons';
import { TenantFormModal, EMPTY_TENANT_FORM, type TenantFormValues } from './tenant-form';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  enabledModules: string[];
  seatCap: number | null;
  seatsUsed: number;
  createdAt: string;
  admin: { firstName: string | null; lastName: string | null; email: string } | null;
}

interface PendingApplication {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organisationName: string;
  country: string;
  staffComplement: number;
  featuresNeeded: string[];
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DECLINED';
  createdAt: string;
}

type Tab = 'active' | 'inactive' | 'pending';

const PENDING_STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-sky-50 text-sky-700',
  CONTACTED: 'bg-amber-50 text-amber-700',
  CONVERTED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-slate-100 text-slate-500',
};

function adminName(t: Tenant) {
  if (!t.admin) return '—';
  const name = [t.admin.firstName, t.admin.lastName].filter(Boolean).join(' ');
  return name || t.admin.email;
}

export default function PlatformAdminDashboardPage() {
  const { ready, call } = usePlatformApi();
  const { session, logout } = usePlatformAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('active');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; tenantId?: string; initial: TenantFormValues } | null>(
    null,
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTenants = useCallback(() => {
    if (!ready) return;
    call<Tenant[]>('/platform-admin/tenants')
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load tenants.'));
  }, [ready, call]);

  const loadApplications = useCallback(() => {
    if (!ready) return;
    call<PendingApplication[]>('/platform-admin/org-signups')
      .then(setApplications)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load applications.'));
  }, [ready, call]);

  useEffect(() => {
    loadTenants();
    loadApplications();
  }, [loadTenants, loadApplications]);

  const activeTenants = useMemo(() => tenants.filter((t) => t.status === 'ACTIVE'), [tenants]);
  const inactiveTenants = useMemo(() => tenants.filter((t) => t.status === 'INACTIVE'), [tenants]);

  function openAddModal(prefill?: Partial<TenantFormValues>) {
    setModalError(null);
    setModal({ mode: 'create', initial: { ...EMPTY_TENANT_FORM, ...prefill } });
  }

  function openEditModal(t: Tenant) {
    setModalError(null);
    setModal({
      mode: 'edit',
      tenantId: t.id,
      initial: {
        organisationName: t.name,
        adminFirstName: t.admin?.firstName ?? '',
        adminLastName: t.admin?.lastName ?? '',
        adminEmail: t.admin?.email ?? '',
        password: '',
        enabledModules: t.enabledModules as ModuleKey[],
        seatCap: t.seatCap != null ? String(t.seatCap) : '',
      },
    });
  }

  function fromApplication(app: PendingApplication) {
    const [first, ...rest] = app.name.trim().split(/\s+/);
    openAddModal({
      organisationName: app.organisationName,
      adminFirstName: first ?? '',
      adminLastName: rest.join(' '),
      adminEmail: app.email,
      enabledModules: MODULE_KEYS.filter((k) => app.featuresNeeded.includes(k)) as ModuleKey[],
    });
  }

  async function submitModal(values: TenantFormValues) {
    if (!modal) return;
    setSaving(true);
    setModalError(null);
    try {
      const seatCap = values.seatCap.trim() === '' ? null : parseInt(values.seatCap, 10);
      if (seatCap !== null && (Number.isNaN(seatCap) || seatCap < 0)) {
        setModalError('Seat capacity must be a non-negative number, or blank for unlimited.');
        setSaving(false);
        return;
      }
      if (modal.mode === 'create') {
        await call('/platform-admin/tenants', {
          method: 'POST',
          body: JSON.stringify({
            organisationName: values.organisationName,
            adminFirstName: values.adminFirstName,
            adminLastName: values.adminLastName,
            adminEmail: values.adminEmail,
            password: values.password,
            enabledModules: values.enabledModules,
            seatCap,
          }),
        });
      } else {
        await call(`/platform-admin/tenants/${modal.tenantId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            organisationName: values.organisationName,
            adminFirstName: values.adminFirstName,
            adminLastName: values.adminLastName,
            adminEmail: values.adminEmail,
            ...(values.password.trim() ? { password: values.password } : {}),
            enabledModules: values.enabledModules,
            seatCap,
          }),
        });
      }
      setModal(null);
      loadTenants();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Could not save this tenant.');
    } finally {
      setSaving(false);
    }
  }

  async function activate(id: string) {
    setBusyId(id);
    try {
      await call(`/platform-admin/tenants/${id}/activate`, { method: 'POST' });
      loadTenants();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate this tenant.');
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(id: string) {
    setBusyId(id);
    try {
      await call(`/platform-admin/tenants/${id}/deactivate`, { method: 'POST' });
      loadTenants();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not deactivate this tenant.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(t: Tenant) {
    if (!window.confirm(`Permanently delete ${t.name}? This removes all of its data and can't be undone.`)) return;
    setBusyId(t.id);
    try {
      await call(`/platform-admin/tenants/${t.id}`, { method: 'DELETE' });
      loadTenants();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this tenant.');
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <header className="border-b border-slate-100 bg-white">
        <div className="h-1 w-full bg-brand-gradient" />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-sm font-bold text-ink">tmPro — Platform Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{session?.admin.email}</span>
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-ink"
              onClick={() => {
                logout();
                router.replace('/platform-admin/login');
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Tenants</h1>
            <p className="mt-1 text-sm text-slate-500">
              Provision tenants, and manage which of tmPro&apos;s {MODULE_KEYS.length} modules and how many employee
              seats each one has.
            </p>
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => openAddModal()}>
            + Add Tenant
          </button>
        </div>

        <TabBar
          className="mb-5"
          items={(
            [
              ['active', `Active Tenants (${activeTenants.length})`, <IconCheckCircle key="i" />],
              ['inactive', `Inactive Tenants (${inactiveTenants.length})`, <IconPauseCircle key="i" />],
              ['pending', `Pending Applications (${applications.length})`, <IconClock key="i" />],
            ] as [Tab, string, React.ReactNode][]
          ).map(([key, label, icon]) => ({ key, label, icon, active: tab === key, onClick: () => setTab(key) }))}
        />

        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {tab !== 'pending' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Organisation</th>
                  <th className="px-5 py-3">Tenant admin</th>
                  <th className="px-5 py-3">Modules</th>
                  <th className="px-5 py-3">Seats</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {(tab === 'active' ? activeTenants : inactiveTenants).map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-5 py-4">
                      <p className="font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{adminName(t)}</p>
                      {t.admin && <p className="text-xs text-slate-400">{t.admin.email}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {t.enabledModules.length} / {MODULE_KEYS.length}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {t.seatsUsed} {t.seatCap != null ? `/ ${t.seatCap}` : '(unlimited)'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" className="btn-secondary py-1" onClick={() => openEditModal(t)}>
                          Edit
                        </button>
                        {tab === 'active' ? (
                          <button
                            type="button"
                            className="btn-secondary py-1"
                            disabled={busyId === t.id}
                            onClick={() => deactivate(t.id)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn-primary py-1"
                              disabled={busyId === t.id}
                              onClick={() => activate(t.id)}
                            >
                              Activate
                            </button>
                            <button
                              type="button"
                              className="btn py-1 text-red-600 hover:bg-red-50"
                              disabled={busyId === t.id}
                              onClick={() => remove(t)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(tab === 'active' ? activeTenants : inactiveTenants).length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                      {tab === 'active' ? 'No active tenants yet.' : 'No inactive tenants.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'pending' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Organisation</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Country / staff</th>
                  <th className="px-5 py-3">Requested modules</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-t border-slate-100">
                    <td className="px-5 py-4">
                      <p className="font-medium text-ink">{app.organisationName}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{app.name}</p>
                      <p className="text-xs text-slate-400">{app.email}</p>
                      {app.phone && <p className="text-xs text-slate-400">{app.phone}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {app.country} · {app.staffComplement} staff
                    </td>
                    <td className="px-5 py-4 text-slate-600">{app.featuresNeeded.length} / {MODULE_KEYS.length}</td>
                    <td className="px-5 py-4">
                      <span className={`badge ${PENDING_STATUS_STYLES[app.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className="btn-secondary py-1" onClick={() => fromApplication(app)}>
                        Create tenant
                      </button>
                    </td>
                  </tr>
                ))}
                {applications.length === 0 && !error && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                      No applications yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modal && (
        <TenantFormModal
          mode={modal.mode}
          initial={modal.initial}
          submitting={saving}
          error={modalError}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
        />
      )}
    </div>
  );
}
