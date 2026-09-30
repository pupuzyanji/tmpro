// v028.C — rule checks that look back over an employee's history:
//   * annual leave not taken within N months of falling due (Malawi s.44:
//     leave is to be taken within 6 months, unless both sides agree to defer);
//   * "once every N years" limits on events (Malawi maternity s.47 and
//     paternity s.47A);
//   * the yearly sick-leave pot (Malawi s.46), which is counted per service
//     year rather than per illness.

import { and, eq, gte, inArray, lt, ne, notInArray } from 'drizzle-orm';
import { leaveLedger, leaveRequestDays, leaveRequests } from '../../../db/schema';
import type { EmployeeCtx, LeaveTypeRow, PolicyRow, Tx } from './context';
import { addDays, addMonths, addYears, daysBetweenInclusive, fullMonthsBetween, ISODate, round2 } from './dates';
import { anniversaryCycle, balance } from './ledger';

export interface Overdue {
  days: number;
  /** The anniversary the overdue leave fell due on. */
  dueFrom: ISODate;
  /** The last day it should have been taken by. */
  takeBy: ISODate;
}

/**
 * Days of an accruing type that are older than the policy's
 * `payRules.useWithinMonths` and still untaken, first in first out: the
 * balance at the most recent anniversary more than N months ago, less
 * everything taken, paid out or deducted since that anniversary.
 */
export async function overdueLeave(tx: Tx, emp: EmployeeCtx, type: LeaveTypeRow, policy: PolicyRow, asOf: ISODate): Promise<Overdue | null> {
  const months = Number(policy.payRules?.useWithinMonths ?? 0);
  if (!months || type.kind !== 'ACCRUING') return null;
  let due = anniversaryCycle(emp.serviceStart, asOf).start;
  while (addMonths(due, months) > asOf) due = addYears(due, -1);
  if (due <= emp.serviceStart) return null;

  const before = await balance(tx, emp.tenantId, emp.id, type.id, addDays(due, -1));
  if (before <= 0) return null;
  const since = await tx
    .select({ entryType: leaveLedger.entryType, units: leaveLedger.units })
    .from(leaveLedger)
    .where(
      and(
        eq(leaveLedger.tenantId, emp.tenantId),
        eq(leaveLedger.employeeId, emp.id),
        eq(leaveLedger.leaveTypeId, type.id),
        gte(leaveLedger.effectiveDate, due),
        notInArray(leaveLedger.entryType, ['ACCRUAL', 'ALLOTMENT', 'OPENING_BALANCE', 'CARRY_FORWARD']),
      ),
    );
  const consumed = Math.max(0, -since.reduce((s, r) => s + Number(r.units), 0));
  const days = round2(before - consumed);
  if (days <= 0) return null;
  return { days, dueFrom: due, takeBy: addDays(addMonths(due, months), -1) };
}

/** The most recent other request of this event type starting within
 *  `years` years of `start` (either side), or null. */
export async function recentEvent(
  tx: Tx,
  emp: EmployeeCtx,
  type: LeaveTypeRow,
  start: ISODate,
  years: number,
  excludeRequestId?: string | null,
): Promise<{ start: ISODate; nextFrom: ISODate } | null> {
  const rows = await tx
    .select({ id: leaveRequests.id, startDate: leaveRequests.startDate })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.tenantId, emp.tenantId),
        eq(leaveRequests.employeeId, emp.id),
        eq(leaveRequests.leaveTypeId, type.id),
        inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
        ...(excludeRequestId ? [ne(leaveRequests.id, excludeRequestId)] : []),
      ),
    );
  const lo = addYears(start, -years);
  const hi = addYears(start, years);
  const hits = rows
    .map((r) => r.startDate.toISOString().slice(0, 10))
    .filter((d) => d > lo && d < hi && d !== start)
    .sort();
  const prior = hits.filter((d) => d < start).at(-1) ?? hits[0];
  if (!prior) return null;
  return { start: prior, nextFrom: addYears(prior, years) };
}

/** Full- and half-pay sick units already used (approved or pending) in the
 *  service year that begins on `yearStart`. */
