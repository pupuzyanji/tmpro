'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { PAYROLL_COUNTRIES } from '@/app/payroll/shared';

// v030.A — Settings → Payroll: who approves pay runs, and when a second
// approval is needed, per payroll country. Admins edit; HR can view.

type Level = '1' | '2' | 'ANY';
interface Person {
  userId: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
}
interface SettingsResponse {
  countryCode: string;
  settings: {
    approvalsRequired: number;
    secondWhenCostOver: number | null;
    secondWhenIncreasePct: number | null;
    secondWhenOverride: boolean;
    preparerCannotApprove: boolean;
    sendBackNeedsComment: boolean;
    notifyOnSubmit: boolean;
    notifyOnDecision: boolean;
  };
  approvers: Array<{ userId: string; name: string; level: Level; jobTitle: string | null }>;
  fallbackToAdmins: boolean;
  eligible: Person[];
}

const LEVEL_LABEL: Record<Level, string> = { '1': 'First approver', '2': 'Second approver', ANY: 'Either level' };

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[color:var(--section)]' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[19px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

function Rule({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-slate-100 py-3.5 first:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export default function PayrollSettingsPage() {
  const { session, ready, call } = useApi();
  const isAdmin = session?.user.role === 'ADMIN';
  const [country, setCountry] = useState('ZM');
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<SettingsResponse['settings'] | null>(null);
  const [approvers, setApprovers] = useState<Array<{ userId: string; level: Level }>>([]);
  const [costOn, setCostOn] = useState(false);
  const [pctOn, setPctOn] = useState(false);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await call<SettingsResponse>(`/payroll/approval-settings/${country}`);
      setData(r);
      setForm(r.settings);
      setApprovers(r.approvers.map((a) => ({ userId: a.userId, level: a.level })));
      setCostOn(r.settings.secondWhenCostOver != null);
      setPctOn(r.settings.secondWhenIncreasePct != null);
      setError(null);
      setSaved(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the payroll settings.');
    }
  }, [call, country]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const r = await call<SettingsResponse>(`/payroll/approval-settings/${country}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          secondWhenCostOver: costOn ? Number(form.secondWhenCostOver ?? 0) : null,
          secondWhenIncreasePct: pctOn ? Number(form.secondWhenIncreasePct ?? 0) : null,
          approvers,
        }),
      });
      setData(r);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !data || !form) return error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-400">Loading…</p>;

  const set = <K extends keyof SettingsResponse['settings']>(k: K, v: SettingsResponse['settings'][K]) => {
    setForm({ ...form, [k]: v });
    setSaved(false);
  };
  const person = (id: string) => data.eligible.find((e) => e.userId === id);
  const available = data.eligible.filter((e) => !approvers.some((a) => a.userId === e.userId));
  const firsts = approvers.filter((a) => a.level !== '2').map((a) => person(a.userId)?.name).filter(Boolean);
  const seconds = approvers.filter((a) => a.level !== '1').map((a) => person(a.userId)?.name).filter(Boolean);
  const secondRules = [
    costOn && form.secondWhenCostOver != null ? `the run costs over ${Number(form.secondWhenCostOver).toLocaleString()}` : null,
    pctOn && form.secondWhenIncreasePct != null ? `the run is more than ${form.secondWhenIncreasePct}% up on the previous one` : null,
    form.secondWhenOverride ? 'a check was accepted at submission' : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Pay run approvals</h2>
          <p className="text-sm text-slate-500">Who approves pay runs, and when a second approval is needed. Set for each payroll country.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="appr-country">
            Payroll country
          </label>
          <select id="appr-country" className="input !w-auto" value={country} onChange={(e) => setCountry(e.target.value)}>
            {PAYROLL_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
      {!isAdmin && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Only an Admin can change these settings.</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Saved.</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="card">
            <div className="card-head flex items-center justify-between gap-3">
              <h3 className="card-title text-sm font-semibold text-ink">Approvers</h3>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Only people with <strong>Can approve payroll</strong> switched on (People → person → Permission) can be added. They need no HR or Admin role.
            </p>
            {approvers.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No approvers are named for {country}, so any Admin can approve — except the person who prepared the run, if that rule is on.
              </p>
            )}
            <ul>
              {approvers.map((a) => {
                const p = person(a.userId);
                return (
                  <li key={a.userId} className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-3 first:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{p?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{p?.jobTitle ?? p?.email}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      Level
                      <select
                        className="input !w-auto !py-1.5 text-sm"
                        value={a.level}
                        disabled={!isAdmin}
                        onChange={(e) => {
                          setApprovers(approvers.map((x) => (x.userId === a.userId ? { ...x, level: e.target.value as Level } : x)));
                          setSaved(false);
                        }}
                      >
                        {(['1', '2', 'ANY'] as Level[]).map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_LABEL[l]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isAdmin && (
                      <button
                        className="btn-secondary !py-1.5 text-xs text-red-700"
                        onClick={() => {
                          setApprovers(approvers.filter((x) => x.userId !== a.userId));
                          setSaved(false);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {isAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <select className="input !w-64" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Person to add">
                  <option value="">{available.length ? 'Add an approver…' : 'Nobody else can approve payroll yet'}</option>
                  {available.map((e) => (
                    <option key={e.userId} value={e.userId}>
                      {e.name}
                      {e.jobTitle ? ` — ${e.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-secondary"
                  disabled={!adding}
                  onClick={() => {
                    setApprovers([...approvers, { userId: adding, level: approvers.some((a) => a.level !== '2') ? '2' : '1' }]);
                    setAdding('');
                    setSaved(false);
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3 className="card-title text-sm font-semibold text-ink">Approval rules</h3>
            </div>
            <Rule title="Approvals needed" body="How many approvers must approve before the run is locked.">
              <select className="input !w-56" value={form.approvalsRequired} disabled={!isAdmin} onChange={(e) => set('approvalsRequired', Number(e.target.value))}>
                <option value={1}>One (two when a rule applies)</option>
                <option value={2}>Always two</option>
              </select>
            </Rule>
            <Rule title="Second approval when the total cost is over" body="The run's total employer cost: gross pay, non-taxable additions and employer contributions.">
              <input
                type="number"
                min={0}
                className="input !w-36"
                value={form.secondWhenCostOver ?? ''}
                disabled={!isAdmin || !costOn}
                onChange={(e) => set('secondWhenCostOver', e.target.value === '' ? null : Number(e.target.value))}
                aria-label="Cost limit"
              />
              <Toggle checked={costOn} disabled={!isAdmin} onChange={(v) => { setCostOn(v); setSaved(false); }} label="Use the cost limit" />
            </Rule>
            <Rule title="Second approval when the run is up on the previous one by more than" body="Total employer cost against the previous run for this country.">
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  className="input !w-24"
                  value={form.secondWhenIncreasePct ?? ''}
                  disabled={!isAdmin || !pctOn}
                  onChange={(e) => set('secondWhenIncreasePct', e.target.value === '' ? null : Number(e.target.value))}
                  aria-label="Increase limit in percent"
                />
                %
              </span>
              <Toggle checked={pctOn} disabled={!isAdmin} onChange={(v) => { setPctOn(v); setSaved(false); }} label="Use the increase limit" />
            </Rule>
            <Rule title="Second approval when a check was accepted" body="If the preparer submits with items marked “Check” still open.">
              <Toggle checked={form.secondWhenOverride} disabled={!isAdmin} onChange={(v) => set('secondWhenOverride', v)} label="Second approval when a check was accepted" />
            </Rule>
            <Rule title="The preparer can't approve their own run" body="Whoever calculated, recalculated or submitted the run is left out of its approvers. Auditors look for this.">
              <Toggle checked={form.preparerCannotApprove} disabled={!isAdmin} onChange={(v) => set('preparerCannotApprove', v)} label="Preparer can't approve" />
            </Rule>
            <Rule title="Sending back needs a comment" body="The preparer sees why the run was returned.">
              <Toggle checked={form.sendBackNeedsComment} disabled={!isAdmin} onChange={(v) => set('sendBackNeedsComment', v)} label="Send back needs a comment" />
            </Rule>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card">
            <div className="card-head">
              <h3 className="card-title text-sm font-semibold text-ink">Emails</h3>
            </div>
            <Rule title="Email approvers when a run is submitted" body="And the second approver after the first approval.">
              <Toggle checked={form.notifyOnSubmit} disabled={!isAdmin} onChange={(v) => set('notifyOnSubmit', v)} label="Email approvers" />
            </Rule>
            <Rule title="Email the preparer when approved or sent back" body="">
              <Toggle checked={form.notifyOnDecision} disabled={!isAdmin} onChange={(v) => set('notifyOnDecision', v)} label="Email the preparer" />
            </Rule>
          </section>
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <h3 className="text-sm font-semibold text-ink">With these settings</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
              <li>An Admin or HR user calculates the run, reviews it and submits it.</li>
              <li>{firsts.length ? `${firsts.join(' or ')} approves it` : 'Any Admin approves it'}{form.preparerCannotApprove ? ' (not the person who prepared it)' : ''}.</li>
              {form.approvalsRequired === 2 ? (
                <li>{seconds.length ? `${seconds.join(' or ')}` : 'A second approver'} always approves as well.</li>
              ) : secondRules.length ? (
                <li>
                  {seconds.length ? `${seconds.join(' or ')}` : 'A second approver'} also approves when {secondRules.join(', or ')}.
                </li>
              ) : null}
              <li>The run is then locked; an approver can reopen it with a reason.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">
              Preparers are Admin and HR users. <Link href="/support#payroll-approvals" className="font-medium text-[color:var(--section)] hover:underline">How approvals work</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
