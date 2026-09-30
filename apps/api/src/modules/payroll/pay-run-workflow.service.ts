import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { withTenant } from '../../db/client';
import type * as schema from '../../db/schema';
import {
  employeeContracts,
  employees,
  payRunEvents,
  payRuns,
  payrollApprovalSettings,
  payrollApprovers,
  payslips,
  users,
} from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MailService } from '../../common/mail/mail.service';
import { WEB_APP_URL } from '../../auth/account-security';
import { gratuityFor } from '../contracts/gratuity';
import { loadRun, recordEvent, totalsOf } from './run-helpers';
import type { ApprovalSettingsDto } from './dto/run-payroll.dto';

type Tx = NodePgDatabase<typeof schema>;
type Run = typeof payRuns.$inferSelect;
type Level = '1' | '2' | 'ANY';

/**
 * v030.A — a pay run's stages after it is calculated:
 *
 *   DRAFT ──submit──▶ SUBMITTED ──approve (1 or 2 levels)──▶ APPROVED ──▶ PAID
 *     ▲                  │ send back / withdraw                  │ reopen (reason)
 *     └──────────────────┴───────────────────────────────────────┘
 *
 * Checks are worked out from the payslips (blocking items stop a
 * submission; "check" items must be acknowledged). Who may approve, how
 * many approvals a run needs and when a second is required come from
 * Settings → Payroll → Approvals for the run's country. Every step is
 * written to pay_run_events.
 */

export type Severity = 'BLOCK' | 'CHECK' | 'INFO';
export interface RunCheck {
  code: string;
  severity: Severity;
  employeeId: string | null;
  title: string;
  detail: string;
}

const DEFAULT_SETTINGS = {
  approvalsRequired: 1,
  secondWhenCostOver: null as number | null,
  secondWhenIncreasePct: null as number | null,
  secondWhenOverride: true,
  preparerCannotApprove: true,
  sendBackNeedsComment: true,
  notifyOnSubmit: true,
  notifyOnDecision: true,
};

/** Net pay moving by more than this (in %) on the previous run is flagged. */
const NET_CHANGE_FLAG = 15;

