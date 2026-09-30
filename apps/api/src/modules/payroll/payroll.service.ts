import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { withTenant } from '../../db/client';
import type * as schema from '../../db/schema';
import {
  employeeCompensationHistory,
  employeeStatusHistory,
  employees,
  leaveRequestDays,
  leaveRequests,
  payRunEvents,
  payRuns,
  payrollAdjustments,
  payslips,
  taxProfiles,
  users,
} from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PAYROLL_RULESETS } from './rulesets/registry';
import { settleDueGratuities } from '../contracts/gratuity';
import { loadRun, recordEvent, rollbackPayslips, totalsOf, type Tx } from './run-helpers';
import type { RunPayrollDto, UpdatePayRunDto } from './dto/run-payroll.dto';
import type { CreatePayrollAdjustmentDto, UpdatePayrollAdjustmentDto } from './dto/payroll-adjustment.dto';

// Shared projection for a payslip plus the employee/pay-run context a
// payslip display needs (name, position, department, pay period, country)
// — joined here rather than making the frontend stitch together three
// separate fetches per payslip.
const PAYSLIP_SELECT = {
  id: payslips.id,
  payRunId: payslips.payRunId,
  employeeId: payslips.employeeId,
  grossPay: payslips.grossPay,
  tax: payslips.tax,
  deductions: payslips.deductions,
  netPay: payslips.netPay,
  components: payslips.components,
  adjustments: payslips.adjustments,
  createdAt: payslips.createdAt,
  employeeFirstName: employees.firstName,
  employeeLastName: employees.lastName,
  employeeCode: employees.employeeCode,
  jobTitle: employees.jobTitle,
  department: employees.department,
  // Regulatory identifiers shown on the payslip identity block and used to
  // build the Regulatory Submission return files (PAYE/Superannuation/
  // Health Insurance) on the Payroll page.
  taxId: employees.taxId,
  ssn: employees.ssn,
  nhiId: employees.nhiId,
  idNo: employees.idNo,
  dateOfBirth: employees.dateOfBirth,
  employmentType: employees.employmentType,
  periodStart: payRuns.periodStart,
  periodEnd: payRuns.periodEnd,
  countryCode: payRuns.countryCode,
};

