'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError, apiDownload, apiUploadWithFields } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TabBar } from '@/components/tab-bar';
import { IconCalendar, IconClock, IconDocument, IconSettings, IconUpload } from '@/components/icons';
import { CATEGORY_LABEL, day, KIND_LABEL, LeaveKind } from '@/lib/leave';

type Call = ReturnType<typeof useApi>['call'];
type TabKey = 'policies' | 'holidays' | 'schedules' | 'opening' | 'processing';

const REGIMES: Array<{ value: string; label: string }> = [
  { value: 'ZM', label: 'Zambia — Employment Code Act 2019' },
  { value: 'MW', label: 'Malawi — Employment Act 2000 (as amended 2021)' },
  { value: 'NZ', label: 'New Zealand — Holidays Act 2003' },
  { value: 'AU', label: 'Australia — National Employment Standards' },
  { value: 'ZA', label: 'South Africa — Basic Conditions of Employment Act' },
  { value: 'ZW', label: 'Zimbabwe — Labour Act [Chapter 28:01]' },
  { value: 'OTHER', label: 'Other countries (generic)' },
];

/** v028.A — Settings → Leave: policies per country (effective-dated, with
 *  the statutory floor enforced), the public holiday calendar, work weeks,
 *  opening balances for organisations moving onto tmPro, and processing. */
export default function LeaveSettingsPage() {
  const { ready, call } = useApi();
  const [tab, setTab] = useState<TabKey>('policies');
  const [country, setCountry] = useState('ZM');
  if (!ready) return null;
  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'policies', label: 'Policies', icon: <IconDocument /> },
    { key: 'holidays', label: 'Public holidays', icon: <IconCalendar /> },
    { key: 'schedules', label: 'Work weeks', icon: <IconClock /> },
    { key: 'opening', label: 'Opening balances', icon: <IconUpload /> },
    { key: 'processing', label: 'Processing', icon: <IconSettings /> },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabBar items={tabs.map((t) => ({ ...t, active: tab === t.key, onClick: () => setTab(t.key) }))} />
        {['policies', 'holidays', 'opening'].includes(tab) && (
          <div className="w-72">
            <label className="label">Country rules</label>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {REGIMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {tab === 'policies' && <PoliciesPanel country={country} call={call} />}
      {tab === 'holidays' && <HolidaysPanel country={country} call={call} />}
      {tab === 'schedules' && <SchedulesPanel call={call} />}
      {tab === 'opening' && <OpeningPanel country={country} call={call} />}
      {tab === 'processing' && <ProcessingPanel call={call} />}
    </div>
  );
}

function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{msg}</p> : null;
}

// ---------------------------------------------------------------- Policies

interface PolicyRow {
  type: {
    id: string;
    name: string;
    code: string;
    kind: LeaveKind;
    unitBasis: string;
    isPaid: boolean;
    approvalFlow: string[];
    attachmentRequired: boolean;
    reasonRequired: boolean;
    reasonAllowed: boolean;
    genderRestriction: string;
    description: string | null;
    templateItemId: string | null;
  };
  policy: {
    id: string;
    effectiveFrom: string;
    entitlement: number;
    cycle: string;
    accrualFrequency: string;
    usableAfterMonths: number;
    minServiceMonths: number;
    eligibleCategories: string[] | null;
    carryForwardMax: number | null;
    excessAction: string;
    allowNegative: number;
    belowStatutoryOk: boolean;
    exemptionReason: string | null;
    payRules: Record<string, any>;
    eventRules?: Record<string, any>;
    entitlementByWeek?: Array<{ minDays: number; entitlement: number }> | null;
  } | null;
  scheduled: PolicyRow['policy'];
  history: Array<{ id: string; effectiveFrom: string; effectiveTo: string | null; entitlement: number }>;
  statutory: { min: number | null; section: string | null } | null;
}