/** The person-level social-security number each country's return needs. */
const SOCIAL_NUMBER: Record<string, string> = { ZM: 'NAPSA number', ZW: 'NSSA number', TZ: 'NSSF number' };

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function iso(d: Date | string | null | undefined) {
  if (!d) return null;
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
}
function sumValues(o: unknown): number {
  if (!o || typeof o !== 'object') return 0;
  return Object.values(o as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
}

@Injectable()
export class PayRunWorkflowService {
  private readonly log = new Logger('PayRunWorkflow');
  constructor(private mail: MailService) {}

  // ------------------------------------------------------------ settings

  private async settingsRow(tx: Tx, tenantId: string, countryCode: string) {
    const [row] = await tx
      .select()
      .from(payrollApprovalSettings)
      .where(and(eq(payrollApprovalSettings.tenantId, tenantId), eq(payrollApprovalSettings.countryCode, countryCode)))
      .limit(1);
    return { ...DEFAULT_SETTINGS, ...(row ?? {}), configured: !!row };
  }

  /** Named approvers for a country; with none named, any Admin may approve. */
  private async approversFor(tx: Tx, tenantId: string, countryCode: string) {
    const named = await tx
      .select({ userId: payrollApprovers.userId, level: payrollApprovers.level, email: users.email, role: users.role, canApprove: users.canApprovePayroll, firstName: employees.firstName, lastName: employees.lastName, uFirst: users.firstName, uLast: users.lastName, jobTitle: employees.jobTitle })
      .from(payrollApprovers)
      .innerJoin(users, eq(users.id, payrollApprovers.userId))
      .leftJoin(employees, eq(employees.id, users.employeeId))
      .where(and(eq(payrollApprovers.tenantId, tenantId), eq(payrollApprovers.countryCode, countryCode)))
      .orderBy(asc(payrollApprovers.createdAt));
    const list = named
      .filter((a) => a.canApprove)
      .map((a) => ({
        userId: a.userId,
        level: a.level as Level,
        email: a.email,
        name: (a.firstName ? `${a.firstName} ${a.lastName ?? ''}` : a.uFirst ? `${a.uFirst} ${a.uLast ?? ''}` : a.email).trim(),
        jobTitle: a.jobTitle,
      }));
    if (list.length) return { approvers: list, fallback: false };
    const admins = await tx
      .select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, eFirst: employees.firstName, eLast: employees.lastName, jobTitle: employees.jobTitle })
      .from(users)
      .leftJoin(employees, eq(employees.id, users.employeeId))
      .where(and(eq(users.tenantId, tenantId), eq(users.role, 'ADMIN')));
    return {
      approvers: admins.map((a) => ({
        userId: a.userId,
        level: 'ANY' as Level,
        email: a.email,
        name: ((a.eFirst ?? a.firstName) ? `${a.eFirst ?? a.firstName} ${a.eLast ?? a.lastName ?? ''}` : a.email).trim(),
        jobTitle: a.jobTitle,
      })),
      fallback: true,
    };
  }

  async getSettings(tenantId: string, countryCode: string) {
    return withTenant(tenantId, async (tx) => {
      const s = await this.settingsRow(tx, tenantId, countryCode);
      const { approvers, fallback } = await this.approversFor(tx, tenantId, countryCode);
      const eligible = await tx
        .select({ userId: users.id, email: users.email, role: users.role, firstName: employees.firstName, lastName: employees.lastName, uFirst: users.firstName, uLast: users.lastName, jobTitle: employees.jobTitle })
        .from(users)
        .leftJoin(employees, eq(employees.id, users.employeeId))
        .where(and(eq(users.tenantId, tenantId), eq(users.canApprovePayroll, true)));
      return {
        countryCode,
        settings: {
          approvalsRequired: s.approvalsRequired,
          secondWhenCostOver: s.secondWhenCostOver,
          secondWhenIncreasePct: s.secondWhenIncreasePct,
          secondWhenOverride: s.secondWhenOverride,
          preparerCannotApprove: s.preparerCannotApprove,
          sendBackNeedsComment: s.sendBackNeedsComment,
          notifyOnSubmit: s.notifyOnSubmit,
          notifyOnDecision: s.notifyOnDecision,
        },
        approvers: fallback ? [] : approvers,
        fallbackToAdmins: fallback,
        eligible: eligible.map((e) => ({
          userId: e.userId,
          email: e.email,
          role: e.role,
          jobTitle: e.jobTitle,
          name: (e.firstName ? `${e.firstName} ${e.lastName ?? ''}` : e.uFirst ? `${e.uFirst} ${e.uLast ?? ''}` : e.email).trim(),
        })),
      };
    });
  }

  async saveSettings(tenantId: string, countryCode: string, dto: ApprovalSettingsDto) {
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new BadRequestException('Choose a payroll country.');
    await withTenant(tenantId, async (tx) => {
      const values = {
        approvalsRequired: dto.approvalsRequired ?? DEFAULT_SETTINGS.approvalsRequired,
        secondWhenCostOver: dto.secondWhenCostOver ?? null,
        secondWhenIncreasePct: dto.secondWhenIncreasePct ?? null,
        secondWhenOverride: dto.secondWhenOverride ?? true,
        preparerCannotApprove: dto.preparerCannotApprove ?? true,
        sendBackNeedsComment: dto.sendBackNeedsComment ?? true,
        notifyOnSubmit: dto.notifyOnSubmit ?? true,
        notifyOnDecision: dto.notifyOnDecision ?? true,
        updatedAt: new Date(),
      };
      if (values.secondWhenCostOver != null && values.secondWhenCostOver < 0) throw new BadRequestException('The cost limit cannot be negative.');
      if (values.secondWhenIncreasePct != null && values.secondWhenIncreasePct < 0) throw new BadRequestException('The increase limit cannot be negative.');
      await tx
        .insert(payrollApprovalSettings)
        .values({ tenantId, countryCode, ...values })
        .onConflictDoUpdate({ target: [payrollApprovalSettings.tenantId, payrollApprovalSettings.countryCode], set: values });

      if (dto.approvers) {
        const ids = [...new Set(dto.approvers.map((a) => a.userId))];
        const allowed = ids.length
          ? await tx
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.tenantId, tenantId), inArray(users.id, ids), eq(users.canApprovePayroll, true)))
          : [];
        const ok = new Set(allowed.map((u) => u.id));
        const bad = ids.filter((id) => !ok.has(id));
        if (bad.length) throw new BadRequestException('Only people with "Can approve payroll" switched on (Permission tab) can be approvers.');
        await tx.delete(payrollApprovers).where(and(eq(payrollApprovers.tenantId, tenantId), eq(payrollApprovers.countryCode, countryCode)));
        for (const a of dto.approvers) {
          const level: Level = a.level === '1' || a.level === '2' ? a.level : 'ANY';
          await tx.insert(payrollApprovers).values({ tenantId, countryCode, userId: a.userId, level }).onConflictDoNothing();
        }
      }
    });
    return this.getSettings(tenantId, countryCode);
  }

  /** Permission tab: "Can approve payroll". Admin only; switching it off also
   *  removes the person from every approver list. */
  async setCanApprove(tenantId: string, employeeId: string, value: boolean, actingUser: AuthenticatedUser) {
    if (actingUser.role !== 'ADMIN') throw new ForbiddenException('Only an Admin can change who approves payroll.');
    return withTenant(tenantId, async (tx) => {
      const [u] = await tx
        .update(users)
        .set({ canApprovePayroll: value })
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .returning({ id: users.id, canApprovePayroll: users.canApprovePayroll });
      if (!u) throw new NotFoundException('This person does not have a login account yet.');
      if (!value) await tx.delete(payrollApprovers).where(and(eq(payrollApprovers.tenantId, tenantId), eq(payrollApprovers.userId, u.id)));
      return u;
    });
  }

  // ------------------------------------------------------------ checks

  private async previousRun(tx: Tx, tenantId: string, run: Run) {
    const [prev] = await tx
      .select()
      .from(payRuns)
      .where(and(eq(payRuns.tenantId, tenantId), eq(payRuns.countryCode, run.countryCode), lt(payRuns.periodEnd, run.periodStart)))
      .orderBy(desc(payRuns.periodEnd))
      .limit(1);
    return prev ?? null;
  }

  private slipsOf(tx: Tx, tenantId: string, runId: string) {
    return tx
      .select({
        id: payslips.id,
        employeeId: payslips.employeeId,
        grossPay: payslips.grossPay,
        tax: payslips.tax,
        deductions: payslips.deductions,
        netPay: payslips.netPay,
        components: payslips.components,
        adjustments: payslips.adjustments,
        firstName: employees.firstName,
        lastName: employees.lastName,
        taxId: employees.taxId,
        ssn: employees.ssn,
        nhiId: employees.nhiId,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payRunId, runId)));
  }

  async computeChecks(tx: Tx, tenantId: string, run: Run): Promise<RunCheck[]> {
    const slips = await this.slipsOf(tx, tenantId, run.id);
    const prev = await this.previousRun(tx, tenantId, run);
    const prevSlips = prev ? await this.slipsOf(tx, tenantId, prev.id) : [];
    const prevNet = new Map(prevSlips.map((p) => [p.employeeId, p.netPay]));
    const onRun = new Set(slips.map((s) => s.employeeId));
    const out: RunCheck[] = [];
    const name = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;
    const K = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    for (const s of slips) {
      const who = name(s);
      if (s.netPay < 0) out.push({ code: 'NEGATIVE_NET', severity: 'BLOCK', employeeId: s.employeeId, title: `${who}'s net pay is negative (${K(s.netPay)})`, detail: 'Deductions are more than the pay for this period. Reduce or reschedule a deduction, then recalculate.' });
      if (!s.taxId?.trim()) out.push({ code: 'NO_TAX_ID', severity: 'CHECK', employeeId: s.employeeId, title: `${who} has no tax ID`, detail: 'The tax return needs one. Add it on General Info.' });
      const social = SOCIAL_NUMBER[run.countryCode];
      if (social && !s.ssn?.trim()) out.push({ code: 'NO_SSN', severity: 'CHECK', employeeId: s.employeeId, title: `${who} has no ${social}`, detail: `The ${social.replace(' number', '')} return needs one. Add it on General Info.` });
      if (run.countryCode === 'ZM' && !s.nhiId?.trim()) out.push({ code: 'NO_NHI', severity: 'CHECK', employeeId: s.employeeId, title: `${who} has no NHIMA number`, detail: 'Their NHI contribution is included, but the NHIMA return needs the number.' });
      const before = prevNet.get(s.employeeId);
      if (before != null && before > 0) {
        const pct = ((s.netPay - before) / before) * 100;
        if (Math.abs(pct) > NET_CHANGE_FLAG)
          out.push({ code: 'NET_CHANGE', severity: 'CHECK', employeeId: s.employeeId, title: `${who}'s net pay is ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% on the previous run`, detail: `${K(before)} → ${K(s.netPay)}. Check the reason (pay change, unpaid leave, additions or deductions).` });
      } else if (prev) {
        out.push({ code: 'NEW', severity: 'INFO', employeeId: s.employeeId, title: `${who} is new on this payroll`, detail: 'Not on the previous run.' });
      }
      const pr = (s.components as { proration?: { prorated?: boolean; payableDays?: number; periodTotalDays?: number } } | null)?.proration;
      if (pr?.prorated) out.push({ code: 'PRORATED', severity: 'INFO', employeeId: s.employeeId, title: `${who} is paid for ${pr.payableDays} of ${pr.periodTotalDays} days`, detail: 'Joined or left during the period, had a pay change, or took unpaid leave.' });
      for (const a of (s.adjustments as Array<{ type: string; label: string; amount: number; taxable?: boolean }> | null) ?? []) {
        out.push({ code: 'ADJUSTMENT', severity: 'INFO', employeeId: s.employeeId, title: `${who}: ${a.type === 'ADDITION' ? 'addition' : 'deduction'} of ${K(a.amount)}${a.type === 'ADDITION' ? (a.taxable ? ' (taxable)' : ' (not taxed)') : ''}`, detail: a.label });
      }
    }

    // Active people in this country who got no payslip.
    const active = await tx
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.countryCode, run.countryCode), eq(employees.status, 'ACTIVE')));
    for (const e of active) {
      if (!onRun.has(e.id))
        out.push({ code: 'NOT_PAID', severity: 'CHECK', employeeId: e.id, title: `${name(e)} is active but not on this run`, detail: 'No pay rate in effect for the period (Job → Compensation), or not active during it.' });
    }
    if (prev) {
      for (const p of prevSlips) {
        if (!onRun.has(p.employeeId) && !active.some((a) => a.id === p.employeeId))
          out.push({ code: 'LEFT', severity: 'INFO', employeeId: p.employeeId, title: `${name(p)} was on the previous run but not this one`, detail: 'Left, or not active during this period.' });
      }
    }

    // Fixed-term contracts ending within a month of this period.
    const end = iso(run.periodEnd)!;
    const horizon = new Date(`${end}T00:00:00Z`);
    horizon.setUTCMonth(horizon.getUTCMonth() + 1);
    const until = horizon.toISOString().slice(0, 10);
    const contracts = await tx
      .select({ c: employeeContracts, e: employees })
      .from(employeeContracts)
      .innerJoin(employees, eq(employees.id, employeeContracts.employeeId))
      .where(and(eq(employeeContracts.tenantId, tenantId), eq(employees.countryCode, run.countryCode), eq(employees.status, 'ACTIVE')))
      .orderBy(asc(employeeContracts.startDate));
    const latest = new Map<string, (typeof contracts)[number]>();
    for (const r of contracts) latest.set(r.e.id, r);
    for (const { c, e } of latest.values()) {
      if (!c.endDate || c.endDate <= end || c.endDate > until) continue;
      let detail = 'Renew the contract on the Job tab, or plan the exit.';
      if (c.contractType === 'FIXED_TERM') {
        const g = await gratuityFor(tx, c, run.countryCode, c.endDate);
        if (g.eligible && !g.settled) detail = `Gratuity of about ${K(g.amount)} (${g.rate}%) will be paid on the next run unless the contract is renewed.`;
      }
      out.push({ code: 'CONTRACT_ENDING', severity: 'INFO', employeeId: e.id, title: `${name(e)}'s contract ends on ${c.endDate}`, detail });
    }

    const rank: Record<Severity, number> = { BLOCK: 0, CHECK: 1, INFO: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  // ------------------------------------------------------------ state

  /** Approvals given since the run was last submitted. */
  private async currentApprovals(tx: Tx, tenantId: string, runId: string) {
    const events = await tx
      .select()
      .from(payRunEvents)
      .where(and(eq(payRunEvents.tenantId, tenantId), eq(payRunEvents.payRunId, runId)))
      .orderBy(asc(payRunEvents.createdAt));
    let lastSubmit = -1;
    events.forEach((e, i) => {
      if (e.action === 'SUBMITTED') lastSubmit = i;
    });
    const approvals = lastSubmit < 0 ? [] : events.slice(lastSubmit + 1).filter((e) => e.action === 'APPROVED');
    const submitter = lastSubmit < 0 ? null : events[lastSubmit].actorUserId;
    return { events, approvals, submitter };
  }

  /** Whether `user` may give the next approval on a SUBMITTED run, and why not. */
  private async approvalRight(tx: Tx, tenantId: string, run: Run, user: AuthenticatedUser) {
    const settings = await this.settingsRow(tx, tenantId, run.countryCode);
    const { approvers } = await this.approversFor(tx, tenantId, run.countryCode);
    const { approvals, submitter } = await this.currentApprovals(tx, tenantId, run.id);
    const required = run.approvalsRequired ?? settings.approvalsRequired;
    const nextLevel = approvals.length + 1;
    const me = approvers.find((a) => a.userId === user.userId);
    let reason: string | null = null;
    if (run.status !== 'SUBMITTED') reason = 'The run is not waiting for approval.';
    else if (!me) reason = 'You are not an approver for this payroll.';
    else if (approvals.some((a) => a.actorUserId === user.userId)) reason = 'You have already approved this run.';
    else if (settings.preparerCannotApprove && (run.preparedByUserId === user.userId || submitter === user.userId))
      reason = 'You prepared this run, so someone else has to approve it.';
    else if (required > 1 && me.level !== 'ANY' && me.level !== String(nextLevel)) reason = `This run needs a level ${nextLevel} approver.`;
    return { ok: !reason, reason, nextLevel, required, approvals, approvers, settings, isApprover: !!me };
  }

  // ------------------------------------------------------------ detail

  async detail(tenantId: string, user: AuthenticatedUser, runId: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      const right = await this.approvalRight(tx, tenantId, run, user);
      const isPreparer = user.role === 'ADMIN' || user.role === 'HR';
      if (!isPreparer && !right.isApprover) throw new ForbiddenException('Only payroll preparers and approvers can open a pay run.');

      const slips = await this.slipsOf(tx, tenantId, run.id);
      const prev = await this.previousRun(tx, tenantId, run);
      const prevSlips = prev ? await this.slipsOf(tx, tenantId, prev.id) : [];
      const checks = await this.computeChecks(tx, tenantId, run);
      const { events, approvals } = await this.currentApprovals(tx, tenantId, run.id);
      const [prep] = run.preparedByUserId
        ? await tx
            .select({ email: users.email, f: employees.firstName, l: employees.lastName, uf: users.firstName, ul: users.lastName })
            .from(users)
            .leftJoin(employees, eq(employees.id, users.employeeId))
            .where(eq(users.id, run.preparedByUserId))
            .limit(1)
        : [];
      const preparedBy = prep ? ((prep.f ?? prep.uf) ? `${prep.f ?? prep.uf} ${prep.l ?? prep.ul ?? ''}`.trim() : prep.email) : null;
      const blocking = checks.filter((c) => c.severity === 'BLOCK').length;

      return {
        run,
        preparedBy,
        totals: totalsOf(slips),
        previous: prev
          ? {
              id: prev.id,
              periodStart: prev.periodStart,
              periodEnd: prev.periodEnd,
              status: prev.status,
              totals: totalsOf(prevSlips),
              netByEmployee: Object.fromEntries(prevSlips.map((p) => [p.employeeId, p.netPay])),
            }
          : null,
        checks,
        events,
        approval: {
          required: run.approvalsRequired ?? right.settings.approvalsRequired,
          reasons: run.approvalReasons ?? [],
          given: approvals.map((a) => ({ level: a.level, name: a.actorName, at: a.createdAt, comment: a.comment })),
          nextLevel: right.nextLevel,
          approvers: right.approvers.map((a) => ({ name: a.name, level: a.level, jobTitle: a.jobTitle })),
          sendBackNeedsComment: right.settings.sendBackNeedsComment,
        },
        can: {
          recalculate: isPreparer && run.status === 'DRAFT',
          edit: isPreparer && run.status === 'DRAFT',
          delete: isPreparer && run.status === 'DRAFT',
          submit: isPreparer && run.status === 'DRAFT' && blocking === 0 && slips.length > 0,
          withdraw: isPreparer && run.status === 'SUBMITTED',
          approve: right.ok,
          approveReason: right.reason,
          sendBack: run.status === 'SUBMITTED' && (right.isApprover || user.role === 'ADMIN'),
          reopen: run.status === 'APPROVED' && (right.isApprover || user.role === 'ADMIN'),
          markPaid: isPreparer && run.status === 'APPROVED',
        },
      };
    });
  }

  /** Runs waiting for this user's approval (dashboard). */
  async myApprovals(tenantId: string, user: AuthenticatedUser) {
    return withTenant(tenantId, async (tx) => {
      const waiting = await tx
        .select()
        .from(payRuns)
        .where(and(eq(payRuns.tenantId, tenantId), eq(payRuns.status, 'SUBMITTED')))
        .orderBy(asc(payRuns.submittedAt));
      const out = [];
      for (const run of waiting) {
        const right = await this.approvalRight(tx, tenantId, run, user);
        if (!right.ok) continue;
        const slips = await this.slipsOf(tx, tenantId, run.id);
        out.push({
          id: run.id,
          countryCode: run.countryCode,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          payDate: run.payDate,
          submittedAt: run.submittedAt,
          level: right.nextLevel,
          required: right.required,
          totals: totalsOf(slips),
        });
      }
      return out;
    });
  }

  // ------------------------------------------------------------ actions

  async submit(tenantId: string, user: AuthenticatedUser, runId: string, comment?: string, acknowledgeChecks?: boolean) {
    const result = await withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'DRAFT') throw new BadRequestException('Only a draft pay run can be submitted.');
      const slips = await this.slipsOf(tx, tenantId, run.id);
      if (!slips.length) throw new BadRequestException('This run has no payslips to approve.');
      const checks = await this.computeChecks(tx, tenantId, run);
      const blocking = checks.filter((c) => c.severity === 'BLOCK');
      if (blocking.length) throw new BadRequestException(`${blocking.length} issue${blocking.length === 1 ? '' : 's'} must be fixed before this run can be submitted.`);
      const toCheck = checks.filter((c) => c.severity === 'CHECK');
      if (toCheck.length && !acknowledgeChecks)
        throw new BadRequestException(`${toCheck.length} item${toCheck.length === 1 ? '' : 's'} still need checking. Confirm you have reviewed them to submit.`);

      const settings = await this.settingsRow(tx, tenantId, run.countryCode);
      const totals = totalsOf(slips);
      const reasons: string[] = [];
      if (settings.secondWhenCostOver != null && totals.cost > settings.secondWhenCostOver)
        reasons.push(`Total cost is over ${settings.secondWhenCostOver.toLocaleString('en-US')}`);
      if (settings.secondWhenIncreasePct != null) {
        const prev = await this.previousRun(tx, tenantId, run);
        if (prev) {
          const pt = totalsOf(await this.slipsOf(tx, tenantId, prev.id));
          if (pt.cost > 0) {
            const up = ((totals.cost - pt.cost) / pt.cost) * 100;
            if (up > settings.secondWhenIncreasePct) reasons.push(`Total cost is up ${up.toFixed(1)}% on the previous run`);
          }
        }
      }
      if (settings.secondWhenOverride && toCheck.length) reasons.push(`${toCheck.length} check${toCheck.length === 1 ? ' was' : 's were'} accepted at submission`);
      const required = settings.approvalsRequired >= 2 || reasons.length ? 2 : 1;

      const [updated] = await tx
        .update(payRuns)
        .set({ status: 'SUBMITTED', submittedAt: new Date(), approvalsRequired: required, approvalReasons: required > 1 ? reasons : [], submittedChecks: checks })
        .where(eq(payRuns.id, run.id))
        .returning();
      await recordEvent(tx, tenantId, run.id, user, 'SUBMITTED', { comment: comment?.trim() || null, data: { checksAccepted: toCheck.length, required } });
      const { approvers } = await this.approversFor(tx, tenantId, run.countryCode);
      const notify = settings.notifyOnSubmit
        ? approvers.filter((a) => (required === 1 || a.level !== '2') && !(settings.preparerCannotApprove && (a.userId === user.userId || a.userId === run.preparedByUserId)))
        : [];
      return { run: updated, notify, totals };
    });
    for (const a of result.notify) {
      await this.safeMail(a.email, `Pay run waiting for your approval — ${label(result.run)}`, `Hi ${a.name},\n\nThe ${label(result.run)} pay run (net pay ${result.totals.net.toLocaleString('en-US', { minimumFractionDigits: 2 })}) has been submitted and needs ${result.run.approvalsRequired === 2 ? 'two approvals' : 'your approval'}.\n\nReview it at ${WEB_APP_URL}/payroll/runs/${result.run.id}`);
    }
    return result.run;
  }

  async approve(tenantId: string, user: AuthenticatedUser, runId: string, comment?: string) {
    const result = await withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      const right = await this.approvalRight(tx, tenantId, run, user);
      if (!right.ok) throw new ForbiddenException(right.reason ?? 'You cannot approve this run.');
      await recordEvent(tx, tenantId, run.id, user, 'APPROVED', { level: right.nextLevel, comment: comment?.trim() || null });
      const done = right.nextLevel >= right.required;
      let updated = run;
      if (done) {
        [updated] = await tx
          .update(payRuns)
          .set({ status: 'APPROVED', approvedAt: new Date(), approvedById: user.employeeId ?? null })
          .where(eq(payRuns.id, run.id))
          .returning();
      }
      const next = done
        ? []
        : right.approvers.filter((a) => a.userId !== user.userId && (a.level === 'ANY' || a.level === String(right.nextLevel + 1)) && !(right.settings.preparerCannotApprove && a.userId === run.preparedByUserId));
      return { run: updated, done, level: right.nextLevel, next, notifyPreparer: right.settings.notifyOnDecision && done };
    });
    if (result.notifyPreparer) await this.mailPreparer(tenantId, result.run, 'approved', `The ${label(result.run)} pay run has been approved and is now locked.`);
    for (const a of result.next) {
      await this.safeMail(a.email, `Pay run waiting for your approval — ${label(result.run)}`, `Hi ${a.name},\n\nThe ${label(result.run)} pay run has its first approval and needs a second.\n\nReview it at ${WEB_APP_URL}/payroll/runs/${result.run.id}`);
    }
    return result.run;
  }

  async sendBack(tenantId: string, user: AuthenticatedUser, runId: string, comment?: string) {
    const result = await withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'SUBMITTED') throw new BadRequestException('Only a run waiting for approval can be sent back.');
      const right = await this.approvalRight(tx, tenantId, run, user);
      if (!right.isApprover && user.role !== 'ADMIN') throw new ForbiddenException('Only an approver can send a run back.');
      if (right.settings.sendBackNeedsComment && !comment?.trim()) throw new BadRequestException('Say why the run is being sent back.');
      const [updated] = await tx.update(payRuns).set({ status: 'DRAFT', submittedAt: null }).where(eq(payRuns.id, run.id)).returning();
      await recordEvent(tx, tenantId, run.id, user, 'SENT_BACK', { comment: comment?.trim() || null });
      return { run: updated, notify: right.settings.notifyOnDecision };
    });
    if (result.notify) await this.mailPreparer(tenantId, result.run, 'sent back', `The ${label(result.run)} pay run was sent back: ${comment?.trim() || '(no comment)'}`);
    return result.run;
  }

  /** The preparer takes a submitted run back to draft before it's decided. */
  async withdraw(tenantId: string, user: AuthenticatedUser, runId: string, comment?: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'SUBMITTED') throw new BadRequestException('Only a run waiting for approval can be withdrawn.');
      const [updated] = await tx.update(payRuns).set({ status: 'DRAFT', submittedAt: null }).where(eq(payRuns.id, run.id)).returning();
      await recordEvent(tx, tenantId, run.id, user, 'REOPENED', { comment: comment?.trim() || 'Withdrawn by the preparer', data: { withdrawn: true } });
      return updated;
    });
  }

  async reopen(tenantId: string, user: AuthenticatedUser, runId: string, reason?: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'APPROVED') throw new BadRequestException(run.status === 'PAID' ? 'A paid run cannot be reopened.' : 'Only an approved run can be reopened.');
      const right = await this.approvalRight(tx, tenantId, run, user);
      if (!right.isApprover && user.role !== 'ADMIN') throw new ForbiddenException('Only an approver or an Admin can reopen an approved run.');
      if (!reason?.trim()) throw new BadRequestException('Give a reason for reopening the run.');
      const [updated] = await tx
        .update(payRuns)
        .set({ status: 'DRAFT', approvedAt: null, approvedById: null, submittedAt: null, approvalsRequired: null, approvalReasons: [] })
        .where(eq(payRuns.id, run.id))
        .returning();
      await recordEvent(tx, tenantId, run.id, user, 'REOPENED', { comment: reason.trim() });
      return updated;
    });
  }

  async markPaid(tenantId: string, user: AuthenticatedUser, runId: string) {
    return withTenant(tenantId, async (tx) => {
      const run = await loadRun(tx, tenantId, runId);
      if (run.status !== 'APPROVED') throw new BadRequestException('Only an approved run can be marked as paid.');
      const [updated] = await tx.update(payRuns).set({ status: 'PAID', paidAt: new Date() }).where(eq(payRuns.id, run.id)).returning();
      await recordEvent(tx, tenantId, run.id, user, 'PAID');
      return updated;
    });
  }

  // ------------------------------------------------------------ mail

  private async mailPreparer(tenantId: string, run: Run, what: string, text: string) {
    if (!run.preparedByUserId) return;
    const [u] = await withTenant(tenantId, (tx) => tx.select({ email: users.email }).from(users).where(eq(users.id, run.preparedByUserId!)).limit(1));
    if (u) await this.safeMail(u.email, `Pay run ${what} — ${label(run)}`, `${text}\n\n${WEB_APP_URL}/payroll/runs/${run.id}`);
  }

  private async safeMail(to: string, subject: string, text: string) {
    try {
      await this.mail.send({ to, subject, text });
    } catch (err) {
      this.log.warn(`Could not email ${to}: ${(err as Error).message}`);
    }
  }
}

function label(run: Run) {
  const d = new Date(run.periodEnd);
  return `${run.countryCode} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}
