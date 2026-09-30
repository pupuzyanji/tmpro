// v028.A — the leave ledger: append-only. Every balance is a sum over it.

import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { leaveLedger } from '../../../db/schema';
import type { Tx } from './context';
import { addYears, fullMonthsBetween, ISODate, round2 } from './dates';

export type EntryType =
  | 'OPENING_BALANCE'
  | 'OPENING_USAGE'
  | 'ACCRUAL'
  | 'ALLOTMENT'
  | 'USAGE'
  | 'USAGE_REVERSAL'
  | 'ADJUSTMENT'
  | 'ADJUSTMENT_REVERSAL'
  | 'CARRY_FORWARD'
  | 'EXPIRY'
  | 'FORFEIT'
  | 'PAYOUT';

export interface NewEntry {
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  policyId?: string | null;
  entryType: EntryType;
  units: number;
  effectiveDate: ISODate;
  cycleKey: string;
  payTier?: string | null;
  sourceType: 'REQUEST' | 'ENGINE' | 'OPENING_BATCH' | 'ADJUSTMENT' | 'TERMINATION' | 'MIGRATION';
  sourceId?: string | null;
  idemKey?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  reversesId?: string | null;
  payrollAdjustmentId?: string | null;
  createdBy?: string | null;
}

/** Inserts an entry; with an idemKey, a second identical posting is a no-op.
 *  Returns the new row, or null if it already existed. */
export async function post(tx: Tx, e: NewEntry) {
  const [row] = await tx
    .insert(leaveLedger)
    .values({ ...e, units: round2(e.units) })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function existingKeys(tx: Tx, tenantId: string, employeeId: string, leaveTypeId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ k: leaveLedger.idemKey })
    .from(leaveLedger)
    .where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveLedger.employeeId, employeeId), eq(leaveLedger.leaveTypeId, leaveTypeId)));
  return new Set(rows.map((r) => r.k).filter((k): k is string => !!k));
}

/** Sum of every entry for a type, optionally only those effective on/before a date. */
export async function balance(tx: Tx, tenantId: string, employeeId: string, leaveTypeId: string, asOf?: ISODate): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${leaveLedger.units}), 0)` })
    .from(leaveLedger)
    .where(
      and(
        eq(leaveLedger.tenantId, tenantId),
        eq(leaveLedger.employeeId, employeeId),
        eq(leaveLedger.leaveTypeId, leaveTypeId),
        ...(asOf ? [lte(leaveLedger.effectiveDate, asOf)] : []),
      ),
    );
  return round2(Number(row?.total ?? 0));
}

export async function cycleBalance(tx: Tx, tenantId: string, employeeId: string, leaveTypeId: string, cycleKey: string) {
  const rows = await tx
    .select({ entryType: leaveLedger.entryType, units: leaveLedger.units })
    .from(leaveLedger)
    .where(
      and(
        eq(leaveLedger.tenantId, tenantId),
        eq(leaveLedger.employeeId, employeeId),
        eq(leaveLedger.leaveTypeId, leaveTypeId),
        eq(leaveLedger.cycleKey, cycleKey),
      ),
    );
  let allotted = 0;
  let used = 0;
  let other = 0;
  for (const r of rows) {
    const u = Number(r.units);
    if (r.entryType === 'ALLOTMENT' || r.entryType === 'ACCRUAL') allotted += u;
    else if (['USAGE', 'USAGE_REVERSAL', 'OPENING_USAGE'].includes(r.entryType)) used -= u;
    else other += u;
  }
  return { allotted: round2(allotted), used: round2(used), remaining: round2(allotted - used + other), hasAllotment: rows.some((r) => r.entryType === 'ALLOTMENT') };
}

// ---------------------------------------------------------------- cycle keys

export type CycleName = 'EMPLOYMENT_ANNIVERSARY' | 'CALENDAR_YEAR' | 'CALENDAR_MONTH' | 'PER_EVENT' | 'PER_EPISODE' | 'NONE';

/** The employment-anniversary cycle containing `date`. */
export function anniversaryCycle(serviceStart: ISODate, date: ISODate): { start: ISODate; end: ISODate; key: string } {
  const years = Math.floor(fullMonthsBetween(serviceStart, date) / 12);
  const start = addYears(serviceStart, years);
  const end = addYears(serviceStart, years + 1);
  return { start, end: end, key: `A${start}` };
}

export function cycleKeyFor(cycle: string, date: ISODate, serviceStart: ISODate): string {
  switch (cycle) {
    case 'CALENDAR_YEAR':
      return `Y${date.slice(0, 4)}`;
    case 'CALENDAR_MONTH':
      return `M${date.slice(0, 7)}`;
    case 'EMPLOYMENT_ANNIVERSARY':
      return anniversaryCycle(serviceStart, date).key;
    default:
      return 'NONE';
  }
}

export async function reversedIds(tx: Tx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.select({ r: leaveLedger.reversesId }).from(leaveLedger).where(inArray(leaveLedger.reversesId, ids));
  return new Set(rows.map((x) => x.r).filter((x): x is string => !!x));
}
