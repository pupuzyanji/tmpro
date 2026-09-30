// v028.F — contract gratuity.
//
// Zambia, Employment Code Act s.73 (as the user's organisations apply it):
// an employee on a fixed-term contract of 12 months or longer earns gratuity
// of at least 25% of their LAST-DRAWN BASIC PAY (no allowances, overtime or
// bonuses) for every month served. Organisations may pay more (30%, 35%,
// 40% …). The statutory 25% is paid tax-free; any part above 25% is added
// to gross pay and taxed through PAYE.
//
// Other countries: gratuity is not statutory here, so a contract only earns
// it if the organisation sets a rate, and all of it is taxable.
//
// Gratuity is settled once per contract — when the contract's end date has
// passed, or earlier if the employee leaves — as payroll additions that the
// next pay run for that country picks up.

import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { employeeCompensationHistory, employeeContracts, employees, employeeStatusHistory, gratuitySettlements, payrollAdjustments } from '../../db/schema';

type Tx = NodePgDatabase<typeof schema>;
type ContractRow = typeof employeeContracts.$inferSelect;

export const CONTRACT_TYPES = ['PERMANENT_PENSIONABLE', 'PERMANENT_NON_PENSIONABLE', 'FIXED_TERM', 'TEMPORARY', 'CASUAL'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

/** Statutory (tax-free) gratuity rate by country, in %. */
export const STATUTORY_GRATUITY: Record<string, number> = { ZM: 25 };

const STANDARD_HOURS = 40;

// ---------------------------------------------------------------- dates
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, dim));
  return target.toISOString().slice(0, 10);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Months from `start` to `end` inclusive, as whole months plus the
 *  fraction of the last partial month (e.g. 1 Jan – 15 Mar ≈ 2.48). */
export function monthsServed(start: string, end: string): number {
  if (end < start) return 0;
  const endExclusive = addDays(end, 1);
  let whole = 0;
  while (addMonths(start, whole + 1) <= endExclusive) whole++;
  const from = addMonths(start, whole);
  const next = addMonths(start, whole + 1);
  const span = (Date.parse(next) - Date.parse(from)) / 86_400_000;
  const part = (Date.parse(endExclusive) - Date.parse(from)) / 86_400_000;
  return round2(whole + (span > 0 ? part / span : 0));
}

/** Contract length in whole months (for the 12-month test). */
export function contractMonths(c: Pick<ContractRow, 'startDate' | 'endDate'>): number | null {
  if (!c.endDate) return null;
  return monthsServed(c.startDate, c.endDate);
}

/** Whether a contract earns gratuity: fixed-term, at least 12 months long,
 *  with a rate set. */
export function earnsGratuity(c: ContractRow): boolean {
  const len = contractMonths(c);
  return c.contractType === 'FIXED_TERM' && len != null && len >= 12 && Number(c.gratuityRate ?? 0) > 0;
}

/** Monthly basic pay as of `date` from the Compensation history (the Basic
 *  Pay Rate only — never allowances). */
export async function monthlyBasic(tx: Tx, tenantId: string, employeeId: string, date: string): Promise<number> {
  const rows = await tx
    .select()
    .from(employeeCompensationHistory)
    .where(and(eq(employeeCompensationHistory.tenantId, tenantId), eq(employeeCompensationHistory.employeeId, employeeId)))
    .orderBy(asc(employeeCompensationHistory.effectiveDate));
  const comp = rows.filter((r) => iso(r.effectiveDate)! <= date).at(-1) ?? rows.at(-1);
  if (!comp) return 0;
  const rate = Number(comp.payRate) || 0;
  const hours = comp.hoursPerWeek ?? STANDARD_HOURS;
  if (comp.payType === 'HOURLY') return round2((rate * hours * 52) / 12);
  const scale = comp.hoursPerWeek ? comp.hoursPerWeek / STANDARD_HOURS : 1;
  return round2((comp.payType === 'ANNUAL' ? rate / 12 : rate) * scale);
}

/** First day the employee is no longer employed (ALUMNI), if any. */
async function leftOn(tx: Tx, tenantId: string, employeeId: string): Promise<string | null> {
  const rows = await tx
    .select({ status: employeeStatusHistory.status, effectiveDate: employeeStatusHistory.effectiveDate })
    .from(employeeStatusHistory)
    .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
    .orderBy(asc(employeeStatusHistory.effectiveDate));
  const last = rows.at(-1);
  return last?.status === 'ALUMNI' ? iso(last.effectiveDate) : null;
}

export interface GratuityFigure {
  contractId: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  rate: number;
  statutoryRate: number;
  eligible: boolean;
  /** Last day counted so far (today, the contract end, or the last day worked). */
  servedTo: string;
  months: number;
  basicMonthly: number;
  amount: number;
  taxFree: number;
  taxable: number;
  settled: { on: string; amount: number } | null;
  /** Why the contract doesn't earn gratuity, when it doesn't. */
  reason: string | null;
}

/** The gratuity figure for one contract as of `asOf` — accrued so far for a
 *  running contract, or the final figure once it has ended. */
