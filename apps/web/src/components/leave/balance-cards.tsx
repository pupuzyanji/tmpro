'use client';

import { day, LeaveTypeOverview, periodLabel, units } from '@/lib/leave';

/** v028.A — one compact card per leave type the person can take. */
export function BalanceCards({ types }: { types: LeaveTypeOverview[] }) {
  const shown = types.filter((t) => t.eligible && t.kind !== 'UNTRACKED');
  if (shown.length === 0) return <p className="text-sm text-slate-500">No leave entitlements apply yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((t) => (
        <BalanceCard key={t.leaveTypeId} t={t} />
      ))}
    </div>
  );
}

function Big({ value, suffix }: { value: string | number; suffix?: string }) {
  return (
    <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
      {value}
      {suffix && <span className="ml-1 text-sm font-medium text-slate-400">{suffix}</span>}
    </p>
  );
}

function BalanceCard({ t }: { t: LeaveTypeOverview }) {
  let body: React.ReactNode = null;
  if (t.kind === 'ACCRUING') {
    body = (
      <>
        <Big value={t.available ?? 0} suffix="days available" />
        <p className="text-xs text-slate-500">
          Balance {t.balance}
          {t.pending ? ` · ${t.pending} pending` : ''}
          {t.nextAccrual
            ? t.nextAccrual.units > 0
              ? ` · +${t.nextAccrual.units} on ${day(t.nextAccrual.date)}`
              : ` · at the maximum (next top-up ${day(t.nextAccrual.date)})`
            : ''}
        </p>
        {t.overdue && (
          <p className="mt-1 text-xs font-medium text-amber-700">
            {t.overdue.days} days overdue — should have been taken by {day(t.overdue.takeBy)}
          </p>
        )}
      </>
    );
  } else if (t.kind === 'ALLOWANCE') {
    const per = t.cycle === 'CALENDAR_MONTH' ? 'this month' : `in ${periodLabel(t.period)}`;
    body = (
      <>
        <Big value={t.available ?? 0} suffix={`of ${t.allotted || t.entitlement} left ${per}`} />
        <p className="text-xs text-slate-500">
          {t.used ? `${t.used} used` : 'None used'}
          {t.pending ? ` · ${t.pending} pending` : ''} · unused days lapse
        </p>
      </>
    );
  } else if (t.kind === 'EVENT') {
    body = (
      <>
        <Big
          value={t.entitlement}
          suffix={`${t.unitBasis === 'CALENDAR_DAYS' ? 'calendar days' : t.entitlement === 1 ? 'day' : 'days'} per ${/birth|delivery|placement/i.test(String(t.eventRules?.eventLabel ?? 'birth')) ? 'birth' : 'occasion'}`}
        />
        <p className="text-xs text-slate-500">
          {t.eventRules?.multipleBirthExtraDays ? `+${t.eventRules.multipleBirthExtraDays} for a multiple birth · ` : ''}
          {t.eventRules?.windowDaysAfterEvent != null ? `take within ${t.eventRules.windowDaysAfterEvent} days of the birth` : 'request when needed'}
          {t.eventRules?.recurrenceYears ? ` · paid once every ${t.eventRules.recurrenceYears} years` : ''}
          {!t.isPaid ? ' · unpaid by the employer' : ''}
        </p>
      </>
    );
  } else if (t.kind === 'EPISODE' && t.sickYear) {
    const y = t.sickYear;
    const beforePay = new Date().toISOString().slice(0, 10) < y.payFrom;
    body = beforePay ? (
      <>
        <p className="mt-1 text-sm font-semibold text-ink">Unpaid until {day(y.payFrom)}</p>
        <p className="text-xs text-slate-500">
          Sick pay starts {day(y.payFrom)}: then {y.fullDays} days full pay{y.halfDays ? ` and ${y.halfDays} half pay` : ''} each year
        </p>
      </>
    ) : (
      <>
        <Big value={Math.max(0, Math.round((y.fullDays - y.fullUsed) * 100) / 100)} suffix={`of ${y.fullDays} full-pay days left`} />
        <p className="text-xs text-slate-500">
          {y.halfDays ? `then ${Math.max(0, Math.round((y.halfDays - y.halfUsed) * 100) / 100)} of ${y.halfDays} half-pay days · ` : ''}
          {(y.cycleYears ?? 1) > 1 ? `${y.cycleYears}-year cycle to ${day(y.yearEnd)}` : `year to ${day(y.yearEnd)}`}
          {y.earlyUntil && new Date().toISOString().slice(0, 10) < y.earlyUntil ? ` · until ${day(y.earlyUntil)}, 1 paid day per 26 worked` : ''}
          {' · medical certificate may be needed'}
        </p>
      </>
    );
  } else if (t.kind === 'EPISODE') {
    const tiers = t.tiers ?? {};
    const rule =
      t.contractTerm === 'SHORT'
        ? `${tiers.fullDays ?? 26} days full pay, then ${tiers.halfDays ?? 26} half pay`
        : `${tiers.fullMonths ?? 3} months full pay, then ${tiers.halfMonths ?? 3} half pay`;
    body = (
      <>
        <p className="mt-1 text-sm font-semibold text-ink">{rule}</p>
        <p className="text-xs text-slate-500">
          {t.episode
            ? `Current illness since ${day(t.episode.startedOn)} · ${t.episode.fullUsed} full-pay${t.episode.halfUsed ? `, ${t.episode.halfUsed} half-pay` : ''} days used`
            : 'Per illness · medical certificate needed'}
        </p>
      </>
    );
  }
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{t.name}</p>
        {t.availableFrom && <span className="badge bg-amber-50 text-amber-700">from {day(t.availableFrom)}</span>}
      </div>
      {body}
    </div>
  );
}