@Injectable()
export class PayrollService {
  /** Every run, newest period first, with its headline totals (v030.A). */
  listRuns(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const runs = await tx.select().from(payRuns).where(eq(payRuns.tenantId, tenantId)).orderBy(desc(payRuns.periodEnd), desc(payRuns.createdAt));
      const slips = await tx
        .select({ payRunId: payslips.payRunId, employeeId: payslips.employeeId, grossPay: payslips.grossPay, tax: payslips.tax, deductions: payslips.deductions, netPay: payslips.netPay, components: payslips.components, adjustments: payslips.adjustments })
        .from(payslips)
        .where(eq(payslips.tenantId, tenantId));
      const byRun = new Map<string, typeof slips>();
      for (const sl of slips) byRun.set(sl.payRunId, [...(byRun.get(sl.payRunId) ?? []), sl]);
      return runs.map((r) => ({ ...r, totals: totalsOf(byRun.get(r.id) ?? []) }));
    });
  }

  listPayslips(tenantId: string, payRunId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select(PAYSLIP_SELECT)
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(payRuns, eq(payslips.payRunId, payRuns.id))
        .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payRunId, payRunId))),
    );
  }

  myPayslips(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select(PAYSLIP_SELECT)
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(payRuns, eq(payslips.payRunId, payRuns.id))
        .where(
          and(
            eq(payslips.tenantId, tenantId),
            eq(payslips.employeeId, employeeId),
            // v030.A — staff only see payslips once the run is approved.
            inArray(payRuns.status, ['APPROVED', 'PAID']),
          ),
        )
        .orderBy(desc(payRuns.periodEnd)),
    );
  }

  /**
   * Runs payroll for `countryCode`, day-by-day-prorating every employee's
   * earnings against what was actually in effect on each calendar day of
   * the period (see `buildProratedComponents` below), using that country's
   * PayrollRuleset. A country with no native ruleset registered throws
   * rather than silently producing wrong numbers — per the framework,
   * that's the signal to route it through a partner integration instead
   * (Sheet 07), not to guess at its tax law.
   */
  async runPayroll(tenantId: string, user: AuthenticatedUser, dto: RunPayrollDto) {
    if (!PAYROLL_RULESETS[dto.countryCode]) {
      throw new BadRequestException(
        `No native payroll ruleset for ${dto.countryCode} yet. Per the framework doc, route this country through a payroll partner integration instead of building tax rules ad hoc.`,
      );
    }
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) throw new BadRequestException('The period end is before its start.');

    return withTenant(tenantId, async (tx) => {
      // v030.A — a new run starts as a DRAFT: calculated, then reviewed,
      // submitted and approved before it's locked (pay-run-workflow.ts).
      const [payRun] = await tx
        .insert(payRuns)
        .values({
          tenantId,
          periodStart,
          periodEnd,
          countryCode: dto.countryCode,
          status: 'DRAFT',
          payDate: (dto.payDate ?? dto.periodEnd).slice(0, 10),
          preparedByUserId: user.userId,
          calculatedAt: new Date(),
        })
        .returning();
      const created = await this.calculate(tx, tenantId, payRun);
      await recordEvent(tx, tenantId, payRun.id, user, 'CREATED', { data: { payslips: created.length } });
      return { payRun, payslips: created };
    });
  }

  /** v030.A — recalculates a DRAFT run from scratch: undoes its payslips
   *  (and the additions/deductions they used) and works everything out
   *  again from the current records. */
  async recalculate(tenantId: string, user: AuthenticatedUser, runId: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft pay run can be recalculated. Reopen it first.');
      await rollbackPayslips(tx, tenantId, run.id);
      const created = await this.calculate(tx, tenantId, run);
      const [updated] = await tx
        .update(payRuns)
        .set({ preparedByUserId: user.userId, calculatedAt: new Date() })
        .where(eq(payRuns.id, run.id))
        .returning();
      await recordEvent(tx, tenantId, run.id, user, 'RECALCULATED', { data: { payslips: created.length } });
      return { payRun: updated, payslips: created };
    });
  }

  /**
   * Works out every payslip for `run`: each employee in the run's country
   * is prorated day by day against what was in effect on each calendar day
   * of the period (see `buildProratedComponents` below), then taxed by that
   * country's PayrollRuleset. A country with no native ruleset throws
   * rather than silently producing wrong numbers.
   */
  private async calculate(tx: Tx, tenantId: string, run: typeof payRuns.$inferSelect) {
    const ruleset = PAYROLL_RULESETS[run.countryCode];
    if (!ruleset) throw new BadRequestException(`No native payroll ruleset for ${run.countryCode}.`);
    const periodStart = new Date(run.periodStart);
    const periodEnd = new Date(run.periodEnd);
    // Inclusive calendar-day count — "01 Sept" to "30 Sept" is 30 days.
    const periodDays = daysInclusive(periodStart, periodEnd);

    // Every employee in this country is a *candidate* for this run —
    // employees.status is no longer a single whole-period gate. Someone
    // who was ACTIVE for only part of the period (a new hire, someone
    // who left or was terminated mid-period) still needs considering so
    // their partial pay computes correctly; buildProratedComponents
    // below resolves status day-by-day and simply returns 0 payable days
    // for anyone who was never ACTIVE-with-in-effect-Compensation at any
    // point in the period, which is what actually excludes them (see the
    // `if (payableDays === 0) continue` below) — not this query.
    const candidates = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.countryCode, run.countryCode)));

    // v028.F — gratuity on contracts that ended (or whose employee left)
    // by the end of this period becomes payroll additions first, so this
    // run pays it.
    await settleDueGratuities(tx, tenantId, periodEnd.toISOString().slice(0, 10), run.countryCode);

    const created = [];
    for (const employee of candidates) {
      const { components, payableDays } = await buildProratedComponents(tx, tenantId, employee, periodStart, periodEnd, periodDays);

      // Ad-hoc additions/deductions waiting for this employee (an advance
      // being clawed back, a bonus, leave pay or gratuity on leaving …).
      const pendingAdjustments = await tx
        .select()
        .from(payrollAdjustments)
        .where(
          and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.employeeId, employee.id),
            eq(payrollAdjustments.status, 'PENDING'),
          ),
        );

      // Nothing earned this period — never ACTIVE with in-effect
      // Compensation during it — and nothing waiting to be paid: skip
      // rather than create a zero-value payslip. (Someone who has left but
      // is still owed leave pay or gratuity gets a final payslip.)
      if (payableDays === 0 && pendingAdjustments.length === 0) continue;

      // v028.F — taxable additions join gross pay before the ruleset
      // works out tax; everything else is applied to net pay below.
      components.taxableAdditions = pendingAdjustments
        .filter((a) => a.type === 'ADDITION' && a.taxable)
        .reduce((s, a) => s + a.amount, 0);

      const [taxProfile] = await tx
        .select()
        .from(taxProfiles)
        .where(and(eq(taxProfiles.tenantId, tenantId), eq(taxProfiles.employeeId, employee.id)))
        .limit(1);

      const result = ruleset.calculatePayPeriod({
        kiwiSaverRate: taxProfile?.kiwiSaverRate,
        periodDays,
        periodEnd: periodEnd.toISOString().slice(0, 10),
        components,
      });

      // Record how much of the period was actually paid, so the payslip
      // can be transparent about a proration instead of just showing a
      // smaller number with no explanation (see PayslipCard's proration
      // note in apps/web).
      const componentsWithProration = {
        ...(result.components ?? {}),
        proration: { payableDays, periodTotalDays: periodDays, prorated: payableDays < periodDays },
      };

      // Apply the non-taxable additions and all deductions directly onto
      // net pay (taxable additions are already inside gross), and record a
      // snapshot on the payslip so it keeps showing them even after the
      // adjustment itself completes.
      const adjustmentSnapshot: Array<{ adjustmentId: string; label: string; type: 'ADDITION' | 'DEDUCTION'; amount: number; taxable?: boolean }> = [];
      let netPay = result.netPay;
      for (const adj of pendingAdjustments) {
        const inGross = adj.type === 'ADDITION' && adj.taxable;
        if (!inGross) netPay += adj.type === 'ADDITION' ? adj.amount : -adj.amount;
        adjustmentSnapshot.push({ adjustmentId: adj.id, label: adj.label, type: adj.type, amount: adj.amount, ...(inGross ? { taxable: true } : {}) });

        const appliedCount = adj.appliedCount + 1;
        await tx
          .update(payrollAdjustments)
          .set({
            appliedCount,
            status: appliedCount >= adj.occurrences ? 'COMPLETED' : 'PENDING',
          })
          .where(eq(payrollAdjustments.id, adj.id));
      }

      const [payslip] = await tx
        .insert(payslips)
        .values({
          tenantId,
          payRunId: run.id,
          employeeId: employee.id,
          ...result,
          components: componentsWithProration,
          netPay: Math.round(netPay * 100) / 100,
          adjustments: adjustmentSnapshot,
        })
        .returning();
      created.push(payslip);
    }

    return created;
  }

  /** Edits a DRAFT run's period or pay date. Changing the period doesn't
   *  recompute the payslips — recalculate afterwards. */
  async updateRun(tenantId: string, id: string, dto: UpdatePayRunDto) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, id);
      if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft pay run can be edited. Reopen it first.');
      const [row] = await tx
        .update(payRuns)
        .set({
          ...(dto.periodStart !== undefined ? { periodStart: new Date(dto.periodStart) } : {}),
          ...(dto.periodEnd !== undefined ? { periodEnd: new Date(dto.periodEnd) } : {}),
          ...(dto.payDate !== undefined ? { payDate: dto.payDate.slice(0, 10) } : {}),
        })
        .where(eq(payRuns.id, id))
        .returning();
      return row;
    });
  }

  /** Deletes a DRAFT pay run and its payslips, putting back the additions
   *  and deductions its payslips used. An approved run must be reopened
   *  first. */
  async deleteRun(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, id);
      if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft pay run can be deleted. Reopen it first.');
      await rollbackPayslips(tx, tenantId, id);
      await tx.delete(payRuns).where(and(eq(payRuns.tenantId, tenantId), eq(payRuns.id, id)));
      return { id };
    });
  }

  // --- Ad-hoc additions/deductions ----------------------------------------
  // Scheduled onto an employee's future pay runs (advances clawed back over
  // several runs, one-off bonuses) — applied inside runPayroll() above.

  listAdjustments(tenantId: string, employeeId?: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(payrollAdjustments)
        .where(
          employeeId
            ? and(eq(payrollAdjustments.tenantId, tenantId), eq(payrollAdjustments.employeeId, employeeId))
            : eq(payrollAdjustments.tenantId, tenantId),
        )
        .orderBy(desc(payrollAdjustments.createdAt)),
    );
  }

  /** Creates one identical adjustment row per employee in `dto.employeeIds`
   *  — lets an Admin raise the same bonus/deduction for several people at
   *  once without repeating the form. */
  createAdjustments(tenantId: string, createdById: string | null, dto: CreatePayrollAdjustmentDto) {
    return withTenant(tenantId, async (tx) => {
      const created = [];
      for (const employeeId of dto.employeeIds) {
        const [row] = await tx
          .insert(payrollAdjustments)
          .values({
            tenantId,
            employeeId,
            type: dto.type,
            label: dto.label,
            amount: dto.amount,
            occurrences: dto.occurrences ?? 1,
            taxable: dto.type === 'ADDITION' ? !!dto.taxable : false,
            createdById: createdById ?? undefined,
          })
          .returning();
        created.push(row);
      }
      return created;
    });
  }

  async cancelAdjustment(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(payrollAdjustments)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.id, id),
            eq(payrollAdjustments.status, 'PENDING'),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Adjustment not found, or it has already been applied/cancelled.');
    return row;
  }

  /** Edits a still-PENDING adjustment's type/label/amount/occurrences —
   *  once it's COMPLETED or CANCELLED it's locked in (payslips already carry
   *  a snapshot of what applied, per run). Occurrences can't be edited below
   *  how many times it's already been applied; doing so — or leaving it
   *  equal — completes the adjustment rather than leaving it dangling. */
  async updateAdjustment(tenantId: string, id: string, dto: UpdatePayrollAdjustmentDto) {
    return withTenant(tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(payrollAdjustments)
        .where(
          and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.id, id),
            eq(payrollAdjustments.status, 'PENDING'),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundException('Adjustment not found, or it has already been applied/cancelled.');

      const occurrences = dto.occurrences ?? existing.occurrences;
      if (occurrences < existing.appliedCount) {
        throw new BadRequestException(
          `Occurrences can't be fewer than the ${existing.appliedCount} time(s) this has already applied.`,
        );
      }

      const [row] = await tx
        .update(payrollAdjustments)
        .set({
          type: dto.type ?? existing.type,
          label: dto.label ?? existing.label,
          amount: dto.amount ?? existing.amount,
          taxable: (dto.type ?? existing.type) === 'ADDITION' ? (dto.taxable ?? existing.taxable) : false,
          occurrences,
          status: occurrences <= existing.appliedCount ? 'COMPLETED' : 'PENDING',
        })
        .where(eq(payrollAdjustments.id, id))
        .returning();
      return row;
    });
  }
}