export async function gratuityFor(tx: Tx, c: ContractRow, countryCode: string, asOf: string): Promise<GratuityFigure> {
  const statutoryRate = STATUTORY_GRATUITY[countryCode] ?? 0;
  const rate = Number(c.gratuityRate ?? 0);
  const left = await leftOn(tx, c.tenantId, c.employeeId);
  const lastDay = left ? addDays(left, -1) : null;
  const servedTo = [asOf, c.endDate, lastDay].filter((d): d is string => !!d).sort()[0];
  const eligible = earnsGratuity(c);
  const [settledRow] = await tx.select().from(gratuitySettlements).where(eq(gratuitySettlements.contractId, c.id)).limit(1);
  let reason: string | null = null;
  if (c.contractType !== 'FIXED_TERM') reason = 'Only fixed-term contracts earn gratuity.';
  else if (!c.endDate) reason = 'Give the contract an end date.';
  else if ((contractMonths(c) ?? 0) < 12) reason = 'The contract is shorter than 12 months.';
  else if (!rate) reason = 'No gratuity rate is set on the contract.';
  const months = eligible ? monthsServed(c.startDate, servedTo) : 0;
  const basicMonthly = eligible ? await monthlyBasic(tx, c.tenantId, c.employeeId, servedTo) : 0;
  const amount = round2((rate / 100) * basicMonthly * months);
  const taxFree = round2((Math.min(rate, statutoryRate) / 100) * basicMonthly * months);
  return {
    contractId: c.id,
    contractType: c.contractType,
    startDate: c.startDate,
    endDate: c.endDate,
    rate,
    statutoryRate,
    eligible,
    servedTo,
    months,
    basicMonthly,
    amount,
    taxFree,
    taxable: round2(amount - taxFree),
    settled: settledRow ? { on: iso(settledRow.createdAt)!, amount: round2(Number(settledRow.taxFreeAmount) + Number(settledRow.taxableAmount)) } : null,
    reason: eligible ? null : reason,
  };
}

/** Pays out every gratuity that has fallen due by `asOf` (contract ended or
 *  employee left) and hasn't been paid yet, as payroll additions — the
 *  statutory part non-taxable, anything above it taxable. Idempotent. */
export async function settleDueGratuities(tx: Tx, tenantId: string, asOf: string = today(), countryCode?: string): Promise<number> {
  const contracts = await tx.select().from(employeeContracts).where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.contractType, 'FIXED_TERM')));
  if (contracts.length === 0) return 0;
  const emps = await tx
    .select({ id: employees.id, countryCode: employees.countryCode })
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, [...new Set(contracts.map((c) => c.employeeId))])));
  const countryOf = new Map(emps.map((e) => [e.id, e.countryCode]));
  const settled = new Set(
    (await tx.select({ contractId: gratuitySettlements.contractId }).from(gratuitySettlements).where(eq(gratuitySettlements.tenantId, tenantId))).map((r) => r.contractId),
  );
  let count = 0;
  for (const c of contracts) {
    if (settled.has(c.id) || !earnsGratuity(c)) continue;
    const country = countryOf.get(c.employeeId) ?? 'ZM';
    if (countryCode && country !== countryCode) continue;
    const left = await leftOn(tx, tenantId, c.employeeId);
    const ended = (c.endDate && c.endDate <= asOf) || (left && left <= asOf);
    if (!ended) continue;
    const g = await gratuityFor(tx, c, country, asOf);
    if (g.amount <= 0) continue;
    const ids: string[] = [];
    const period = `${g.startDate} – ${g.servedTo}`;
    if (g.taxFree > 0) {
      const [a] = await tx
        .insert(payrollAdjustments)
        .values({
          tenantId,
          employeeId: c.employeeId,
          type: 'ADDITION',
          label: `Gratuity ${period} — ${g.months} months at ${Math.min(g.rate, g.statutoryRate)}% of basic (tax-free)`.slice(0, 160),
          amount: g.taxFree,
          occurrences: 1,
          taxable: false,
        })
        .returning({ id: payrollAdjustments.id });
      ids.push(a.id);
    }
    if (g.taxable > 0) {
      const [a] = await tx
        .insert(payrollAdjustments)
        .values({
          tenantId,
          employeeId: c.employeeId,
          type: 'ADDITION',
          label: (g.statutoryRate
            ? `Gratuity ${period} — the ${round2(g.rate - g.statutoryRate)}% above the statutory ${g.statutoryRate}% (taxable)`
            : `Gratuity ${period} — ${g.months} months at ${g.rate}% of basic (taxable)`
          ).slice(0, 160),
          amount: g.taxable,
          occurrences: 1,
          taxable: true,
        })
        .returning({ id: payrollAdjustments.id });
      ids.push(a.id);
    }
    await tx
      .insert(gratuitySettlements)
      .values({
        tenantId,
        employeeId: c.employeeId,
        contractId: c.id,
        servedTo: g.servedTo,
        months: g.months,
        basicMonthly: g.basicMonthly,
        rate: g.rate,
        taxFreeAmount: g.taxFree,
        taxableAmount: g.taxable,
        adjustmentIds: ids,
      })
      .onConflictDoNothing();
    count++;
  }
  return count;
}
