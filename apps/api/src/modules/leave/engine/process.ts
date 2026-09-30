// v028.A — periodic leave processing for one employee, up to a date.
//
// Idempotent: every posting carries an idem_key, so running this twice (or
// concurrently) never double-accrues. Called lazily whenever an employee's
// leave is read, on API start-up, every few hours, and from Settings →
// Leave → "Run leave processing now".
//
//  ACCRUING  (annual)      — monthly accrual at each month end, pro-rated for
//                            the first/last month; cycle-end excess handling
//                            at each employment anniversary; payout of the
//                            remaining balance on termination.
//  ALLOWANCE (compassionate, family, Mother's Day) — full allotment at the
//                            start of each calendar year/month (or when the
//                            employee becomes eligible); unused remainder
//                            expires when the cycle ends.
//  EVENT / EPISODE / UNTRACKED — nothing periodic; handled per request.

import { and, desc, eq, isNull } from 'drizzle-orm';
import { leaveLedger, payrollAdjustments } from '../../../db/schema';
import {
  currentPolicy,
  dailyPayRate,
  eligibleForCategory,
  entitlementFor,
  workWeekAllowed,
  EmployeeCtx,
  genderAllowed,
  LeaveTypeRow,
  loadSettings,
  policiesFor,
  policyOn,
  PolicyRow,
  TenantLeaveSettings,
  Tx,
  typesForRegime,
} from './context';
import {
  addDays,
  addMonths,
  addYears,
  daysBetweenInclusive,
  daysInMonth,
  ISODate,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  parseISO,
  round2,
  yearEnd,
  yearStart,
} from './dates';
import { anniversaryCycle, balance, cycleBalance, existingKeys, post, reversedIds } from './ledger';

/** Date from which the engine may post accruals for this type: the service
 *  start, or the day after the latest (un-reversed) opening balance. */
async function accrualFloor(tx: Tx, emp: EmployeeCtx, typeId: string): Promise<ISODate> {
  const openings = await tx
    .select({ id: leaveLedger.id, effectiveDate: leaveLedger.effectiveDate })
    .from(leaveLedger)
    .where(
      and(
        eq(leaveLedger.tenantId, emp.tenantId),
        eq(leaveLedger.employeeId, emp.id),
        eq(leaveLedger.leaveTypeId, typeId),
        eq(leaveLedger.entryType, 'OPENING_BALANCE'),
        isNull(leaveLedger.reversesId),
      ),
    )
    .orderBy(desc(leaveLedger.effectiveDate));
  const reversed = await reversedIds(tx, openings.map((o) => o.id));
  const live = openings.find((o) => !reversed.has(o.id));
  return live ? maxDate(emp.serviceStart, addDays(live.effectiveDate, 1)) : emp.serviceStart;
}

