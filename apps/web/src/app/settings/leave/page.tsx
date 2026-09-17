'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';

type AccrualPeriod = 'DAILY' | 'MONTHLY' | 'ANNUALLY';

interface LeaveTypeRow {
  id: string;
  name: string;
  countryCode: string;
  isPaid: boolean;
  defaultAnnualDays: number;
  accrualPeriod: AccrualPeriod;
  carryOverEnabled: boolean;
}

const REGIMES: Array<{ value: string; label: string }> = [
  { value: 'ZM', label: 'Zambia — Native' },
  { value: 'MW', label: 'Malawi — Native' },
  { value: 'ZA', label: 'South Africa — Native' },
  { value: 'OTHER', label: 'Other' },
];

const PERIOD_LABEL: Record<AccrualPeriod, string> = { DAILY: 'Daily', MONTHLY: 'Monthly', ANNUALLY: 'Annually' };

export default function LeaveSettingsPage() {
  const { ready, call } = useApi();
  const [countryCode, setCountryCode] = useState('ZM');
  const [rows, setRows] = useState<LeaveTypeRow[]>([]);
  const [draft, setDraft] = useState<LeaveTypeRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function refresh(code: string) {
    setLoading(true);
    setError(null);
    return call<LeaveTypeRow[]>(`/settings/leave-types?countryCode=${code}`)
      .then((data) => {
        setRows(data);
        setDraft(data);
        setEditing(false);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load leave types.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!ready) return;
    refresh(countryCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, countryCode]);

  function updateDraft(id: string, patch: Partial<LeaveTypeRow>) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await call('/settings/leave-types', {
        method: 'PATCH',
        body: JSON.stringify({
          countryCode,
          rows: draft.map((r) => ({
            id: r.id,
            defaultAnnualDays: r.defaultAnnualDays,
            accrualPeriod: r.accrualPeriod,
            carryOverEnabled: r.carryOverEnabled,
          })),
        }),
      });
      await refresh(countryCode);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save leave types.');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(rows);
    setEditing(false);
  }

  if (!ready) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">
          Configure how many days each leave type accrues, how often, and whether unused days carry over — per
          country. Every employee draws on the regime that matches their own country; if none has been configured
          yet, they fall back to <span className="font-medium text-ink">Other</span>.
        </p>
      </div>

      <div className="max-w-xs">
        <label className="label">Country</label>
        <select className="input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
          {REGIMES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {savedAt && !editing && !error && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Leave settings saved.</p>
      )}

      <div className="card overflow-hidden !p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{REGIMES.find((r) => r.value === countryCode)?.label}</p>
            <p className="text-xs text-slate-400">Public Holidays isn&rsquo;t listed here — it&rsquo;s a calendar entry, not a balance an employee draws down.</p>
          </div>
          {!editing ? (
            <button className="btn-secondary py-1.5" onClick={() => setEditing(true)} disabled={loading}>
              Update
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary py-1.5" onClick={cancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary py-1.5" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Leave type</th>
              <th className="px-5 py-3 font-medium">No. days accrued</th>
              <th className="px-5 py-3 font-medium">Accrual period</th>
              <th className="px-5 py-3 font-medium">Carry-over</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3 font-medium text-ink">
                  {r.name}
                  {!r.isPaid && <span className="badge ml-2 bg-slate-100 text-slate-500">Unpaid</span>}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {editing ? (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="input w-24"
                      value={r.defaultAnnualDays}
                      onChange={(e) => updateDraft(r.id, { defaultAnnualDays: Number(e.target.value) })}
                    />
                  ) : (
                    r.defaultAnnualDays
                  )}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {editing ? (
                    <select
                      className="input w-32"
                      value={r.accrualPeriod}
                      onChange={(e) => updateDraft(r.id, { accrualPeriod: e.target.value as AccrualPeriod })}
                    >
                      <option value="DAILY">Daily</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUALLY">Annually</option>
                    </select>
                  ) : (
                    PERIOD_LABEL[r.accrualPeriod]
                  )}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {editing ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={r.carryOverEnabled}
                      onChange={(e) => updateDraft(r.id, { carryOverEnabled: e.target.checked })}
                    />
                  ) : (
                    <span className={`badge ${r.carryOverEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.carryOverEnabled ? 'Carries over' : 'Resets 1 Jan'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {draft.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                  No leave types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Carry-over on: the cycle runs from that employee&rsquo;s own Start Date under Compensation, and balances
        accumulate — nothing resets. Carry-over off: the cycle runs from 1 January of the current year (or the
        employee&rsquo;s start date if they joined later that year), and the balance restarts from zero every New
        Year. {countryCode === 'ZM' && 'Zambia’s starting figures follow the statutory baseline as a reference point — confirm against current Zambian labour law before relying on them, and adjust anything here freely.'}
      </p>
    </div>
  );
}