function entitlementText(r: PolicyRow) {
  const p = r.policy;
  if (!p) return '—';
  const t = r.type;
  if (t.kind === 'ACCRUING' && p.payRules?.entitlementWeeks) {
    const w = Number(p.payRules.entitlementWeeks);
    return `${w} week${w === 1 ? '' : 's'}/year (${w * 5} days on a 5-day week)${p.accrualFrequency === 'UPFRONT' ? ', granted yearly' : ', accrues monthly'}`;
  }
  if (t.kind === 'ACCRUING' && p.accrualFrequency === 'UPFRONT') return `${p.entitlement} days granted each year`;
  if (t.kind === 'ACCRUING') {
    const base = `${p.entitlement} days/year (${Math.round((p.entitlement / 12) * 100) / 100}/month)`;
    const byWeek = (p.entitlementByWeek ?? []).map((w) => `${w.entitlement} on a ${w.minDays}-day week`);
    return byWeek.length ? `${base} · ${byWeek.join(' · ')}` : base;
  }
  if (t.kind === 'ALLOWANCE') return `${p.entitlement} per ${p.cycle === 'CALENDAR_MONTH' ? 'month' : p.cycle === 'CALENDAR_YEAR' ? 'calendar year' : 'year of service'}`;
  if (t.kind === 'EVENT') return `${p.entitlement} ${t.unitBasis === 'CALENDAR_DAYS' ? 'calendar days' : p.entitlement === 1 ? 'day' : 'days'} per event`;
  if (t.kind === 'EPISODE' && p.payRules?.mode === 'YEARLY') {
    const pr = p.payRules;
    const full = pr.fullDays != null ? `${pr.fullDays} days` : `${pr.fullWeeks} weeks`;
    const half = pr.halfDays != null ? (pr.halfDays ? `${pr.halfDays} days` : '') : pr.halfWeeks ? `${pr.halfWeeks} weeks` : '';
    const per = Number(pr.cycleYears ?? 1) > 1 ? `per ${pr.cycleYears}-year cycle` : 'per service year';
    return `${full} full pay${half ? ` + ${half} half pay` : ''} ${per}`;
  }
  if (t.kind === 'EPISODE') {
    const s = p.payRules?.SHORT;
    const l = p.payRules?.LONG;
    return `Short-term: ${s?.fullDays ?? '—'} full + ${s?.halfDays ?? '—'} half days · Long-term: ${l?.fullMonths ?? '—'} + ${l?.halfMonths ?? '—'} months`;
  }
  return t.isPaid ? 'Paid, no limit' : 'Unpaid, no limit';
}

