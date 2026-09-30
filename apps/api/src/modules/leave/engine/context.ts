// v028.A — everything the leave rules need to know about one employee, and
// the tenant's leave types/policies for their country ("regime").

import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema';
import {
  employeeCompensationHistory,
  employeeStatusHistory,
  employees,
  leavePolicies,
  leaveSettings,
  leaveTypes,
  workSchedules,
} from '../../../db/schema';
import { addDays, asISO, fullMonthsBetween, ISODate } from './dates';

export type Tx = NodePgDatabase<typeof schema>;
export type LeaveTypeRow = typeof leaveTypes.$inferSelect;
export type PolicyRow = typeof leavePolicies.$inferSelect;
export type Kind = 'ACCRUING' | 'ALLOWANCE' | 'EVENT' | 'EPISODE' | 'UNTRACKED';

export const DEFAULT_WEEK = [1, 1, 1, 1, 1, 0, 0];

export interface EmployeeCtx {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  countryCode: string;
  regime: string; // country code whose leave types apply ('OTHER' fallback)
  gender: string | null;
  managerId: string | null;
  category: string; // PERMANENT | FIXED_TERM | TEMPORARY | CASUAL
  contractTerm: 'SHORT' | 'LONG';
  serviceStart: ISODate;
  /** First day no longer employed (ALUMNI effective date), if already in effect. */
  leftOn: ISODate | null;
  lastDay: ISODate | null;
  weekWeights: number[]; // Mon..Sun
  hoursPerDay: number;
  scheduleName: string;
}

export interface TenantLeaveSettings {
  dailyRateDivisor: number;
  sickEpisodeLinkDays: number;
  engineStartedOn: ISODate;
}

export async function loadSettings(tx: Tx, tenantId: string): Promise<TenantLeaveSettings> {
  const [row] = await tx.select().from(leaveSettings).where(eq(leaveSettings.tenantId, tenantId)).limit(1);
  return {
    dailyRateDivisor: row?.dailyRateDivisor ?? 26,
    sickEpisodeLinkDays: row?.sickEpisodeLinkDays ?? 14,
    engineStartedOn: row?.engineStartedOn ?? asISO(new Date())!,
  };
}

/** Which leave regime an employee draws on: their own country if the tenant
 *  has leave types for it, otherwise the tenant's 'OTHER' regime. */
export async function regimeFor(tx: Tx, tenantId: string, countryCode: string): Promise<string> {
  const [row] = await tx
    .select({ id: leaveTypes.id })
    .from(leaveTypes)
    .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode), eq(leaveTypes.isActive, true)))
    .limit(1);
  return row ? countryCode : 'OTHER';
}

export async function loadEmployeeCtx(tx: Tx, tenantId: string, employeeId: string, asOf: ISODate): Promise<EmployeeCtx | null> {
  const [emp] = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
    .limit(1);
  if (!emp) return null;

  const statusRows = await tx
    .select({ status: employeeStatusHistory.status, effectiveDate: employeeStatusHistory.effectiveDate })
    .from(employeeStatusHistory)
    .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
    .orderBy(asc(employeeStatusHistory.effectiveDate));

  const earliestStatus = statusRows[0] ? asISO(statusRows[0].effectiveDate) : null;
  const serviceStart = emp.continuousServiceFrom ?? earliestStatus ?? asISO(emp.startDate)!;

  let leftOn: ISODate | null = null;
  const effective = statusRows.filter((r) => asISO(r.effectiveDate)! <= asOf);
  const latest = effective.at(-1);
  if (latest?.status === 'ALUMNI') leftOn = asISO(latest.effectiveDate);
  else if (statusRows.length === 0 && emp.status === 'ALUMNI') leftOn = asISO(emp.startDate); // legacy record, no history

  let weekWeights = DEFAULT_WEEK;
  let hoursPerDay = 8;
  let scheduleName = 'Monday–Friday';
  const [schedule] = emp.workScheduleId
    ? await tx.select().from(workSchedules).where(and(eq(workSchedules.tenantId, tenantId), eq(workSchedules.id, emp.workScheduleId))).limit(1)
    : await tx.select().from(workSchedules).where(and(eq(workSchedules.tenantId, tenantId), eq(workSchedules.isDefault, true))).limit(1);
  if (schedule) {
    weekWeights = schedule.dayWeights.map(Number);
    hoursPerDay = Number(schedule.hoursPerDay);
    scheduleName = schedule.name;
  }

  const category = emp.employmentCategory ?? (emp.employmentType === 'CONTRACT' ? 'FIXED_TERM' : 'PERMANENT');
  let contractTerm: 'SHORT' | 'LONG' = 'LONG';
  if (emp.contractTerm === 'SHORT' || emp.contractTerm === 'LONG') contractTerm = emp.contractTerm;
  else if (emp.contractEndDate && category !== 'PERMANENT' && fullMonthsBetween(serviceStart, emp.contractEndDate) < 12) contractTerm = 'SHORT';

  return {
    id: emp.id,
    tenantId,
    name: `${emp.firstName} ${emp.lastName}`,
    email: emp.email,
    countryCode: emp.countryCode,
    regime: await regimeFor(tx, tenantId, emp.countryCode),
    gender: emp.gender,
    managerId: emp.managerId,
    category,
    contractTerm,
    serviceStart,
    leftOn,
    lastDay: leftOn ? addDays(leftOn, -1) : null,
    weekWeights,
    hoursPerDay,
    scheduleName,
  };
}