async function processAccruing(
  tx: Tx,
  emp: EmployeeCtx,
  type: LeaveTypeRow,
  versions: PolicyRow[],
  asOf: ISODate,
  settings: TenantLeaveSettings,
) {
  const keys = await existingKeys(tx, emp.tenantId, emp.id, type.id);
  const floor = await accrualFloor(tx, emp, type.id);
  const endLimit = emp.lastDay ? minDate(emp.lastDay, asOf) : asOf;
  const cur = currentPolicy(versions, asOf);
  if (!cur || !eligibleForCategory(cur, emp) || !workWeekAllowed(cur, emp)) return;

  // Monthly accrual, credited at each month end (or on the last day worked).
  for (let m = monthStart(floor); m <= endLimit; m = addMonths(m, 1)) {
    const mEnd = monthEnd(m);
    const periodStart = maxDate(m, floor);
    const periodEnd = emp.lastDay && emp.lastDay < mEnd ? emp.lastDay : mEnd;
    if (periodEnd < periodStart || periodEnd > asOf) continue;
    const key = `ACC:${type.id}:${emp.id}:${m.slice(0, 7)}`;
    if (keys.has(key)) continue;
    const policy = policyOn(versions, periodEnd);
    const yearly = policy ? entitlementFor(policy, emp) : 0;
    if (!policy || policy.accrualFrequency !== 'MONTHLY' || yearly <= 0) continue;
    const monthDays = daysInMonth(parseISO(m).getUTCFullYear(), parseISO(m).getUTCMonth());
    const fraction = policy.proratePartial ? daysBetweenInclusive(periodStart, periodEnd) / monthDays : 1;
    let units = round2((yearly / 12) * fraction);
    // v028.E — a ceiling on the balance (Zimbabwe s.14A: vacation leave
    // stops accruing at 90 days until some is taken).
    let capNote: string | null = null;
    if (policy.payRules?.maxBalance != null) {
      const ceiling = Number(policy.payRules.maxBalance);
      const before = await balance(tx, emp.tenantId, emp.id, type.id, periodEnd);
      if (before + units > ceiling) {
        units = round2(Math.max(0, ceiling - before));
        capNote = `Balance at the ${ceiling}-day maximum — accrual paused until leave is taken`;
      }
    }
    if (units <= 0 && !capNote) continue;
    await post(tx, {
      tenantId: emp.tenantId,
      employeeId: emp.id,
      leaveTypeId: type.id,
      policyId: policy.id,
      entryType: 'ACCRUAL',
      units,
      effectiveDate: periodEnd,
      cycleKey: anniversaryCycle(emp.serviceStart, periodEnd).key,
      sourceType: 'ENGINE',
      idemKey: key,
      note: capNote ?? (fraction < 1 ? `Pro-rated ${daysBetweenInclusive(periodStart, periodEnd)}/${monthDays} days` : null),
    });
  }

  // Up-front yearly grant (types configured that way instead of monthly).
  // v028.D: `payRules.firstGrantAfterMonths` delays the first grant (NZ
  // annual holidays after 12 months, sick and family violence leave after
  // 6), with later grants every 12 months from then; `payRules.maxBalance`
  // tops the balance up to a ceiling instead of adding the full amount (NZ
  // sick leave may accumulate to 20 days; family violence leave doesn't
  // accumulate, so its ceiling is the yearly 10).
  for (const a of upfrontGrantDates(emp, cur, endLimit)) {
    const policy = policyOn(versions, a);
    if (!policy || policy.accrualFrequency !== 'UPFRONT' || a < floor) continue;
    const key = `ACCUP:${type.id}:${emp.id}:${a}`;
    if (keys.has(key)) continue;
    let units = entitlementFor(policy, emp);
    let note: string | null = null;
    const ceiling = policy.payRules?.maxBalance != null ? Number(policy.payRules.maxBalance) : null;
    if (ceiling != null) {
      const before = await balance(tx, emp.tenantId, emp.id, type.id, addDays(a, -1));
      const room = round2(Math.max(0, ceiling - before));
      if (room < units) {
        note = `Topped up to the ${ceiling}-day maximum (${before} already held)`;
        units = room;
      }
    }
    await post(tx, {
      tenantId: emp.tenantId,
      employeeId: emp.id,
      leaveTypeId: type.id,
      policyId: policy.id,
      entryType: 'ALLOTMENT',
      units,
      effectiveDate: a,
      cycleKey: `A${a}`,
      sourceType: 'ENGINE',
      idemKey: key,
      note,
    });
  }

  // Cycle end: at each anniversary, apply the carry-forward cap — but only
  // under a policy version that was already in force (never retroactively).
  for (let a = addYears(emp.serviceStart, 1); a <= endLimit; a = addYears(a, 1)) {
    const policy = policyOn(versions, a);
    if (!policy || policy.carryForwardMax == null || policy.excessAction === 'CARRY_ALL' || a < policy.effectiveFrom) continue;
    const key = `CYC:${type.id}:${emp.id}:${a}`;
    if (keys.has(key)) continue;
    const bal = await balance(tx, emp.tenantId, emp.id, type.id, addDays(a, -1));
    const excess = round2(bal - policy.carryForwardMax);
    if (excess <= 0) {
      await post(tx, {
        tenantId: emp.tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: policy.id,
        entryType: 'CARRY_FORWARD', units: 0, effectiveDate: addDays(a, -1),
        cycleKey: anniversaryCycle(emp.serviceStart, addDays(a, -1)).key, sourceType: 'ENGINE', idemKey: key,
        note: `Carried forward ${bal} days (within the ${policy.carryForwardMax}-day cap)`,
      });
      continue;
    }
    const isPayout = policy.excessAction === 'PAYOUT' || !policy.belowStatutoryOk;
    const adjId = isPayout ? await createPayout(tx, emp, excess, `Leave encashment — ${excess} days of ${type.name} above the carry-forward cap`, a, settings) : null;
    await post(tx, {
      tenantId: emp.tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: policy.id,
      entryType: isPayout ? 'PAYOUT' : 'FORFEIT', units: -excess, effectiveDate: addDays(a, -1),
      cycleKey: anniversaryCycle(emp.serviceStart, addDays(a, -1)).key, sourceType: 'ENGINE', idemKey: key,
      payrollAdjustmentId: adjId,
      note: isPayout
        ? `${excess} days above the ${policy.carryForwardMax}-day carry-forward cap paid out`
        : `${excess} days above the ${policy.carryForwardMax}-day cap forfeited (exemption: ${policy.exemptionReason})`,
    });
  }

  // Termination: pay out whatever is left.
  if (emp.leftOn && emp.lastDay && emp.leftOn <= asOf) {
    const key = `TERM:${type.id}:${emp.id}:${emp.leftOn}`;
    const payoutRule = (cur.payRules?.payoutOnTermination ?? true) as boolean;
    if (!keys.has(key) && payoutRule) {
      const bal = await balance(tx, emp.tenantId, emp.id, type.id);
      if (bal > 0) {
        const historic = emp.leftOn < settings.engineStartedOn;
        const adjId = historic ? null : await createPayout(tx, emp, bal, `Leave pay on termination — ${bal} days of ${type.name}`, emp.lastDay, settings);
        await post(tx, {
          tenantId: emp.tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: cur.id,
          entryType: 'PAYOUT', units: -bal, effectiveDate: emp.lastDay,
          cycleKey: anniversaryCycle(emp.serviceStart, emp.lastDay).key, sourceType: 'TERMINATION', idemKey: key,
          payrollAdjustmentId: adjId,
          note: historic
            ? 'Left before tmPro’s leave engine was switched on — settled outside tmPro'
            : 'Accumulated leave paid on termination; added to the next pay run',
        });
      }
    }
  }
}