export async function sickUsedInYear(
  tx: Tx,
  emp: EmployeeCtx,
  type: LeaveTypeRow,
  yearStart: ISODate,
  excludeRequestId?: string | null,
  cycleEnd?: ISODate,
) {
  const yearEnd = cycleEnd ?? anniversaryCycle(emp.serviceStart, yearStart).end;
  const rows = await tx
    .select({ units: leaveRequestDays.units, payFactor: leaveRequestDays.payFactor })
    .from(leaveRequestDays)
    .innerJoin(leaveRequests, eq(leaveRequests.id, leaveRequestDays.requestId))
    .where(
      and(
        eq(leaveRequestDays.tenantId, emp.tenantId),
        eq(leaveRequestDays.employeeId, emp.id),
        eq(leaveRequests.leaveTypeId, type.id),
        inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
        gte(leaveRequestDays.day, yearStart),
        lt(leaveRequestDays.day, yearEnd),
        ...(excludeRequestId ? [ne(leaveRequests.id, excludeRequestId)] : []),
      ),
    );
  let full = 0;
  let half = 0;
  for (const r of rows) {
    if (Number(r.payFactor) >= 1) full += Number(r.units);
    else if (Number(r.payFactor) > 0) half += Number(r.units);
  }
  // Sick days brought forward by an opening-balance batch (and any reversal
  // of it) count towards the service year they were posted in.
  const opening = await tx
    .select({ units: leaveLedger.units, payTier: leaveLedger.payTier })
    .from(leaveLedger)
    .where(
      and(
        eq(leaveLedger.tenantId, emp.tenantId),
        eq(leaveLedger.employeeId, emp.id),
        eq(leaveLedger.leaveTypeId, type.id),
        eq(leaveLedger.sourceType, 'OPENING_BATCH'),
        gte(leaveLedger.effectiveDate, yearStart),
        lt(leaveLedger.effectiveDate, yearEnd),
      ),
    );
  for (const o of opening) {
    if (o.payTier === 'FULL') full -= Number(o.units);
    else if (o.payTier === 'HALF') half -= Number(o.units);
  }
  return { full: round2(Math.max(0, full)), half: round2(Math.max(0, half)), yearEnd };
}

/** A sick-leave pot per service cycle (`payRules.mode = "YEARLY"`):
 *  Malawi s.46 (1 year, 4 + 8 weeks, after 12 months), South Africa s.22
 *  (3 years, 6 weeks, 1 day per 26 worked in the first 6 months), Zimbabwe
 *  s.14 (1 year, 90 + 90 days). Full/half caps are given in weeks (× the
 *  person's working days a week) or directly in days. */
export interface YearlySickRule {
  fullWeeks: number;
  halfWeeks: number;
  fullDays: number | null;
  halfDays: number | null;
  cycleYears: number;
  minServiceMonths: number;
  earlyMonths: number;
  earlyDivisor: number;
  section: string | null;
}

export function yearlySickRule(policy: PolicyRow): YearlySickRule | null {
  const pr = policy.payRules ?? {};
  if (pr.mode !== 'YEARLY') return null;
  return {
    fullWeeks: Number(pr.fullWeeks ?? 0),
    halfWeeks: Number(pr.halfWeeks ?? 0),
    fullDays: pr.fullDays != null ? Number(pr.fullDays) : null,
    halfDays: pr.halfDays != null ? Number(pr.halfDays) : null,
    cycleYears: Math.max(1, Number(pr.cycleYears ?? 1)),
    minServiceMonths: Number(pr.minServiceMonths ?? 0),
    earlyMonths: Number(pr.earlyMonths ?? 0),
    earlyDivisor: Number(pr.earlyDivisor ?? 26),
    section: pr.section ? String(pr.section) : null,
  };
}

export function sickCaps(rule: YearlySickRule, dpw: number) {
  return {
    full: rule.fullDays ?? round2(rule.fullWeeks * dpw),
    half: rule.halfDays ?? round2(rule.halfWeeks * dpw),
  };
}

/** The sick-leave cycle containing `date`: N-year blocks from the service start. */
export function sickCycle(serviceStart: ISODate, date: ISODate, years: number): { start: ISODate; end: ISODate } {
  const served = Math.floor(fullMonthsBetween(serviceStart, date) / 12);
  const start = addYears(serviceStart, Math.floor(served / years) * years);
  return { start, end: addYears(start, years) };
}

/** Full-pay sick days earned so far in an early period (SA s.22(3): one day
 *  for every 26 days worked in the first 6 months), approximated from
 *  calendar time and the person's working week. */
export function earlyEarned(rule: YearlySickRule, serviceStart: ISODate, day: ISODate, dpw: number): number {
  const elapsed = daysBetweenInclusive(serviceStart, day);
  return Math.floor((elapsed * dpw) / 7 / (rule.earlyDivisor || 26));
}