export async function typesForRegime(tx: Tx, tenantId: string, regime: string): Promise<LeaveTypeRow[]> {
  return tx
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, regime), eq(leaveTypes.isActive, true)))
    .orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.name));
}

export async function policiesFor(tx: Tx, tenantId: string, typeIds: string[]): Promise<Map<string, PolicyRow[]>> {
  const map = new Map<string, PolicyRow[]>();
  if (typeIds.length === 0) return map;
  const rows = await tx
    .select()
    .from(leavePolicies)
    .where(and(eq(leavePolicies.tenantId, tenantId), inArray(leavePolicies.leaveTypeId, typeIds)))
    .orderBy(asc(leavePolicies.effectiveFrom));
  for (const r of rows) {
    const list = map.get(r.leaveTypeId) ?? [];
    list.push(r);
    map.set(r.leaveTypeId, list);
  }
  return map;
}

/** The policy version in force on `date` (falls back to the earliest one for dates before it). */
export function policyOn(versions: PolicyRow[] | undefined, date: ISODate): PolicyRow | null {
  if (!versions || versions.length === 0) return null;
  let found: PolicyRow | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= date && (!v.effectiveTo || v.effectiveTo >= date)) found = v;
  }
  return found ?? versions[0];
}

export function currentPolicy(versions: PolicyRow[] | undefined, date: ISODate): PolicyRow | null {
  if (!versions || versions.length === 0) return null;
  return versions.filter((v) => v.effectiveFrom <= date).at(-1) ?? versions[0];
}

/** Working days in the employee's week (5, 5.5, 6 …) from their schedule. */
export function daysPerWeek(emp: EmployeeCtx): number {
  return emp.weekWeights.reduce((s, w) => s + Number(w || 0), 0);
}

/** v028.C — the yearly entitlement for this employee under a policy version,
 *  taking any work-week rule into account (Malawi: 18 days on a 6-day week,
 *  15 otherwise). The highest matching `minDays` wins. */
export function entitlementFor(policy: PolicyRow, emp: EmployeeCtx): number {
  // v028.D — "N weeks a year" (NZ annual/sick, AU annual/personal leave):
  // weeks × the working days in this person's week, so part-timers get the
  // same number of weeks off.
  const weeks = Number(policy.payRules?.entitlementWeeks ?? 0);
  if (weeks > 0) return Math.round(weeks * daysPerWeek(emp) * 100) / 100;
  const rules = (policy.entitlementByWeek ?? []).filter((r) => r && Number.isFinite(Number(r.minDays)));
  const dpw = daysPerWeek(emp);
  const match = rules
    .filter((r) => dpw >= Number(r.minDays))
    .sort((a, b) => Number(b.minDays) - Number(a.minDays))[0];
  return match ? Number(match.entitlement) : Number(policy.entitlement);
}

export function eligibleForCategory(policy: PolicyRow, emp: EmployeeCtx): boolean {
  return !policy.eligibleCategories || policy.eligibleCategories.length === 0 || policy.eligibleCategories.includes(emp.category);
}

/** v028.E — a minimum working week (South Africa's family responsibility
 *  leave applies only to people who work at least 4 days a week). */
export function workWeekAllowed(policy: PolicyRow, emp: EmployeeCtx): boolean {
  const min = Number(policy.payRules?.minDaysPerWeek ?? 0);
  return !min || daysPerWeek(emp) >= min;
}

export function genderAllowed(type: LeaveTypeRow, emp: EmployeeCtx): boolean {
  return type.genderRestriction === 'ANY' || type.genderRestriction === emp.gender;
}

/** Basic daily pay rate for leave pay / payouts: monthly basic ÷ divisor. */
export async function dailyPayRate(tx: Tx, tenantId: string, emp: EmployeeCtx, asOf: ISODate, divisor: number): Promise<number> {
  const rows = await tx
    .select()
    .from(employeeCompensationHistory)
    .where(and(eq(employeeCompensationHistory.tenantId, tenantId), eq(employeeCompensationHistory.employeeId, emp.id)))
    .orderBy(asc(employeeCompensationHistory.effectiveDate));
  const comp = rows.filter((r) => asISO(r.effectiveDate)! <= asOf).at(-1) ?? rows.at(-1);
  if (!comp) return 0;
  const rate = Number(comp.payRate) || 0;
  if (comp.payType === 'HOURLY') return rate * emp.hoursPerDay;
  const monthly = comp.payType === 'ANNUAL' ? rate / 12 : rate;
  return monthly / (divisor || 26);
}