/** Dates of the up-front grants for an UPFRONT type, up to `until`. */
export function upfrontGrantDates(emp: EmployeeCtx, policy: PolicyRow, until: ISODate): ISODate[] {
  const first = Number(policy.payRules?.firstGrantAfterMonths ?? 0);
  const out: ISODate[] = [];
  for (let a = addMonths(emp.serviceStart, first); a <= until; a = addYears(a, 1)) out.push(a);
  return out;
}

/** The next up-front grant after `after`, for display. */
export function nextUpfrontGrant(emp: EmployeeCtx, policy: PolicyRow, after: ISODate): ISODate {
  const first = Number(policy.payRules?.firstGrantAfterMonths ?? 0);
  let a = addMonths(emp.serviceStart, first);
  while (a <= after) a = addYears(a, 1);
  return a;
}

async function createPayout(tx: Tx, emp: EmployeeCtx, days: number, label: string, asOf: ISODate, settings: TenantLeaveSettings) {
  const rate = await dailyPayRate(tx, emp.tenantId, emp, asOf, settings.dailyRateDivisor);
  const amount = round2(rate * days);
  if (amount <= 0) return null;
  const [adj] = await tx
    .insert(payrollAdjustments)
    .values({ tenantId: emp.tenantId, employeeId: emp.id, type: 'ADDITION', label: label.slice(0, 160), amount, occurrences: 1, taxable: true })
    .returning({ id: payrollAdjustments.id });
  return adj?.id ?? null;
}

interface Cycle {
  key: string;
  start: ISODate;
  end: ISODate;
}

