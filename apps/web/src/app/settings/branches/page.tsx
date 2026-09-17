'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { CsvImportButton } from '@/components/csv-import-button';
import { IconPencil, IconPlus, IconTrash } from '@/components/icons';
import { COUNTRIES } from '@/lib/reference-data';

interface Branch {
  id: string;
  name: string;
  isHeadOffice: number;
  street: string | null;
  townCity: string | null;
  province: string | null;
  country: string | null;
}

export default function BranchesSettingsPage() {
  const { ready, call } = useApi();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [townCity, setTownCity] = useState('');
  const [province, setProvince] = useState('');
  const [country, setCountry] = useState('');
  const [isHeadOffice, setIsHeadOffice] = useState(false);

  function refresh() {
    return call<Branch[]>('/settings/branches')
      .then(setBranches)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load branches.'));
  }

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, call]);

  function resetForm() {
    setName('');
    setStreet('');
    setTownCity('');
    setProvince('');
    setCountry('');
    setIsHeadOffice(false);
    setAdding(false);
    setEditingId(null);
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setName(b.name);
    setStreet(b.street ?? '');
    setTownCity(b.townCity ?? '');
    setProvince(b.province ?? '');
    setCountry(b.country ?? '');
    setIsHeadOffice(!!b.isHeadOffice);
    setAdding(true);
  }

  async function save() {
    if (!name.trim()) return;
    try {
      const body = JSON.stringify({
        name,
        street: street || undefined,
        townCity: townCity || undefined,
        province: province || undefined,
        country: country || undefined,
        isHeadOffice: isHeadOffice ? 1 : 0,
      });
      if (editingId) {
        await call(`/settings/branches/${editingId}`, { method: 'PATCH', body });
      } else {
        await call('/settings/branches', { method: 'POST', body });
      }
      resetForm();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save branch.');
    }
  }

  async function remove(id: string) {
    try {
      await call(`/settings/branches/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete branch.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{branches.length} branch{branches.length === 1 ? '' : 'es'}</p>
        <div className="flex gap-2">
          <CsvImportButton
            endpoint="/settings/branches/import"
            onDone={refresh}
            sampleFileName="branches-sample.csv"
            sampleColumns={[
              { header: 'name', example: 'Auckland CBD' },
              { header: 'isHeadOffice', example: 'true' },
              { header: 'street', example: '1 Queen Street' },
              { header: 'townCity', example: 'Auckland' },
              { header: 'province', example: 'Auckland' },
              { header: 'country', example: 'New Zealand' },
            ]}
          />
          <button
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap py-1.5"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            <IconPlus /> Add branch
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {adding && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <p className="text-sm font-semibold text-ink sm:col-span-2">{editingId ? 'Edit branch' : 'New branch'}</p>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Street</label>
            <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div>
            <label className="label">Town/City</label>
            <input className="input" value={townCity} onChange={(e) => setTownCity(e.target.value)} />
          </div>
          <div>
            <label className="label">Province</label>
            <input className="input" value={province} onChange={(e) => setProvince(e.target.value)} />
          </div>
          <div>
            <label className="label">Country</label>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">—</option>
              {!COUNTRIES.some((c) => c.name === country) && country && <option value={country}>{country}</option>}
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={isHeadOffice} onChange={(e) => setIsHeadOffice(e.target.checked)} />
            This is the head office
          </label>
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
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Street</th>
              <th className="px-5 py-3 font-medium">Town/City</th>
              <th className="px-5 py-3 font-medium">Province</th>
              <th className="px-5 py-3 font-medium">Country</th>
              <th className="px-5 py-3 font-medium">Head office</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-ink">{b.name}</td>
                <td className="px-5 py-3 text-slate-600">{b.street ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{b.townCity ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{b.province ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{b.country ?? '—'}</td>
                <td className="px-5 py-3 text-slate-600">{b.isHeadOffice ? 'Yes' : '—'}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button className="text-slate-400 hover:text-ink" onClick={() => startEdit(b)}>
                      <IconPencil />
                    </button>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => remove(b.id)}>
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                  No branches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