// ---------------------------------------------------------------------------
// Day-by-day proration engine
//
// Every native ruleset reads the same shape — basicSalary plus typed
// allowances, summed for the whole pay period — regardless of what
// happened to any individual employee during it. This is what lets ZM and
// NZ (and any future native country) share one input contract. Building
// that shape used to mean reading one Compensation snapshot as of the
// period's end and scaling it by the period's day count (see v013.C) — a
// single flat rate for the whole period, whoever the employee was and
// whatever changed for them mid-period.
//
// That breaks down the moment something actually happened mid-period: a
// new hire starting partway through, someone leaving or being terminated,
// a pay rise or promotion effective mid-period, a switch between HOURLY
// and MONTHLY/ANNUAL pay, a change in contracted hours, or a stretch of
// unpaid leave inside an otherwise normal period. So instead, every
// employee's earnings for the period are built up **one calendar day at a
// time**:
//
//   for each day d in [periodStart, periodEnd]:
//     - resolve the Employee Status in effect on d (the most recent
//       Employee Status History row with effectiveDate <= d; if the
//       employee has no status history at all yet, fall back to their
//       current employees.status — but if they DO have history and its
//       earliest row is still after d, d resolves to "not yet employed",
//       not to their current status, so a day before someone's first
//       history entry is never silently treated as active just because
//       they're ACTIVE by the time payroll runs)
//     - a day whose resolved status isn't ACTIVE earns nothing — this
//       alone is what makes a new hire's pre-start days, and a leaver's or
//       terminated employee's post-effective-date days, unpaid, with no
//       extra "termination" or "new hire" logic needed
//     - otherwise resolve the Compensation entry in effect on d (same
//       most-recent-effectiveDate-<=-d rule); no entry yet also earns
//       nothing for that day
//     - otherwise, unless d falls inside an APPROVED leave request whose
//       Leave Type is marked unpaid, d earns that Compensation entry's
//       one-day share of Basic Pay + Allowances
//
// Effective Date convention (unchanged from before, just now applied per
// day instead of only at the period's end): a Status/Compensation row's
// effectiveDate is the first day that row applies. A termination should
// therefore be logged with the new OFFBOARDING/ALUMNI status effective the
// day AFTER the employee's last paid day — leaving after 15 Sept means
// that status is effective 16 Sept, so the 15th still pays.
//
// A mid-period Compensation change covers salary increases, promotions,
// and a HOURLY<->MONTHLY/ANNUAL payType switch alike — each day simply
// resolves whichever Compensation entry was in effect on it, old rate
// before the change, new rate from its effective date on, with no
// special-casing per scenario. A mid-period Job History change (a
// transfer: department/location/manager) is NOT itself a pay input — a
// transfer only affects pay if it comes with a new Compensation entry
// (e.g. a location-linked allowance changing), exactly as Job Information
// and Compensation are already two independently-dated logs elsewhere in
// this codebase.
//
// One rate is genuinely day-scaled two different ways depending on
// payType, same as before v013.C touched only the MONTHLY case:
//   - MONTHLY: already quoted per pay period, so one day's share is
//     payRate/periodTotalDays — summed over every day of a full,
//     unprorated period that comes back out to exactly payRate again.
//   - ANNUAL: quoted per year, so one day's share is payRate/365.
//   - HOURLY: quoted per hour, so one day's share is
//     payRate * hoursPerWeek/7 (an "average day's worth" of the
//     contracted week — this scaffold has no timesheet/actual-hours
//     tracking, per STANDARD_HOURS_PER_WEEK below).
// Allowances (Housing/Transport/Meal/Other) are always period-quoted
// figures regardless of the Compensation entry's own payType, so they
// prorate the MONTHLY way (amount/periodTotalDays) in every case.
//
// A change in contracted hours (full-time <-> part-time, or any explicit
// hours/week change) is carried on the Compensation entry itself
// (`hoursPerWeek`, added alongside this engine) rather than a separate
// history table — recording a new Compensation entry with a different
// hoursPerWeek is how an hours change is captured, exactly like any other
// Compensation change. `hoursPerWeek` scales MONTHLY/ANNUAL pay by
// hoursPerWeek/standard (a 20-hour/week entry pays half of a 40-hour/week
// one) and is read directly as HOURLY's weekly hours. Null/unset means
// "full standard hours" — every Compensation entry from before this
// engine existed behaves exactly as it did under the old flat formula.
//
// Known gap: NZ's PAYE annualises the period's *gross* (grossPay/periodDays
// * 365) to look up the right bracket, then pro-rates the resulting tax
// back down. For a prorated (partial) period that annualises the
// employee's *reduced* earnings rather than their true full rate, which
// can land them in a lower bracket than their real annual rate would —
// same caveat this ruleset already carries ("illustrative... NOT verified
// current IRD rates"). ZM's bands apply directly to the period's gross, so
// this doesn't affect ZM.
//
// Scale note: this queries every employee in the country on every run
// (not just those with employees.status = 'ACTIVE', since a leaver's
// current status may already be ALUMNI by the time payroll runs) and
// walks each one's period day-by-day in memory. Fine at this scaffold's
// scale; a tenant with a very large, long-tenured headcount would want to
// pre-filter and/or push the per-day resolution into SQL.