function cyclesBetween(cycle: string, emp: EmployeeCtx, from: ISODate, to: ISODate): Cycle[] {
  const out: Cycle[] = [];
  if (cycle === 'CALENDAR_YEAR') {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      out.push({ key: `Y${y}`, start: `${y}-01-01`, end: `${y}-12-31` });
    }
  } else if (cycle === 'CALENDAR_MONTH') {
    for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push({ key: `M${m.slice(0, 7)}`, start: m, end: monthEnd(m) });
  } else if (cycle === 'EMPLOYMENT_ANNIVERSARY') {
    let c = anniversaryCycle(emp.serviceStart, from);
    while (c.start <= to) {
      out.push({ key: c.key, start: c.start, end: addDays(c.end, -1) });
      c = anniversaryCycle(emp.serviceStart, c.end);
    }
  }
  return out;
}

async function processAllowance(tx: Tx, emp: EmployeeCtx, type: LeaveTypeRow, versions: PolicyRow[], asOf: ISODate) {
  const cur = currentPolicy(versions, asOf);
  if (!cur || !genderAllowed(type, emp) || !eligibleForCategory(cur, emp) || !workWeekAllowed(cur, emp)) return;
  const keys = await existingKeys(tx, emp.tenantId, emp.id, type.id);
  const eligibleFrom = addMonths(emp.serviceStart, cur.minServiceMonths);
  // Only the previous and current calendar year matter for allowances —
  // anything older has already lapsed.
  const windowStart = maxDate(eligibleFrom, yearStart(addYears(asOf, -1)));
  const endLimit = emp.lastDay ? minDate(emp.lastDay, asOf) : asOf;
  if (windowStart > endLimit) return;

  for (const c of cyclesBetween(cur.cycle, emp, windowStart, endLimit)) {
    const policy = policyOn(versions, c.start) ?? cur;
    const allotDate = maxDate(c.start, eligibleFrom);
    if (allotDate > endLimit || allotDate > c.end) continue;
    const allotKey = `ALLOT:${type.id}:${emp.id}:${c.key}`;
    const allowance = entitlementFor(policy, emp);
    if (!keys.has(allotKey) && allowance > 0) {
      let units = allowance;
      if (policy.proratePartial && allotDate > c.start) {
        units = round2(units * (daysBetweenInclusive(allotDate, c.end) / daysBetweenInclusive(c.start, c.end)));
      }
      await post(tx, {
        tenantId: emp.tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: policy.id,
        entryType: 'ALLOTMENT', units, effectiveDate: allotDate, cycleKey: c.key, sourceType: 'ENGINE', idemKey: allotKey,
      });
    }
    // Lapse the unused remainder once the cycle is over.
    if (c.end < asOf) {
      const expKey = `EXP:${type.id}:${emp.id}:${c.key}`;
      if (keys.has(expKey)) continue;
      const { remaining } = await cycleBalance(tx, emp.tenantId, emp.id, type.id, c.key);
      if (remaining > 0) {
        await post(tx, {
          tenantId: emp.tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: policy.id,
          entryType: 'EXPIRY', units: -remaining, effectiveDate: c.end, cycleKey: c.key, sourceType: 'ENGINE', idemKey: expKey,
          note: 'Unused allowance lapsed at the end of the period (does not carry over)',
        });
      }
    }
  }
}

export async function processEmployee(tx: Tx, emp: EmployeeCtx, asOf: ISODate, settings?: TenantLeaveSettings) {
  const s = settings ?? (await loadSettings(tx, emp.tenantId));
  const types = await typesForRegime(tx, emp.tenantId, emp.regime);
  const policies = await policiesFor(tx, emp.tenantId, types.map((t) => t.id));
  for (const type of types) {
    const versions = policies.get(type.id) ?? [];
    if (versions.length === 0) continue;
    if (type.kind === 'ACCRUING') await processAccruing(tx, emp, type, versions, asOf, s);
    else if (type.kind === 'ALLOWANCE') await processAllowance(tx, emp, type, versions, asOf);
  }
}

// re-exported for callers that only need the cycle helpers
export { cyclesBetween };