/** v029.B — the same balances as a compact "Leave entitlements" side panel:
 *  one row per leave type, the headline figure on the right. */
export function EntitlementsPanel({ types, title = 'Leave entitlements', className = '' }: { types: LeaveTypeOverview[]; title?: string; className?: string }) {
  const shown = types.filter((t) => t.eligible && t.kind !== 'UNTRACKED');
  return (
    <aside className={`card ${className}`}>
      <div className="card-head">
        <h3 className="card-title text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">No leave entitlements apply yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((t) => {
            const s = summarise(t);
            return (
              <li key={t.leaveTypeId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{t.name}</p>
                  {s.detail && <p className="mt-0.5 text-xs text-slate-400">{s.detail}</p>}
                  {t.availableFrom && <span className="badge mt-1 bg-amber-50 text-amber-700">from {day(t.availableFrom)}</span>}
                  {s.warn && <p className="mt-1 text-xs font-medium text-amber-700">{s.warn}</p>}
                </div>
                <p className="shrink-0 text-right">
                  <span className={`font-bold tabular-nums text-ink ${typeof s.value === 'number' ? 'text-lg' : 'text-sm'}`}>{s.value}</span>
                  {s.unit && <span className="ml-0.5 text-xs text-slate-400">{s.unit}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function r2(n: number) {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** The headline figure and one line of detail for a leave type. */
function summarise(t: LeaveTypeOverview): { value: string | number; unit?: string; detail?: string; warn?: string } {
  const d = t.unitBasis === 'CALENDAR_DAYS' ? 'cd' : 'd';
  if (t.kind === 'ACCRUING') {
    const parts = [t.pending ? `${t.pending} pending` : '', t.nextAccrual ? (t.nextAccrual.units > 0 ? `+${t.nextAccrual.units} on ${day(t.nextAccrual.date)}` : 'at the maximum') : ''].filter(Boolean);
    return {
      value: t.available ?? 0,
      unit: d,
      detail: parts.join(' · ') || undefined,
      warn: t.overdue ? `${t.overdue.days} overdue — take by ${day(t.overdue.takeBy)}` : undefined,
    };
  }
  if (t.kind === 'ALLOWANCE') {
    const per = t.cycle === 'CALENDAR_MONTH' ? 'this month' : `in ${periodLabel(t.period)}`;
    return { value: t.available ?? 0, unit: d, detail: `of ${t.allotted || t.entitlement} ${per}${t.pending ? ` · ${t.pending} pending` : ''}` };
  }
  if (t.kind === 'EVENT') {
    const per = /birth|delivery|placement/i.test(String(t.eventRules?.eventLabel ?? 'birth')) ? 'per birth' : 'per occasion';
    const extra = t.eventRules?.recurrenceYears ? ` · once every ${t.eventRules.recurrenceYears} years` : '';
    return { value: t.entitlement, unit: d, detail: `${per}${extra}${!t.isPaid ? ' · unpaid' : ''}` };
  }
  if (t.kind === 'EPISODE' && t.sickYear) {
    const y = t.sickYear;
    if (new Date().toISOString().slice(0, 10) < y.payFrom) return { value: 'Unpaid', detail: `sick pay from ${day(y.payFrom)}` };
    return {
      value: r2(y.fullDays - y.fullUsed),
      unit: d,
      detail: `of ${y.fullDays} full pay${y.halfDays ? `, then ${r2(y.halfDays - y.halfUsed)} half pay` : ''} · to ${day(y.yearEnd)}`,
    };
  }
  if (t.kind === 'EPISODE') {
    const tiers = t.tiers ?? {};
    if (t.contractTerm === 'SHORT') return { value: tiers.fullDays ?? 26, unit: d, detail: `full pay per illness, then ${tiers.halfDays ?? 26} half pay` };
    return { value: `${tiers.fullMonths ?? 3} + ${tiers.halfMonths ?? 3}`, unit: 'mo', detail: 'full + half pay per illness' };
  }
  return { value: '—' };
}

export function fmtUnits(n: number, basis?: string) {
  return units(n, basis);
}