function PoliciesPanel({ country, call }: { country: string; call: Call }) {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setError(null);
    call<PolicyRow[]>(`/leave/admin/policies?country=${country}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load policies.'));
  }, [call, country]);

  useEffect(() => {
    load();
    setEditing(null);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {country === 'ZM'
          ? 'Zambian leave follows the Employment Code Act No. 3 of 2019. You can make any entitlement more generous; going below the legal minimum needs a declared exemption (e.g. SI No. 48 of 2020 or a collective agreement). Changes take effect from the date you choose — past balances keep the rule that applied at the time.'
          : country === 'MW'
            ? 'Malawian leave follows the Employment Act No. 6 of 2000 as amended by Act No. 17 of 2021 (paternity leave, s.47A). You can make any entitlement more generous; going below the legal minimum needs a declared exemption. Compassionate, family responsibility, study and wedding leave are not in the Act — they are your company policy, set to 5 working days a year until you change them.'
            : country === 'NZ'
              ? 'New Zealand leave follows the Holidays Act 2003 (which stays in force until the Employment Leave Bill, targeted for 2028, replaces it) and the Parental Leave and Employment Protection Act 1987. Annual holidays and sick leave are in weeks, so part-timers get the same weeks off. Regional anniversary days differ by province — add yours under Public holidays. Holiday pay (greater of ordinary or average weekly earnings) and the 8% payout for leavers in their first year are payroll matters.'
              : country === 'AU'
                ? 'Australian leave follows the National Employment Standards (Fair Work Act 2009). Annual and personal/carer’s leave accrue progressively in weeks, pro rata for part-timers; casuals get family and domestic violence leave only. Awards and agreements can add more (leave loading, shift workers’ fifth week) — edit the policies to match. State public holidays differ — add yours under Public holidays. Long service leave is state law and isn’t included yet.'
                : country === 'ZA'
                  ? 'South African leave follows the Basic Conditions of Employment Act 75 of 1997. Parental leave follows the Constitutional Court’s Van Wyk order of 3 October 2025: 4 months for a sole employed parent, or 4 months and 10 days shared between two employed parents — tmPro allows up to 132 days per birth, so check the split when approving. Sick leave runs in 36-month cycles. Bargaining-council agreements and sectoral determinations can give more — edit the policies to match.'
                  : country === 'ZW'
                    ? 'Zimbabwean leave follows the Labour Act [Chapter 28:01] as amended in 2023. Vacation leave is counted in calendar days (weekends and holidays inside a leave period count) and stops accruing at 90 days. Maternity leave no longer needs a minimum period of service. Collective bargaining agreements for your industry may give more — edit the policies to match.'
                    : 'No statutory rules are loaded for this country yet — fill in your organisation’s policy. Employees whose country has no rules of its own use the “Other countries” policies.'}
      </p>
      <Err msg={error} />
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Leave type</th>
              <th className="px-4 py-3 font-semibold">Entitlement</th>
              <th className="px-4 py-3 font-semibold">Rules</th>
              <th className="px-4 py-3 font-semibold">Approval</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PolicyRowView key={r.type.id} r={r} country={country} editing={editing === r.type.id} onEdit={() => setEditing(editing === r.type.id ? null : r.type.id)} call={call} onSaved={() => { setEditing(null); load(); }} />
            ))}
          </tbody>
        </table>
      </div>
      {!adding ? (
        <button className="btn-secondary" onClick={() => setAdding(true)}>
          Add a company leave type
        </button>
      ) : (
        <AddTypeForm country={country} call={call} onDone={() => { setAdding(false); load(); }} />
      )}
    </div>
  );
}

function PolicyRowView({ r, country, editing, onEdit, call, onSaved }: { r: PolicyRow; country: string; editing: boolean; onEdit: () => void; call: Call; onSaved: () => void }) {
  const p = r.policy;
  const rules: string[] = [];
  if (p) {
    if (p.minServiceMonths) rules.push(`after ${p.minServiceMonths} months' service`);
    if (p.payRules?.mode === 'YEARLY' && p.payRules.minServiceMonths) rules.push(`sick pay after ${p.payRules.minServiceMonths} months' service (unpaid before)`);
    if (p.payRules?.mode === 'YEARLY' && p.payRules.earlyMonths) rules.push(`first ${p.payRules.earlyMonths} months: 1 paid day per ${p.payRules.earlyDivisor ?? 26} worked`);
    if (p.payRules?.minDaysPerWeek) rules.push(`only for people working ${p.payRules.minDaysPerWeek}+ days a week`);
    if (r.type.kind === 'ACCRUING' && p.accrualFrequency === 'MONTHLY' && p.payRules?.maxBalance != null) rules.push(`accrual pauses at ${p.payRules.maxBalance} days`);
    if (p.payRules?.firstGrantAfterMonths) rules.push(`first granted after ${p.payRules.firstGrantAfterMonths} months, then every 12 months`);
    if (p.payRules?.maxBalance != null) rules.push(`balance capped at ${p.payRules.maxBalance}`);
    if (r.type.kind === 'ACCRUING' && p.payRules?.payoutOnTermination === false) rules.push('not paid out on leaving');
    if (p.payRules?.useWithinMonths) rules.push(`take within ${p.payRules.useWithinMonths} months of falling due (overdue leave flagged)`);
    if (p.eventRules?.recurrenceYears) rules.push(`paid once every ${p.eventRules.recurrenceYears} years`);
    if (r.statutory && r.statutory.min == null && !r.statutory.section && r.type.kind === 'ALLOWANCE') rules.push('company policy (not in the Act)');
    if (r.type.kind === 'ACCRUING' && p.usableAfterMonths) rules.push(`usable after ${p.usableAfterMonths} months`);
    if (p.eligibleCategories?.length) rules.push(p.eligibleCategories.map((c) => CATEGORY_LABEL[c] ?? c).join(' / ') + ' only');
    if (r.type.genderRestriction !== 'ANY') rules.push(r.type.genderRestriction === 'FEMALE' ? 'women' : 'men');
    if (p.carryForwardMax != null) rules.push(`carry-forward cap ${p.carryForwardMax} (excess ${p.excessAction === 'PAYOUT' ? 'paid out' : p.excessAction.toLowerCase()})`);
    if (r.type.attachmentRequired) rules.push('document required');
    if (!r.type.reasonAllowed) rules.push('no reason asked');
    if (p.belowStatutoryOk) rules.push(`exemption: ${p.exemptionReason}`);
  }
  return (
    <>
      <tr className="border-b border-slate-50 align-top last:border-0">
        <td className="px-4 py-3">
          <p className="font-medium text-ink">{r.type.name}</p>
          <p className="text-xs text-slate-400">
            {r.type.kind === 'EPISODE' && p?.payRules?.mode === 'YEARLY'
              ? Number(p.payRules.cycleYears ?? 1) > 1
                ? `Per ${p.payRules.cycleYears}-year cycle`
                : 'Per service year'
              : r.type.kind === 'ACCRUING' && p?.accrualFrequency === 'UPFRONT'
                ? 'Granted yearly'
                : KIND_LABEL[r.type.kind]}
            {r.statutory?.section ? ` · ${r.statutory.section}` : ''}
            {!r.type.isPaid ? ' · unpaid' : ''}
          </p>
        </td>
        <td className="px-4 py-3 text-slate-600">
          {entitlementText(r)}
          {r.statutory?.min != null && <p className="text-xs text-slate-400">legal minimum {r.statutory.min}</p>}
          {r.scheduled && <p className="text-xs font-medium text-amber-700">Changes to {r.scheduled.entitlement} from {day(r.scheduled.effectiveFrom)}</p>}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{rules.join(' · ') || '—'}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{r.type.approvalFlow.length ? r.type.approvalFlow.map((s) => (s === 'HR' ? 'HR' : 'Supervisor')).join(' → ') : 'None (automatic)'}</td>
        <td className="px-4 py-3 text-right">
          <button className="btn-secondary !py-1 text-xs" onClick={onEdit}>
            {editing ? 'Close' : 'Edit'}
          </button>
        </td>
      </tr>
      {editing && p && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4">
            <PolicyEditor r={r} country={country} call={call} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function PolicyEditor({ r, country, call, onSaved }: { r: PolicyRow; country: string; call: Call; onSaved: () => void }) {
  // A change already scheduled for a future date is what gets edited.
  const p = r.scheduled ?? r.policy!;
  const t = r.type;
  const [entitlement, setEntitlement] = useState(String(p.entitlement));
  const [usableAfter, setUsableAfter] = useState(String(p.usableAfterMonths));
  const [minService, setMinService] = useState(String(p.minServiceMonths));
  const [cap, setCap] = useState(p.carryForwardMax == null ? '' : String(p.carryForwardMax));
  const [excess, setExcess] = useState(p.excessAction);
  const [negative, setNegative] = useState(String(p.allowNegative));
  const [flow, setFlow] = useState<string[]>(t.approvalFlow);
  const [attachment, setAttachment] = useState(t.attachmentRequired);
  const [effectiveFrom, setEffectiveFrom] = useState(r.scheduled ? r.scheduled.effectiveFrom : new Date().toISOString().slice(0, 10));
  const [exempt, setExempt] = useState(p.belowStatutoryOk);
  const [exemptionReason, setExemptionReason] = useState(p.exemptionReason ?? '');
  const [shortFull, setShortFull] = useState(String(p.payRules?.SHORT?.fullDays ?? 26));
  const [shortHalf, setShortHalf] = useState(String(p.payRules?.SHORT?.halfDays ?? 26));
  const [longFull, setLongFull] = useState(String(p.payRules?.LONG?.fullMonths ?? 3));
  const [longHalf, setLongHalf] = useState(String(p.payRules?.LONG?.halfMonths ?? 3));
  const yearlySick = p.payRules?.mode === 'YEARLY';
  const sickInDays = p.payRules?.fullDays != null;
  const [fullDaysV, setFullDaysV] = useState(String(p.payRules?.fullDays ?? ''));
  const [halfDaysV, setHalfDaysV] = useState(String(p.payRules?.halfDays ?? ''));
  const [fullWeeks, setFullWeeks] = useState(String(p.payRules?.fullWeeks ?? 4));
  const [halfWeeks, setHalfWeeks] = useState(String(p.payRules?.halfWeeks ?? 8));
  const [sickAfter, setSickAfter] = useState(String(p.payRules?.minServiceMonths ?? 12));
  const weeksBased = p.payRules?.entitlementWeeks != null;
  const [weeks, setWeeks] = useState(String(p.payRules?.entitlementWeeks ?? ''));
  const [sixDay, setSixDay] = useState(String((p.entitlementByWeek ?? []).find((w) => w.minDays === 6)?.entitlement ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        effectiveFrom,
        approvalFlow: flow,
        attachmentRequired: attachment,
        belowStatutoryOk: exempt,
        exemptionReason: exempt ? exemptionReason : null,
      };
      if (t.kind !== 'EPISODE' && t.kind !== 'UNTRACKED' && !weeksBased) body.entitlement = entitlement;
      if (weeksBased) body.payRules = { ...p.payRules, entitlementWeeks: Number(weeks) };
      if (t.kind === 'ACCRUING') {
        Object.assign(body, { usableAfterMonths: usableAfter, carryForwardMax: cap, excessAction: excess, allowNegative: negative });
        const others = (p.entitlementByWeek ?? []).filter((w) => w.minDays !== 6);
        body.entitlementByWeek = sixDay.trim() === '' ? others : [...others, { minDays: 6, entitlement: Number(sixDay) }];
      }
      if (t.kind !== 'UNTRACKED') body.minServiceMonths = minService;
      if (t.kind === 'EPISODE' && yearlySick) {
        body.payRules = sickInDays
          ? { ...p.payRules, fullDays: Number(fullDaysV), halfDays: Number(halfDaysV), minServiceMonths: Number(sickAfter) }
          : { ...p.payRules, fullWeeks: Number(fullWeeks), halfWeeks: Number(halfWeeks), minServiceMonths: Number(sickAfter) };
      } else if (t.kind === 'EPISODE') {
        body.payRules = { ...p.payRules, SHORT: { fullDays: Number(shortFull), halfDays: Number(shortHalf) }, LONG: { fullMonths: Number(longFull), halfMonths: Number(longHalf) } };
      }
      await call(`/leave/admin/policies/${t.id}`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const toggleStep = (s: string) => setFlow((f) => (f.includes(s) ? f.filter((x) => x !== s) : s === 'SUPERVISOR' ? ['SUPERVISOR', ...f] : [...f, s]));

  return (
    <div className="space-y-3">
      {r.scheduled && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          A change is scheduled from {day(r.scheduled.effectiveFrom)} — you&apos;re editing that version. The current rule stays in force until then.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {weeksBased && (
          <div>
            <label className="label">Weeks per year</label>
            <input type="number" min={0} step={0.5} className="input" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
        )}
        {t.kind !== 'EPISODE' && t.kind !== 'UNTRACKED' && !weeksBased && (
          <div>
            <label className="label">{t.kind === 'ACCRUING' ? 'Days per year' : t.kind === 'EVENT' ? 'Days per event' : 'Days per period'}</label>
            <input type="number" min={0} step={0.5} className="input" value={entitlement} onChange={(e) => setEntitlement(e.target.value)} />
          </div>
        )}
        {t.kind === 'ACCRUING' && !weeksBased && (
          <div>
            <label className="label">Days per year on a 6-day week (blank = same)</label>
            <input type="number" min={0} step={0.5} className="input" value={sixDay} onChange={(e) => setSixDay(e.target.value)} />
          </div>
        )}
        {t.kind === 'EPISODE' && yearlySick && sickInDays && (
          <>
            <div>
              <label className="label">Full-pay days per cycle</label>
              <input type="number" min={0} className="input" value={fullDaysV} onChange={(e) => setFullDaysV(e.target.value)} />
            </div>
            <div>
              <label className="label">Half-pay days per cycle</label>
              <input type="number" min={0} className="input" value={halfDaysV} onChange={(e) => setHalfDaysV(e.target.value)} />
            </div>
            <div>
              <label className="label">Sick pay after (months)</label>
              <input type="number" min={0} className="input" value={sickAfter} onChange={(e) => setSickAfter(e.target.value)} />
            </div>
          </>
        )}
        {t.kind === 'EPISODE' && yearlySick && !sickInDays && (
          <>
            <div>
              <label className="label">Full-pay weeks per cycle</label>
              <input type="number" min={0} className="input" value={fullWeeks} onChange={(e) => setFullWeeks(e.target.value)} />
            </div>
            <div>
              <label className="label">Half-pay weeks per cycle</label>
              <input type="number" min={0} className="input" value={halfWeeks} onChange={(e) => setHalfWeeks(e.target.value)} />
            </div>
            <div>
              <label className="label">Sick pay after (months)</label>
              <input type="number" min={0} className="input" value={sickAfter} onChange={(e) => setSickAfter(e.target.value)} />
            </div>
          </>
        )}
        {t.kind === 'EPISODE' && !yearlySick && (
          <>
            <div>
              <label className="label">Short-term: full-pay days</label>
              <input type="number" min={0} className="input" value={shortFull} onChange={(e) => setShortFull(e.target.value)} />
            </div>
            <div>
              <label className="label">Short-term: half-pay days</label>
              <input type="number" min={0} className="input" value={shortHalf} onChange={(e) => setShortHalf(e.target.value)} />
            </div>
            <div>
              <label className="label">Long-term: full-pay months</label>
              <input type="number" min={0} className="input" value={longFull} onChange={(e) => setLongFull(e.target.value)} />
            </div>
            <div>
              <label className="label">Long-term: half-pay months</label>
              <input type="number" min={0} className="input" value={longHalf} onChange={(e) => setLongHalf(e.target.value)} />
            </div>
          </>
        )}
        {t.kind !== 'UNTRACKED' && (
          <div>
            <label className="label">Months of service needed</label>
            <input type="number" min={0} className="input" value={minService} onChange={(e) => setMinService(e.target.value)} />
          </div>
        )}
        {t.kind === 'ACCRUING' && (
          <>
            <div>
              <label className="label">Usable after (months)</label>
              <input type="number" min={0} className="input" value={usableAfter} onChange={(e) => setUsableAfter(e.target.value)} />
            </div>
            <div>
              <label className="label">Carry-forward cap (blank = none)</label>
              <input type="number" min={0} className="input" value={cap} onChange={(e) => setCap(e.target.value)} />
            </div>
            <div>
              <label className="label">Above the cap</label>
              <select className="input" value={excess} onChange={(e) => setExcess(e.target.value)}>
                <option value="CARRY_ALL">Keep carrying it all</option>
                <option value="PAYOUT">Pay it out (encash)</option>
                <option value="FORFEIT">Forfeit (needs exemption)</option>
              </select>
            </div>
            <div>
              <label className="label">May go negative by (days)</label>
              <input type="number" min={0} step={0.5} className="input" value={negative} onChange={(e) => setNegative(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-5 text-sm text-slate-600">
        {t.code !== 'MOTHERS_DAY' && (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Approval</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={flow.includes('SUPERVISOR')} onChange={() => toggleStep('SUPERVISOR')} /> Supervisor
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={flow.includes('HR')} onChange={() => toggleStep('HR')} /> then HR
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={attachment} onChange={(e) => setAttachment(e.target.checked)} /> Supporting document required
        </label>
      </div>
      {r.statutory && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> An exemption applies (allows going below the legal minimum)
          </label>
          {exempt && <input className="input" placeholder={country === 'ZM' ? 'Reference, e.g. SI No. 48 of 2020 — management staff' : 'Reference, e.g. collective agreement of 2025'} value={exemptionReason} onChange={(e) => setExemptionReason(e.target.value)} />}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Takes effect from</label>
          <input type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Err msg={error} />
      {r.history.length > 1 && (
        <p className="text-xs text-slate-400">
          History: {r.history.map((h) => `${h.entitlement} from ${day(h.effectiveFrom)}${h.effectiveTo ? ` to ${day(h.effectiveTo)}` : ''}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function AddTypeForm({ country, call, onDone }: { country: string; call: Call; onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('ALLOWANCE');
  const [entitlement, setEntitlement] = useState('5');
  const [paid, setPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/leave/admin/types', { method: 'POST', body: JSON.stringify({ countryCode: country, name, kind, entitlement: Number(entitlement), paid }) });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add.');
    }
  }
  return (
    <form onSubmit={save} className="card space-y-3">
      <h3 className="card-head card-title text-sm font-semibold text-ink">Add a company leave type</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Study Leave" required />
        </div>
        <div>
          <label className="label">How it works</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="ALLOWANCE">Days per calendar year</option>
            <option value="ACCRUING">Accrues monthly, carries over</option>
            <option value="UNTRACKED">No balance (approval only)</option>
          </select>
        </div>
        {kind !== 'UNTRACKED' && (
          <div>
            <label className="label">Days per year</label>
            <input type="number" min={0} step={0.5} className="input" value={entitlement} onChange={(e) => setEntitlement(e.target.value)} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid leave
      </label>
      <Err msg={error} />
      <div className="flex gap-2">
        <button className="btn-primary">Add</button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Holidays

function HolidaysPanel({ country, call }: { country: string; call: Call }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Array<{ date: string; name: string; source: string; id?: string; isPaid: boolean }>>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    call<typeof rows>(`/leave/admin/holidays?country=${country}&year=${year}`).then(setRows).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load.'));
  }, [call, country, year]);
  useEffect(load, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await call('/leave/admin/holidays', { method: 'POST', body: JSON.stringify({ holidayDate: date, name, countryCode: country === 'OTHER' ? null : country }) });
      setDate('');
      setName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add.');
    }
  }
  async function remove(id: string) {
    await call(`/leave/admin/holidays/${id}`, { method: 'DELETE' });
    load();
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Public holidays are never counted as leave days. {country === 'ZM' ? "Zambia's national holidays (Public Holidays Act, including the Sunday → Monday rule) and gazetted one-offs are built in." : ''} Add your own closures (e.g. a
        company shutdown day) below.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="label">Year</label>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((h) => (
              <tr key={h.date} className="border-b border-slate-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{day(h.date)}</td>
                <td className="px-4 py-2 text-ink">{h.name}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${h.source === 'COMPANY' ? 'bg-sky-50 text-sky-700' : h.source === 'GAZETTED' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {h.source === 'COMPANY' ? 'Company' : h.source === 'GAZETTED' ? 'Gazetted' : 'National'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {h.source === 'COMPANY' && h.id && (
                    <button className="text-xs font-medium text-red-600 underline" onClick={() => remove(h.id!)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400">No holidays for this country and year yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="min-w-[240px] flex-1">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company shutdown" required />
        </div>
        <button className="btn-primary">Add holiday</button>
      </form>
      <Err msg={error} />
    </div>
  );
}

// ---------------------------------------------------------------- Work weeks

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SchedulesPanel({ call }: { call: Call }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; dayWeights: number[]; isDefault: boolean }>>([]);
  const [draft, setDraft] = useState<{ id?: string; name: string; dayWeights: number[]; isDefault: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    call<typeof rows>('/leave/admin/schedules').then(setRows).catch(() => setRows([]));
  }, [call]);
  useEffect(load, [load]);
  async function save() {
    if (!draft) return;
    setError(null);
    try {
      await call('/leave/admin/schedules', { method: 'POST', body: JSON.stringify(draft) });
      setDraft(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        A work week says which days count as leave days. Most staff use the default; set a different one per person on their
        People → Leave tab (e.g. a 5½-day week where Saturday counts as half a day).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((s) => (
          <div key={s.id} className="card !p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">
                {s.name} {s.isDefault && <span className="badge ml-1 bg-emerald-50 text-emerald-700">Default</span>}
              </p>
              <button className="btn-secondary !py-1 text-xs" onClick={() => setDraft({ id: s.id, name: s.name, dayWeights: s.dayWeights.map(Number), isDefault: s.isDefault })}>
                Edit
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{WEEKDAYS.map((d, i) => `${d} ${Number(s.dayWeights[i]) === 1 ? '✓' : Number(s.dayWeights[i]) === 0.5 ? '½' : '–'}`).join('  ')}</p>
          </div>
        ))}
      </div>
      {!draft ? (
        <button className="btn-secondary" onClick={() => setDraft({ name: '', dayWeights: [1, 1, 1, 1, 1, 0.5, 0], isDefault: false })}>
          Add a work week
        </button>
      ) : (
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label">Name</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Monday–Saturday (half Saturday)" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Organisation default
            </label>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map((d, i) => (
              <div key={d}>
                <label className="label">{d}</label>
                <select
                  className="input !px-2"
                  value={String(draft.dayWeights[i])}
                  onChange={(e) => {
                    const w = [...draft.dayWeights];
                    w[i] = Number(e.target.value);
                    setDraft({ ...draft, dayWeights: w });
                  }}
                >
                  <option value="1">Full</option>
                  <option value="0.5">Half</option>
                  <option value="0">Off</option>
                </select>
              </div>
            ))}
          </div>
          <Err msg={error} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save}>
              Save work week
            </button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Opening balances

interface Batch {
  id: string;
  countryCode: string;
  cutoverDate: string;
  status: string;
  fileName: string | null;
  lineCount: number;
  errorCount: number;
  createdAt: string;
  postedAt: string | null;
}

function OpeningPanel({ country, call }: { country: string; call: Call }) {
  const { session } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cutover, setCutover] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ batch: Batch; lines: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    call<Batch[]>('/leave/admin/opening/batches').then(setBatches).catch(() => setBatches([]));
  }, [call]);
  useEffect(load, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const b = await apiUploadWithFields<Batch>('/leave/admin/opening/batches', session?.accessToken ?? null, file, { country, cutoverDate: cutover });
      setPreview(await call(`/leave/admin/opening/batches/${b.id}`));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload.');
    } finally {
      setBusy(false);
    }
  }
  async function act(id: string, action: 'post' | 'reverse' | 'delete') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'delete') await call(`/leave/admin/opening/batches/${id}`, { method: 'DELETE' });
      else await call(`/leave/admin/opening/batches/${id}/${action}`, { method: 'POST' });
      setPreview(action === 'post' ? await call(`/leave/admin/opening/batches/${id}`) : null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="card-head">
          <h3 className="card-title text-sm font-semibold text-ink">Bring balances forward from your previous system</h3>
          <p className="text-sm text-slate-500">
            Pick the <b>cut-over date</b> (the last day your old records are complete to), download the template — it lists every
            employee and leave type — fill in the figures as at that date, and upload it. tmPro checks every row and shows you a preview
            before anything is posted. From the cut-over onwards, tmPro accrues leave itself.
          </p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li><b>balance</b> — for annual leave: the days they had at the cut-over.</li>
          <li><b>used_this_cycle</b> — for yearly/monthly allowances (e.g. compassionate): days already used this year.</li>
          <li><b>sick_full_pay_used / sick_half_pay_used / sick_episode_start</b> — only for someone off sick at the cut-over.</li>
          <li><b>service_from</b> — optional: their original start date if it differs from tmPro&apos;s (affects service-based rules).</li>
          <li>Leave a row blank to skip it. Mistakes after posting are fixed with an adjustment, or by reversing the whole batch.</li>
        </ul>
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => apiDownload(`/leave/admin/opening/template?country=${country}`, session?.accessToken ?? null, `opening-balances-${country}.csv`)}>
            Download template
          </button>
          <div>
            <label className="label">Cut-over date</label>
            <input type="date" className="input" value={cutover} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCutover(e.target.value)} required />
          </div>
          <div>
            <label className="label">Completed CSV</label>
            <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </div>
          <button className="btn-primary" disabled={busy || !file || !cutover}>
            {busy ? 'Checking…' : 'Upload & check'}
          </button>
        </form>
        <Err msg={error} />
      </div>

      {preview && (
        <div className="card space-y-3">
          <div className="card-head flex flex-wrap items-center justify-between gap-3">
            <p className="card-title text-sm font-semibold text-ink">
              {preview.batch.fileName} · cut-over {day(preview.batch.cutoverDate)} · {preview.batch.lineCount} rows
              {preview.batch.errorCount > 0 ? <span className="ml-2 badge bg-red-50 text-red-700">{preview.batch.errorCount} with errors</span> : <span className="ml-2 badge bg-emerald-50 text-emerald-700">ready</span>}
            </p>
            {preview.batch.status === 'DRAFT' && (
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={busy} onClick={() => act(preview.batch.id, 'delete')}>
                  Discard
                </button>
                <button className="btn-primary" disabled={busy || preview.batch.errorCount > 0} onClick={() => act(preview.batch.id, 'post')}>
                  Post opening balances
                </button>
              </div>
            )}
            {preview.batch.status === 'POSTED' && <span className="badge bg-emerald-50 text-emerald-700">Posted</span>}
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Leave</th>
                  <th className="py-2 pr-3">Figures</th>
                  <th className="py-2 pr-3">Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-400">{l.rowNumber}</td>
                    <td className="py-1.5 pr-3">{l.firstName ? `${l.firstName} ${l.lastName}` : l.employeeCode ?? '—'}</td>
                    <td className="py-1.5 pr-3">{l.leaveCode}</td>
                    <td className="py-1.5 pr-3 text-xs text-slate-600">
                      {[
                        l.balance != null && `balance ${l.balance}`,
                        l.usedThisCycle != null && `used ${l.usedThisCycle}`,
                        l.sickFullUsed != null && `sick full ${l.sickFullUsed}`,
                        l.sickHalfUsed != null && `sick half ${l.sickHalfUsed}`,
                        l.serviceFrom && `service from ${day(l.serviceFrom)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{l.errors?.length ? <span className="text-red-600">{l.errors.join('; ')}</span> : <span className="text-emerald-600">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {batches.length > 0 && (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">Uploaded</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Cut-over</th>
                <th className="px-4 py-2">Rows</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2">{day(b.createdAt)}</td>
                  <td className="px-4 py-2">{b.countryCode}</td>
                  <td className="px-4 py-2">{day(b.cutoverDate)}</td>
                  <td className="px-4 py-2">
                    {b.lineCount}
                    {b.errorCount ? ` (${b.errorCount} errors)` : ''}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`badge ${b.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700' : b.status === 'REVERSED' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button className="text-xs font-medium text-brand-blue underline" onClick={async () => setPreview(await call(`/leave/admin/opening/batches/${b.id}`))}>
                      View
                    </button>
                    {b.status === 'POSTED' && (
                      <button className="ml-3 text-xs font-medium text-red-600 underline" disabled={busy} onClick={() => act(b.id, 'reverse')}>
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Processing

function ProcessingPanel({ call }: { call: Call }) {
  const [s, setS] = useState<{ dailyRateDivisor: number; sickEpisodeLinkDays: number; lastProcessedAt: string | null; engineStartedOn: string; engineVersion: string } | null>(null);
  const [divisor, setDivisor] = useState('26');
  const [link, setLink] = useState('14');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    call<NonNullable<typeof s>>('/leave/admin/settings').then((r) => {
      setS(r);
      setDivisor(String(r.dailyRateDivisor));
      setLink(String(r.sickEpisodeLinkDays));
    });
  }, [call]);
  useEffect(load, [load]);
  async function save() {
    setError(null);
    try {
      await call('/leave/admin/settings', { method: 'PATCH', body: JSON.stringify({ dailyRateDivisor: Number(divisor), sickEpisodeLinkDays: Number(link) }) });
      setMsg('Saved.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await call<{ employeesProcessed: number }>('/leave/admin/process', { method: 'POST' });
      setMsg(`Processed ${r.employeesProcessed} employees.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run processing.');
    } finally {
      setBusy(false);
    }
  }
  if (!s) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card space-y-3">
        <h3 className="card-head card-title text-sm font-semibold text-ink">Leave processing</h3>
        <p className="text-sm text-slate-500">
          tmPro posts accruals at each month end, grants and lapses allowances, applies carry-forward rules on each work anniversary and
          pays out leave when someone leaves. It runs automatically every few hours and whenever someone&apos;s leave is opened.
        </p>
        <p className="text-xs text-slate-400">
          Last run: {s.lastProcessedAt ? new Date(s.lastProcessedAt).toLocaleString() : 'not yet'} · engine {s.engineVersion} · in use since {day(s.engineStartedOn)}
        </p>
        <button className="btn-secondary" onClick={run} disabled={busy}>
          {busy ? 'Running…' : 'Run leave processing now'}
        </button>
      </div>
      <div className="card space-y-3">
        <h3 className="card-head card-title text-sm font-semibold text-ink">Calculation settings</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Leave pay: monthly basic ÷</label>
            <input type="number" min={1} max={31} step={0.01} className="input" value={divisor} onChange={(e) => setDivisor(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Daily rate for leave payouts. 26 = working days in a month (confirm against the Act&apos;s Fifth Schedule).</p>
          </div>
          <div>
            <label className="label">Sick episodes link within (days)</label>
            <input type="number" min={0} max={90} className="input" value={link} onChange={(e) => setLink(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">A new sick absence starting within this many days continues the same illness and its pay tiers.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={save}>
          Save settings
        </button>
      </div>
      {msg && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 lg:col-span-2">{msg}</p>}
      <div className="lg:col-span-2">
        <Err msg={error} />
      </div>
    </div>
  );
}