const DAYS_PER_YEAR = 365;
const STANDARD_HOURS_PER_WEEK = 40; // illustrative — this scaffold has no timesheet/hours-worked tracking
const MS_PER_DAY = 86_400_000;

const ALLOWANCE_COMPONENT_KEY: Record<string, string> = {
  HOUSING: 'housingAllowance',
  TRANSPORT_VEHICLE: 'transportAllowance',
  MEAL_LUNCH: 'lunchAllowance',
  OTHER: 'otherAllowance',
};

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inclusive calendar-day count: "01 Sept" to "30 Sept" is 30 days, not 29
 *  (the exclusive date-diff this replaced was the root of the v013.C
 *  MONTHLY bug, and day-by-day proration needs it exact — not just
 *  "close enough for a whole month" — for a short period like February or
 *  a final part-week to prorate correctly). */
function daysInclusive(start: Date, end: Date): number {
  return Math.max(0, Math.round((toUtcMidnight(end).getTime() - toUtcMidnight(start).getTime()) / MS_PER_DAY) + 1);
}

/** Every calendar day from `start` to `end`, inclusive. */
function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const endTime = toUtcMidnight(end).getTime();
  for (let t = toUtcMidnight(start).getTime(); t <= endTime; t += MS_PER_DAY) days.push(new Date(t));
  return days;
}

