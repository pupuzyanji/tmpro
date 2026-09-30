import { NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema';
import { employees, payRunEvents, payRuns, payrollAdjustments, payslips, users } from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function sumValues(o: unknown): number {
  if (!o || typeof o !== 'object') return 0;
  return Object.values(o as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
}

export interface SlipLike {
  employeeId: string;
  grossPay: number;
  tax: number;
  deductions: number;
  netPay: number;
  components: unknown;
  adjustments: unknown;
}

/** Totals for a set of payslips. Employee deductions are the statutory ones
 *  plus scheduled deductions (advances …); total cost is gross pay, plus
 *  non-taxable additions, plus every employer contribution. */
export function totalsOf(slips: SlipLike[]) {
  let gross = 0,
    tax = 0,
    statutory = 0,
    other = 0,
    nonTaxable = 0,
    net = 0,
    employer = 0;
  for (const s of slips) {
    gross += s.grossPay;
    tax += s.tax;
    statutory += s.deductions;
    net += s.netPay;
    employer += sumValues((s.components as { employer?: unknown } | null)?.employer);
    for (const a of (s.adjustments as Array<{ type: string; amount: number; taxable?: boolean }> | null) ?? []) {
      if (a.type === 'DEDUCTION') other += a.amount;
      else if (!a.taxable) nonTaxable += a.amount;
    }
  }
  return {
    employees: slips.length,
    gross: r2(gross),
    tax: r2(tax),
    statutoryDeductions: r2(statutory),
    otherDeductions: r2(other),
    employeeDeductions: r2(statutory + other),
    nonTaxableAdditions: r2(nonTaxable),
    net: r2(net),
    employer: r2(employer),
    cost: r2(gross + nonTaxable + employer),
  };
}


// ---------------------------------------------------------------------------
// v030.A — shared helpers for the pay run lifecycle.

export type Tx = NodePgDatabase<typeof schema>;

export async function loadRun(tx: Tx, tenantId: string, id: string) {
  const [run] = await tx
    .select()
    .from(payRuns)
    .where(and(eq(payRuns.tenantId, tenantId), eq(payRuns.id, id)))
    .limit(1);
  if (!run) throw new NotFoundException('Pay run not found.');
  return run;
}

/** Name to show for the signed-in user in a run's history. */
export async function actorName(tx: Tx, tenantId: string, user: AuthenticatedUser): Promise<string> {
  const [u] = await tx
    .select({ email: users.email, firstName: users.firstName, lastName: users.lastName, eFirst: employees.firstName, eLast: employees.lastName })
    .from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .where(eq(users.id, user.userId))
    .limit(1);
  if (!u) return 'Unknown user';
  const first = u.eFirst ?? u.firstName;
  const last = u.eLast ?? u.lastName;
  return first ? `${first} ${last ?? ''}`.trim() : u.email;
}

export async function recordEvent(
  tx: Tx,
  tenantId: string,
  payRunId: string,
  user: AuthenticatedUser,
  action: 'CREATED' | 'RECALCULATED' | 'SUBMITTED' | 'APPROVED' | 'SENT_BACK' | 'REOPENED' | 'PAID',
  extra: { level?: number; comment?: string | null; data?: Record<string, unknown> } = {},
) {
  await tx.insert(payRunEvents).values({
    tenantId,
    payRunId,
    action,
    level: extra.level ?? null,
    actorUserId: user.userId,
    actorName: await actorName(tx, tenantId, user),
    comment: extra.comment ?? null,
    data: extra.data ?? {},
  });
}

/** Deletes a run's payslips and puts back the additions/deductions they
 *  applied — by the adjustment id recorded on the payslip (v030.A), or for
 *  older payslips by matching employee + label + type + amount. */
export async function rollbackPayslips(tx: Tx, tenantId: string, runId: string) {
  const runPayslips = await tx
    .select()
    .from(payslips)
    .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payRunId, runId)));
  for (const slip of runPayslips) {
    const snapshot =
      (slip.adjustments as Array<{ adjustmentId?: string; label: string; type: 'ADDITION' | 'DEDUCTION'; amount: number }> | null) ?? [];
    for (const entry of snapshot) {
      const [match] = entry.adjustmentId
        ? await tx.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, entry.adjustmentId)).limit(1)
        : await tx
            .select()
            .from(payrollAdjustments)
            .where(
              and(
                eq(payrollAdjustments.tenantId, tenantId),
                eq(payrollAdjustments.employeeId, slip.employeeId),
                eq(payrollAdjustments.label, entry.label),
                eq(payrollAdjustments.type, entry.type),
                eq(payrollAdjustments.amount, entry.amount),
              ),
            )
            .orderBy(desc(payrollAdjustments.createdAt))
            .limit(1);
      if (match && match.appliedCount > 0) {
        const appliedCount = match.appliedCount - 1;
        await tx
          .update(payrollAdjustments)
          .set({ appliedCount, status: match.status === 'CANCELLED' ? 'CANCELLED' : appliedCount < match.occurrences ? 'PENDING' : match.status })
          .where(eq(payrollAdjustments.id, match.id));
      }
    }
  }
  await tx.delete(payslips).where(and(eq(payslips.tenantId, tenantId), eq(payslips.payRunId, runId)));
}