function dateKey(d: Date): string {
  return toUtcMidnight(d).toISOString().slice(0, 10);
}

/** A stateful forward-scanning resolver over history rows already sorted
 *  ascending by effectiveDate. Call it only with strictly non-decreasing
 *  `day` values (exactly how the day-by-day loop below calls it) and it
 *  returns whichever row is in effect on that day — the most recent one
 *  whose effectiveDate is on or before it, or undefined if even the
 *  earliest row is still in the future relative to `day`. */
function makeAsOfResolver<T extends { effectiveDate: Date }>(rowsAscending: T[]) {
  let i = 0;
  let current: T | undefined;
  return (day: Date): T | undefined => {
    const t = day.getTime();
    while (i < rowsAscending.length && rowsAscending[i].effectiveDate.getTime() <= t) {
      current = rowsAscending[i];
      i++;
    }
    return current;
  };
}

/** One day's share of a Compensation entry's Basic Pay Rate — see the
 *  payType-by-payType breakdown in the comment block above. */
function dailyBasicRate(payRate: number, payType: string, fteFraction: number, periodTotalDays: number, hoursPerWeek: number): number {
  switch (payType) {
    case 'ANNUAL':
      return (payRate * fteFraction) / DAYS_PER_YEAR;
    case 'HOURLY':
      return (payRate * hoursPerWeek) / 7;
    case 'MONTHLY':
    default:
      return (payRate * fteFraction) / periodTotalDays;
  }
}

type CompensationRow = {
  effectiveDate: Date;
  payRate: number;
  payType: string;
  allowances: unknown;
  hoursPerWeek: number | null;
};
type StatusRow = { effectiveDate: Date; status: string };

/** Builds one employee's `components` for a pay period by resolving what
 *  was in effect on each calendar day of it — see the module-level comment
 *  above for the full rationale and the scenarios this covers. Returns
 *  `payableDays` alongside `components` so the caller can skip anyone who
 *  earned nothing at all (never ACTIVE-with-in-effect-Compensation during
 *  the period) and so the payslip can show how much of the period was
 *  actually paid. */
async function buildProratedComponents(
  tx: NodePgDatabase<typeof schema>,
  tenantId: string,
  employee: { id: string; status: string },
  periodStart: Date,
  periodEnd: Date,
  periodTotalDays: number,
): Promise<{ components: Record<string, number>; payableDays: number }> {
  const emptyComponents = { basicSalary: 0, housingAllowance: 0, transportAllowance: 0, lunchAllowance: 0, otherAllowance: 0 };

  // Sequential awaits, deliberately — see the v007.A note elsewhere in this
  // codebase: node-postgres doesn't support concurrent queries sharing one
  // transaction connection, so these can't be a Promise.all.
  const compRows = (await tx
    .select({
      effectiveDate: employeeCompensationHistory.effectiveDate,
      payRate: employeeCompensationHistory.payRate,
      payType: employeeCompensationHistory.payType,
      allowances: employeeCompensationHistory.allowances,
      hoursPerWeek: employeeCompensationHistory.hoursPerWeek,
    })
    .from(employeeCompensationHistory)
    .where(
      and(
        eq(employeeCompensationHistory.tenantId, tenantId),
        eq(employeeCompensationHistory.employeeId, employee.id),
        lte(employeeCompensationHistory.effectiveDate, periodEnd),
      ),
    )
    .orderBy(employeeCompensationHistory.effectiveDate)) as CompensationRow[];

  // No Compensation on file at all as of this period end — nothing to
  // prorate, exactly like the old single-snapshot check.
  if (compRows.length === 0) return { components: emptyComponents, payableDays: 0 };

  const statusRows = (await tx
    .select({ effectiveDate: employeeStatusHistory.effectiveDate, status: employeeStatusHistory.status })
    .from(employeeStatusHistory)
    .where(
      and(
        eq(employeeStatusHistory.tenantId, tenantId),
        eq(employeeStatusHistory.employeeId, employee.id),
        lte(employeeStatusHistory.effectiveDate, periodEnd),
      ),
    )
    .orderBy(employeeStatusHistory.effectiveDate)) as StatusRow[];

  // v028.A — approved leave days with their pay factor (1 full, 0.5 half,
  // 0 unpaid), written by the leave engine per counted day: unpaid leave,
  // the half-pay stretch of a long sick episode, maternity without the
  // service for full pay. A day not in this map is paid normally. Where two
  // approved requests somehow cover the same day, the lower factor wins.
  const leaveDayRows = await tx
    .select({ day: leaveRequestDays.day, payFactor: leaveRequestDays.payFactor })
    .from(leaveRequestDays)
    .innerJoin(leaveRequests, eq(leaveRequestDays.requestId, leaveRequests.id))
    .where(
      and(
        eq(leaveRequestDays.tenantId, tenantId),
        eq(leaveRequestDays.employeeId, employee.id),
        eq(leaveRequests.status, 'APPROVED'),
        lte(leaveRequestDays.day, dateKey(periodEnd)),
        gte(leaveRequestDays.day, dateKey(periodStart)),
      ),
    );
  const leavePayFactor = new Map<string, number>();
  for (const row of leaveDayRows) {
    const f = Number(row.payFactor);
    if (f < 1) leavePayFactor.set(row.day, Math.min(f, leavePayFactor.get(row.day) ?? 1));
  }

  const resolveStatus = makeAsOfResolver(statusRows);
  const resolveComp = makeAsOfResolver(compRows);

  const components = { ...emptyComponents };
  let payableDays = 0;

  for (const day of eachDay(periodStart, periodEnd)) {
    // No status history at all yet (a legacy record predating the Status
    // History log) falls back to the employee's current status for every
    // day, matching how this worked before day-by-day proration existed.
    // Once there IS history, a day before its earliest row resolves to
    // "not yet employed" rather than borrowing whatever status the
    // employee happens to hold by the time payroll actually runs.
    const status = statusRows.length === 0 ? employee.status : resolveStatus(day)?.status;
    if (status !== 'ACTIVE') continue;

    const comp = resolveComp(day);
    if (!comp) continue;

    const factor = leavePayFactor.get(dateKey(day)) ?? 1;
    if (factor <= 0) continue;

    payableDays++;
    const hoursPerWeek = comp.hoursPerWeek ?? STANDARD_HOURS_PER_WEEK;
    const fteFraction = hoursPerWeek / STANDARD_HOURS_PER_WEEK;

    components.basicSalary += factor * dailyBasicRate(comp.payRate, comp.payType, fteFraction, periodTotalDays, hoursPerWeek);

    const allowances = (comp.allowances as Array<{ type: string; amount: number }> | null) ?? [];
    for (const a of allowances) {
      const key = ALLOWANCE_COMPONENT_KEY[a.type];
      if (key) components[key as keyof typeof components] += (factor * (a.amount || 0) * fteFraction) / periodTotalDays;
    }
  }

  return { components, payableDays };
}
