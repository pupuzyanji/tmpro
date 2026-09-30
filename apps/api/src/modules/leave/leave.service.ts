import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db, withTenant } from '../../db/client';
import {
  employeeDocuments,
  employees,
  leaveLedger,
  leaveOpeningBatches,
  leaveOpeningLines,
  leavePolicies,
  leaveRequestApprovals,
  leaveRequestDays,
  leaveRequests,
  leaveRuleTemplateItems,
  leaveSettings,
  leaveTypes,
  sickLeaveEpisodes,
  tenantHolidays,
  tenants,
  users,
  workSchedules,
} from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  currentPolicy,
  dailyPayRate,
  daysPerWeek,
  eligibleForCategory,
  workWeekAllowed,
  entitlementFor,
  EmployeeCtx,
  genderAllowed,
  LeaveTypeRow,
  loadEmployeeCtx,
  loadSettings,
  policiesFor,
  PolicyRow,
  Tx,
  typesForRegime,
} from './engine/context';
import { addDays, addMonths, fmtDay, fullMonthsBetween, ISODate, monthEnd, round2, today } from './engine/dates';
import { evaluate, Evaluation, RequestInput } from './engine/evaluate';
import { overdueLeave, sickCaps, sickCycle, sickUsedInYear, yearlySickRule } from './engine/compliance';
import { hasNationalCalendar, holidaysBetween } from './engine/holidays';
import { anniversaryCycle, balance, cycleBalance, cycleKeyFor, post, reversedIds } from './engine/ledger';
import { createBatch, openingTemplate, postBatch, reverseBatch } from './engine/opening';
import { nextUpfrontGrant, processEmployee } from './engine/process';
import { ensureCountry, ensureTenantLeave, ENGINE_VERSION } from './engine/provision';

export const ADJUSTMENT_REASONS = [
  'MIGRATION_CORRECTION',
  'GOODWILL_GRANT',
  'COLLECTIVE_AGREEMENT',
  'COURT_OR_LABOUR_OFFICE',
  'ERROR_CORRECTION',
  'SERVICE_RECOGNITION',
  'OTHER',
] as const;

const SIX_HOURS = 6 * 60 * 60 * 1000;

export interface RequestPayload {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  startHalf?: boolean;
  endHalf?: boolean;
  eventDate?: string | null;
  multipleBirth?: boolean;
  reason?: string | null;
  employeeId?: string | null; // HR/Admin booking on someone's behalf
  autoApprove?: boolean;
}

type Attachment = { originalname: string; mimetype: string; buffer: Buffer } | undefined;

function iso(v: string | undefined | null): ISODate {
  return (v ?? '').slice(0, 10);
}

function asUtcDate(s: ISODate): Date {
  return new Date(`${s}T00:00:00Z`);
}

@Injectable()
export class LeaveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaveService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private mail: MailService) {}

  // ------------------------------------------------------------------ lifecycle

  onModuleInit() {
    if (process.env.LEAVE_SCHEDULER === 'off') return;
    // Convert/provision every tenant shortly after start-up, then keep
    // accruals and expiries current every six hours.
    setTimeout(() => void this.processAllTenants('startup'), 3000);
    this.timer = setInterval(() => void this.processAllTenants('schedule'), SIX_HOURS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processAllTenants(trigger: string) {
    const all = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
    for (const t of all) {
      try {
        const n = await this.processTenant(t.id);
        this.logger.log(`[leave ${ENGINE_VERSION}] ${trigger}: ${t.name} — ${n} employees processed`);
      } catch (err) {
        this.logger.error(`[leave] ${trigger}: ${t.name} failed: ${(err as Error).message}`);
      }
    }
  }

  async processTenant(tenantId: string): Promise<number> {
    await withTenant(tenantId, (tx) => ensureTenantLeave(tx, tenantId));
    const emps = await withTenant(tenantId, (tx) => tx.select({ id: employees.id }).from(employees).where(eq(employees.tenantId, tenantId)));
    for (const e of emps) {
      await withTenant(tenantId, async (tx) => {
        const ctx = await loadEmployeeCtx(tx, tenantId, e.id, today());
        if (ctx) await processEmployee(tx, ctx, today());
      });
    }
    await withTenant(tenantId, (tx) => tx.update(leaveSettings).set({ lastProcessedAt: new Date() }).where(eq(leaveSettings.tenantId, tenantId)));
    return emps.length;
  }

  /** Every read makes sure the employee's ledger is current first. */
  private async freshCtx(tx: Tx, tenantId: string, employeeId: string): Promise<EmployeeCtx> {
    let ctx = await loadEmployeeCtx(tx, tenantId, employeeId, today());
    if (!ctx) throw new NotFoundException('Employee not found.');
    const types = await typesForRegime(tx, tenantId, ctx.regime);
    if (types.length === 0) {
      await ensureTenantLeave(tx, tenantId);
      ctx = (await loadEmployeeCtx(tx, tenantId, employeeId, today()))!;
    }
    await processEmployee(tx, ctx, today());
    return ctx;
  }

  // ------------------------------------------------------------------ overview

  async overview(tenantId: string, employeeId: string) {
    return withTenant(tenantId, async (tx) => {
      const emp = await this.freshCtx(tx, tenantId, employeeId);
      const settings = await loadSettings(tx, tenantId);
      const types = await typesForRegime(tx, tenantId, emp.regime);
      const policies = await policiesFor(tx, tenantId, types.map((t) => t.id));
      const pending = await tx
        .select()
        .from(leaveRequests)
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.employeeId, emp.id), eq(leaveRequests.status, 'PENDING')));
      const now = today();
      const out = [];
      for (const t of types) {
        const policy = currentPolicy(policies.get(t.id), now);
        if (!policy) continue;
        const eligible = genderAllowed(t, emp) && eligibleForCategory(policy, emp) && workWeekAllowed(policy, emp);
        const pendingUnits = round2(pending.filter((r) => r.leaveTypeId === t.id).reduce((s, r) => s + Number(r.days), 0));
        const base = {
          leaveTypeId: t.id,
          code: t.code,
          name: t.name,
          kind: t.kind,
          unitBasis: t.unitBasis,
          description: t.description,
          eligible,
          isPaid: t.isPaid,
          reasonRequired: t.reasonRequired,
          reasonAllowed: t.reasonAllowed,
          attachmentRequired: t.attachmentRequired,
          attachmentFromUnits: t.attachmentFromUnits,
          approvalFlow: t.approvalFlow,
          entitlement: entitlementFor(policy, emp),
          cycle: policy.cycle,
          eventRules: policy.eventRules,
          minServiceMonths: policy.minServiceMonths,
          availableFrom:
            policy.minServiceMonths > 0 && fullMonthsBetween(emp.serviceStart, now) < policy.minServiceMonths
              ? addMonths(emp.serviceStart, policy.minServiceMonths)
              : t.kind === 'ACCRUING' && policy.usableAfterMonths > 0 && fullMonthsBetween(emp.serviceStart, now) < policy.usableAfterMonths
                ? addMonths(emp.serviceStart, policy.usableAfterMonths)
                : null,
          pending: pendingUnits,
        };
        if (t.kind === 'ACCRUING') {
          const bal = await balance(tx, tenantId, emp.id, t.id);
          out.push({
            ...base,
            balance: bal,
            available: round2(bal - pendingUnits),
            nextAccrual:
              !eligible || emp.leftOn || entitlementFor(policy, emp) <= 0
                ? null
                : policy.accrualFrequency === 'MONTHLY'
                  ? { date: monthEnd(now), units: round2(entitlementFor(policy, emp) / 12) }
                  : policy.accrualFrequency === 'UPFRONT'
                    ? {
                        date: nextUpfrontGrant(emp, policy, now),
                        units:
                          policy.payRules?.maxBalance != null
                            ? round2(Math.max(0, Math.min(entitlementFor(policy, emp), Number(policy.payRules.maxBalance) - bal)))
                            : entitlementFor(policy, emp),
                      }
                    : null,
            carryForwardMax: policy.carryForwardMax,
            overdue: eligible ? await overdueLeave(tx, emp, t, policy, now) : null,
          });
        } else if (t.kind === 'ALLOWANCE') {
          const key = cycleKeyFor(policy.cycle, now, emp.serviceStart);
          const cb = await cycleBalance(tx, tenantId, emp.id, t.id, key);
          out.push({
            ...base,
            period: key.startsWith('Y') ? key.slice(1) : key.startsWith('M') ? key.slice(1) : key,
            allotted: cb.allotted,
            used: cb.used,
            balance: cb.remaining,
            available: round2(cb.remaining - pendingUnits),
          });
        } else if (t.kind === 'EPISODE') {
          const [ep] = await tx
            .select()
            .from(sickLeaveEpisodes)
            .where(
              and(
                eq(sickLeaveEpisodes.tenantId, tenantId),
                eq(sickLeaveEpisodes.employeeId, emp.id),
                ne(sickLeaveEpisodes.status, 'CLOSED'),
                gte(sickLeaveEpisodes.lastDay, addDays(now, -settings.sickEpisodeLinkDays - 1)),
              ),
            )
            .orderBy(desc(sickLeaveEpisodes.lastDay))
            .limit(1);
          const yearly = yearlySickRule(policy);
          if (yearly) {
            const dpw = daysPerWeek(emp) || 5;
            const payFrom = addMonths(emp.serviceStart, yearly.minServiceMonths);
            const year = sickCycle(emp.serviceStart, now, yearly.cycleYears);
            const used = now >= payFrom ? await sickUsedInYear(tx, emp, t, year.start, null, year.end) : { full: 0, half: 0 };
            const caps = sickCaps(yearly, dpw);
            out.push({
              ...base,
              sickYear: {
                fullDays: caps.full,
                halfDays: caps.half,
                cycleYears: yearly.cycleYears,
                earlyUntil: yearly.earlyMonths ? addMonths(emp.serviceStart, yearly.earlyMonths) : null,
                fullUsed: used.full,
                halfUsed: used.half,
                yearStart: year.start,
                yearEnd: addDays(year.end, -1),
                payFrom,
                section: yearly.section,
              },
            });
            continue;
          }
          const rules = (policy.payRules?.[emp.contractTerm] ?? {}) as Record<string, number>;
          out.push({
            ...base,
            contractTerm: emp.contractTerm,
            tiers: rules,
            episode: ep
              ? { startedOn: ep.startedOn, lastDay: ep.lastDay, fullUsed: ep.fullPayUsed, halfUsed: ep.halfPayUsed, status: ep.status }
              : null,
          });
        } else {
          out.push(base);
        }
      }
      return {
        employee: {
          id: emp.id,
          name: emp.name,
          countryCode: emp.countryCode,
          regime: emp.regime,
          category: emp.category,
          contractTerm: emp.contractTerm,
          serviceStart: emp.serviceStart,
          leftOn: emp.leftOn,
          schedule: emp.scheduleName,
          gender: emp.gender,
          hasNationalCalendar: hasNationalCalendar(emp.countryCode),
        },
        types: out,
      };
    });
  }

  // ------------------------------------------------------------------ requests

  private parseInput(p: RequestPayload): RequestInput {
    return {
      start: iso(p.startDate),
      end: iso(p.endDate),
      startHalf: !!p.startHalf,
      endHalf: !!p.endHalf,
      eventDate: p.eventDate ? iso(p.eventDate) : null,
      multipleBirth: !!p.multipleBirth,
    };
  }

  private async typeAndPolicies(tx: Tx, tenantId: string, emp: EmployeeCtx, leaveTypeId: string) {
    const types = await typesForRegime(tx, tenantId, emp.regime);
    const type = types.find((t) => t.id === leaveTypeId);
    if (!type) throw new BadRequestException('That leave type is not available for this employee.');
    const versions = (await policiesFor(tx, tenantId, [type.id])).get(type.id) ?? [];
    return { type, versions };
  }

  private targetEmployee(user: AuthenticatedUser, p: RequestPayload): string {
    if (p.employeeId && p.employeeId !== user.employeeId) {
      if (user.role !== 'ADMIN' && user.role !== 'HR') throw new ForbiddenException('Only HR or an Admin can book leave for someone else.');
      return p.employeeId;
    }
    if (!user.employeeId) throw new ForbiddenException('This account has no employee profile — choose a person to book leave for.');
    return user.employeeId;
  }

  async preview(user: AuthenticatedUser, p: RequestPayload) {
    const tenantId = user.tenantId;
    const employeeId = this.targetEmployee(user, p);
    return withTenant(tenantId, async (tx) => {
      const emp = await this.freshCtx(tx, tenantId, employeeId);
      const settings = await loadSettings(tx, tenantId);
      const { type, versions } = await this.typeAndPolicies(tx, tenantId, emp, p.leaveTypeId);
      return evaluate(tx, emp, type, versions, this.parseInput(p), settings);
    });
  }

  async create(user: AuthenticatedUser, p: RequestPayload, file: Attachment) {
    const tenantId = user.tenantId;
    const employeeId = this.targetEmployee(user, p);
    const onBehalf = employeeId !== user.employeeId;
    const result = await withTenant(tenantId, async (tx) => {
      const emp = await this.freshCtx(tx, tenantId, employeeId);
      const settings = await loadSettings(tx, tenantId);
      const { type, versions } = await this.typeAndPolicies(tx, tenantId, emp, p.leaveTypeId);
      const input = this.parseInput(p);
      const ev = await evaluate(tx, emp, type, versions, input, settings);
      if (!ev.ok) throw new BadRequestException(ev.errors.join(' '));
      const reason = type.reasonAllowed ? (p.reason ?? '').trim() || null : null;
      if (type.reasonRequired && !reason) throw new BadRequestException(`Please give a reason for ${type.name}.`);
      if (ev.attachmentRequired && !file && !onBehalf) {
        throw new BadRequestException(`${type.name} needs a supporting document (e.g. a medical certificate or birth record).`);
      }

      const attachmentIds: string[] = [];
      if (file) {
        const [doc] = await tx
          .insert(employeeDocuments)
          .values({
            tenantId,
            employeeId,
            category: 'OTHER',
            tag: 'Leave supporting document',
            label: `${type.name}: ${fmtDay(input.start)} – ${fmtDay(input.end)}`.slice(0, 200),
            fileName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            dataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
            uploadedById: user.employeeId ?? null,
          })
          .returning({ id: employeeDocuments.id });
        attachmentIds.push(doc.id);
      }

      let steps = ((type.approvalFlow as string[]) ?? []).filter((s) => s !== 'SUPERVISOR' || !!emp.managerId);
      if (onBehalf && p.autoApprove) steps = [];

      const [row] = await tx
        .insert(leaveRequests)
        .values({
          tenantId,
          employeeId,
          leaveTypeId: type.id,
          policyId: ev.policyId,
          startDate: asUtcDate(input.start),
          endDate: asUtcDate(input.end),
          days: ev.units,
          reason,
          startHalf: !!input.startHalf,
          endHalf: !!input.endHalf,
          eventDate: input.eventDate ?? null,
          multipleBirth: !!input.multipleBirth,
          attachmentDocumentIds: attachmentIds,
          requestedByUserId: user.userId,
          approvalSteps: steps,
          currentStep: 0,
          payBreakdown: ev.payBreakdown,
        })
        .returning();
      await this.writeDays(tx, tenantId, row.id, employeeId, ev);

      let finalRow = row;
      if (steps.length === 0) {
        await tx.insert(leaveRequestApprovals).values({
          tenantId,
          requestId: row.id,
          step: 0,
          stepRole: 'AUTO',
          decision: 'AUTO',
          decidedByUserId: onBehalf ? user.userId : null,
          comment: onBehalf ? 'Booked and approved by HR' : 'Approved automatically (no approval needed for this leave type)',
        });
        finalRow = await this.finalize(tx, tenantId, row.id, emp, type, versions, user.userId, settings);
      }
      const manager = emp.managerId
        ? (await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, emp.managerId))).limit(1))[0]
        : undefined;
      return { row: finalRow, emp, type, ev, steps, manager };
    });

    // Notifications (best-effort, outside the transaction).
    const { row, emp, type, steps, manager } = result;
    const span = `${fmtDay(iso(row.startDate.toISOString()))} – ${fmtDay(iso(row.endDate.toISOString()))}`;
    if (row.status === 'PENDING') {
      const first = steps[0];
      const to = first === 'SUPERVISOR' ? (manager?.email ? [manager.email] : []) : await this.hrEmails(tenantId);
      for (const addr of to) {
        await this.mail.send({
          to: addr,
          subject: `Leave request from ${emp.name}`,
          text: `${emp.name} has requested ${row.days} day(s) of ${type.name} (${span}).\n\nSign in to tmPro → Leave to approve or decline.`,
        });
      }
    } else if (type.code === 'MOTHERS_DAY' && manager?.email) {
      await this.mail.send({ to: manager.email, subject: `${emp.name} is taking Mother's Day`, text: `${emp.name} is taking Mother's Day on ${span}. No approval is needed (Employment Code Act s.47).` });
    }
    return result.row;
  }

  private async writeDays(tx: Tx, tenantId: string, requestId: string, employeeId: string, ev: Evaluation) {
    await tx.delete(leaveRequestDays).where(eq(leaveRequestDays.requestId, requestId));
    if (ev.days.length) {
      await tx.insert(leaveRequestDays).values(ev.days.map((d) => ({ tenantId, requestId, employeeId, day: d.day, units: d.units, payFactor: d.payFactor })));
    }
  }

  private async hrEmails(tenantId: string): Promise<string[]> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select({ email: users.email }).from(users).where(and(eq(users.tenantId, tenantId), inArray(users.role, ['HR', 'ADMIN']))),
    );
    return rows.map((r) => r.email);
  }

  /** Final approval: re-check against the ledger as it is now, then post. */
  private async finalize(
    tx: Tx,
    tenantId: string,
    requestId: string,
    emp: EmployeeCtx,
    type: LeaveTypeRow,
    versions: PolicyRow[],
    userId: string,
    settings: Awaited<ReturnType<typeof loadSettings>>,
  ) {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId)).limit(1);
    const input: RequestInput = {
      start: iso(req.startDate.toISOString()),
      end: iso(req.endDate.toISOString()),
      startHalf: req.startHalf,
      endHalf: req.endHalf,
      eventDate: req.eventDate,
      multipleBirth: req.multipleBirth,
      excludeRequestId: req.id,
    };
    const ev = await evaluate(tx, emp, type, versions, input, settings);
    if (!ev.ok) throw new BadRequestException(`Can't approve: ${ev.errors.join(' ')}`);
    await this.writeDays(tx, tenantId, req.id, emp.id, ev);

    const base = { tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: ev.policyId, sourceType: 'REQUEST' as const, sourceId: req.id, createdBy: userId };
    let episodeId: string | null = null;
    if (type.kind === 'EPISODE') {
      // Zambia's per-illness tiers flag a medical-discharge review once sick
      // pay runs out; Malawi's yearly pot (v028.C) has no such rule.
      const pol = versions.find((v) => v.id === ev.policyId);
      const reviewNeeded = ev.payBreakdown.UNPAID > 0 && !(pol && yearlySickRule(pol));
      if (ev.episode?.id) {
        episodeId = ev.episode.id;
        await tx
          .update(sickLeaveEpisodes)
          .set({
            lastDay: sql`greatest(${sickLeaveEpisodes.lastDay}, ${input.end}::date)`,
            fullPayUsed: sql`${sickLeaveEpisodes.fullPayUsed} + ${ev.payBreakdown.FULL}`,
            halfPayUsed: sql`${sickLeaveEpisodes.halfPayUsed} + ${ev.payBreakdown.HALF}`,
            unpaidUsed: sql`${sickLeaveEpisodes.unpaidUsed} + ${ev.payBreakdown.UNPAID}`,
            status: reviewNeeded ? 'DISCHARGE_REVIEW' : 'OPEN',
          })
          .where(eq(sickLeaveEpisodes.id, episodeId));
      } else {
        const [ep] = await tx
          .insert(sickLeaveEpisodes)
          .values({
            tenantId,
            employeeId: emp.id,
            startedOn: input.start,
            lastDay: input.end,
            fullPayUsed: ev.payBreakdown.FULL,
            halfPayUsed: ev.payBreakdown.HALF,
            unpaidUsed: ev.payBreakdown.UNPAID,
            status: reviewNeeded ? 'DISCHARGE_REVIEW' : 'OPEN',
          })
          .returning();
        episodeId = ep.id;
      }
      for (const tier of ['FULL', 'HALF', 'UNPAID'] as const) {
        if (ev.payBreakdown[tier] > 0) {
          await post(tx, { ...base, entryType: 'USAGE', units: -ev.payBreakdown[tier], effectiveDate: input.start, cycleKey: `E${episodeId}`, payTier: tier, idemKey: `REQ:${req.id}:${tier}` });
        }
      }
    } else {
      if (type.kind === 'EVENT' && input.eventDate) {
        await post(tx, {
          ...base,
          entryType: 'ALLOTMENT',
          units: ev.eventEntitlement ?? 0,
          effectiveDate: input.start < input.eventDate ? input.start : input.eventDate,
          cycleKey: ev.cycleKey,
          idemKey: `EVT:${type.id}:${emp.id}:${input.eventDate}`,
          note: `${type.name} entitlement for this event`,
        });
      }
      const tier = ev.payBreakdown.UNPAID > 0 ? 'UNPAID' : ev.payBreakdown.HALF > 0 ? 'HALF' : 'FULL';
      await post(tx, { ...base, entryType: 'USAGE', units: -ev.units, effectiveDate: input.start, cycleKey: ev.cycleKey, payTier: tier, idemKey: `REQ:${req.id}:USAGE` });
    }

    const [updated] = await tx
      .update(leaveRequests)
      .set({
        status: 'APPROVED',
        decidedAt: new Date(),
        days: ev.units,
        payBreakdown: ev.payBreakdown,
        episodeId,
        policyId: ev.policyId,
        currentStep: (req.approvalSteps as string[]).length,
      })
      .where(eq(leaveRequests.id, req.id))
      .returning();
    return updated;
  }

  private canActOnStep(user: AuthenticatedUser, step: string | undefined, emp: EmployeeCtx): boolean {
    if (user.role === 'ADMIN' || user.role === 'HR') return true;
    if (step === 'SUPERVISOR') return !!user.employeeId && user.employeeId === emp.managerId;
    return false;
  }

  async decide(user: AuthenticatedUser, requestId: string, decision: 'APPROVED' | 'DECLINED', comment?: string) {
    const tenantId = user.tenantId;
    const out = await withTenant(tenantId, async (tx) => {
      const [req] = await tx.select().from(leaveRequests).where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, requestId))).limit(1);
      if (!req) throw new NotFoundException('Leave request not found.');
      if (req.status !== 'PENDING') throw new BadRequestException('This request has already been decided.');
      if (req.employeeId === user.employeeId) throw new ForbiddenException("You can't decide your own leave request.");
      const emp = await this.freshCtx(tx, tenantId, req.employeeId);
      const steps = (req.approvalSteps as string[]) ?? [];
      const step = steps[req.currentStep] ?? 'SUPERVISOR';
      if (!this.canActOnStep(user, step, emp)) {
        throw new ForbiddenException(step === 'HR' ? 'This request is waiting for HR.' : 'Only their supervisor, HR or an Admin can decide this request.');
      }
      await tx.insert(leaveRequestApprovals).values({
        tenantId,
        requestId,
        step: req.currentStep,
        stepRole: step,
        decidedByUserId: user.userId,
        decision,
        comment: comment?.trim() || null,
      });
      const { type, versions } = await this.typeAndPolicies(tx, tenantId, emp, req.leaveTypeId);
      if (decision === 'DECLINED') {
        const [row] = await tx
          .update(leaveRequests)
          .set({ status: 'DECLINED', decidedAt: new Date(), approverId: user.employeeId ?? null, decisionComment: comment?.trim() || null })
          .where(eq(leaveRequests.id, requestId))
          .returning();
        return { row, emp, type, final: true };
      }
      if (req.currentStep + 1 < steps.length) {
        const [row] = await tx
          .update(leaveRequests)
          .set({ currentStep: req.currentStep + 1, approverId: user.employeeId ?? null })
          .where(eq(leaveRequests.id, requestId))
          .returning();
        return { row, emp, type, final: false };
      }
      const settings = await loadSettings(tx, tenantId);
      const row = await this.finalize(tx, tenantId, requestId, emp, type, versions, user.userId, settings);
      await tx.update(leaveRequests).set({ approverId: user.employeeId ?? null, decisionComment: comment?.trim() || null }).where(eq(leaveRequests.id, requestId));
      return { row, emp, type, final: true };
    });

    const span = `${fmtDay(iso(out.row.startDate.toISOString()))} – ${fmtDay(iso(out.row.endDate.toISOString()))}`;
    if (out.final && out.emp.email) {
      const verb = decision === 'APPROVED' ? 'approved' : 'declined';
      await this.mail.send({
        to: out.emp.email,
        subject: `Your leave request has been ${verb}`,
        text: `Your request for ${out.row.days} day(s) of ${out.type.name} (${span}) has been ${verb}.${comment ? `\n\nComment: ${comment}` : ''}\n\nSign in to tmPro for details.`,
      });
    } else if (!out.final) {
      for (const addr of await this.hrEmails(tenantId)) {
        await this.mail.send({ to: addr, subject: `Leave request from ${out.emp.name} needs HR approval`, text: `${out.emp.name}'s ${out.type.name} request (${span}) was approved by their supervisor and now needs HR approval.\n\nSign in to tmPro → Leave.` });
      }
    }
    return out.row;
  }

  async cancel(user: AuthenticatedUser, requestId: string, reason?: string) {
    const tenantId = user.tenantId;
    return withTenant(tenantId, async (tx) => {
      const [req] = await tx.select().from(leaveRequests).where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, requestId))).limit(1);
      if (!req) throw new NotFoundException('Leave request not found.');
      const isHr = user.role === 'ADMIN' || user.role === 'HR';
      const own = req.employeeId === user.employeeId;
      if (!own && !isHr) throw new ForbiddenException('You can only cancel your own leave.');
      if (!['PENDING', 'APPROVED'].includes(req.status)) throw new BadRequestException('Only pending or approved leave can be cancelled.');
      if (req.status === 'APPROVED' && !isHr && iso(req.startDate.toISOString()) <= today()) {
        throw new BadRequestException('This leave has already started — ask HR to cancel or adjust it.');
      }
      if (req.status === 'APPROVED') {
        const entries = await tx
          .select()
          .from(leaveLedger)
          .where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveLedger.sourceType, 'REQUEST'), eq(leaveLedger.sourceId, req.id)));
        const done = await reversedIds(tx, entries.map((e) => e.id));
        for (const e of entries) {
          if (done.has(e.id) || e.reversesId) continue;
          // An event allotment is shared by every request for that event —
          // only give it back if no other approved request uses it.
          if (e.entryType === 'ALLOTMENT') continue;
          await post(tx, {
            tenantId,
            employeeId: e.employeeId,
            leaveTypeId: e.leaveTypeId,
            policyId: e.policyId,
            entryType: 'USAGE_REVERSAL',
            units: -Number(e.units),
            effectiveDate: e.effectiveDate,
            cycleKey: e.cycleKey,
            payTier: e.payTier,
            sourceType: 'REQUEST',
            sourceId: req.id,
            reversesId: e.id,
            note: 'Leave cancelled',
            createdBy: user.userId,
          });
        }
        if (req.episodeId) {
          const b = (req.payBreakdown ?? {}) as Record<string, number>;
          await tx
            .update(sickLeaveEpisodes)
            .set({
              fullPayUsed: sql`greatest(0, ${sickLeaveEpisodes.fullPayUsed} - ${b.FULL ?? 0})`,
              halfPayUsed: sql`greatest(0, ${sickLeaveEpisodes.halfPayUsed} - ${b.HALF ?? 0})`,
              unpaidUsed: sql`greatest(0, ${sickLeaveEpisodes.unpaidUsed} - ${b.UNPAID ?? 0})`,
            })
            .where(eq(sickLeaveEpisodes.id, req.episodeId));
        }
      }
      const [row] = await tx
        .update(leaveRequests)
        .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason?.trim() || null })
        .where(eq(leaveRequests.id, requestId))
        .returning();
      return row;
    });
  }

  // ------------------------------------------------------------------ lists

  private requestRowsFor(tx: Tx, tenantId: string, where: ReturnType<typeof and>) {
    return tx.query.leaveRequests.findMany({
      where,
      with: { leaveType: true, employee: true },
      orderBy: (r, { desc: d }) => d(r.createdAt),
    });
  }

  private shape(r: any) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      employee: r.employee ? { id: r.employee.id, firstName: r.employee.firstName, lastName: r.employee.lastName, photoUrl: r.employee.photoUrl } : undefined,
      leaveType: { id: r.leaveType.id, name: r.leaveType.name, code: r.leaveType.code, kind: r.leaveType.kind },
      startDate: r.startDate,
      endDate: r.endDate,
      startHalf: r.startHalf,
      endHalf: r.endHalf,
      days: r.days,
      reason: r.reason,
      status: r.status,
      eventDate: r.eventDate,
      payBreakdown: r.payBreakdown,
      approvalSteps: r.approvalSteps,
      currentStep: r.currentStep,
      waitingFor: r.status === 'PENDING' ? ((r.approvalSteps as string[])[r.currentStep] ?? null) : null,
      attachmentDocumentIds: r.attachmentDocumentIds,
      decisionComment: r.decisionComment,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt,
    };
  }

  async requestsFor(tenantId: string, employeeId: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await this.requestRowsFor(tx, tenantId, and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.employeeId, employeeId)));
      return rows.map((r) => this.shape(r));
    });
  }

  /** Requests waiting on this user, plus the last 30 days of decisions they can see. */
  async approvals(user: AuthenticatedUser) {
    const tenantId = user.tenantId;
    return withTenant(tenantId, async (tx) => {
      const isHr = user.role === 'ADMIN' || user.role === 'HR';
      let scope: string[] | null = null;
      if (!isHr) {
        if (!user.employeeId) return { waiting: [], recent: [] };
        const reports = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, user.employeeId)));
        scope = reports.map((r) => r.id);
        if (scope.length === 0) return { waiting: [], recent: [] };
      }
      const rows = await this.requestRowsFor(
        tx,
        tenantId,
        and(
          eq(leaveRequests.tenantId, tenantId),
          gte(leaveRequests.createdAt, new Date(Date.now() - 120 * 86_400_000)),
          ...(scope ? [inArray(leaveRequests.employeeId, scope)] : []),
        ),
      );
      const shaped = rows.filter((r) => r.employeeId !== user.employeeId).map((r) => this.shape(r));
      const waiting = shaped.filter((r) => r.status === 'PENDING' && (isHr || r.waitingFor === 'SUPERVISOR'));
      const recent = shaped.filter((r) => r.status !== 'PENDING').slice(0, 30);
      return { waiting, recent, waitingOnOthers: shaped.filter((r) => r.status === 'PENDING' && !waiting.includes(r)) };
    });
  }

  // ------------------------------------------------------------------ ledger & adjustments

  async ledgerFor(tenantId: string, employeeId: string) {
    return withTenant(tenantId, async (tx) => {
      await this.freshCtx(tx, tenantId, employeeId);
      const rows = await tx
        .select({
          id: leaveLedger.id,
          leaveTypeId: leaveLedger.leaveTypeId,
          typeName: leaveTypes.name,
          kind: leaveTypes.kind,
          entryType: leaveLedger.entryType,
          units: leaveLedger.units,
          effectiveDate: leaveLedger.effectiveDate,
          cycleKey: leaveLedger.cycleKey,
          payTier: leaveLedger.payTier,
          sourceType: leaveLedger.sourceType,
          reasonCode: leaveLedger.reasonCode,
          note: leaveLedger.note,
          reversesId: leaveLedger.reversesId,
          createdAt: leaveLedger.createdAt,
          createdBy: leaveLedger.createdBy,
        })
        .from(leaveLedger)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveLedger.leaveTypeId))
        .where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveLedger.employeeId, employeeId)))
        .orderBy(desc(leaveLedger.effectiveDate), desc(leaveLedger.createdAt));
      const reversed = await reversedIds(tx, rows.map((r) => r.id));
      const userIds = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
      const names = new Map<string, string>();
      if (userIds.length) {
        const us = await tx
          .select({ id: users.id, email: users.email, first: employees.firstName, last: employees.lastName, uf: users.firstName, ul: users.lastName })
          .from(users)
          .leftJoin(employees, eq(employees.id, users.employeeId))
          .where(inArray(users.id, userIds));
        for (const u of us) names.set(u.id, u.first ? `${u.first} ${u.last}` : u.uf ? `${u.uf} ${u.ul ?? ''}`.trim() : u.email);
      }
      return rows.map((r) => ({ ...r, reversed: reversed.has(r.id), createdByName: r.createdBy ? names.get(r.createdBy) ?? null : 'tmPro' }));
    });
  }

  async adjust(
    user: AuthenticatedUser,
    employeeId: string,
    body: { leaveTypeId: string; units: number; effectiveDate: string; reasonCode: string; note: string },
  ) {
    const tenantId = user.tenantId;
    if (!ADJUSTMENT_REASONS.includes(body.reasonCode as any)) throw new BadRequestException('Choose a reason.');
    if (!body.note?.trim()) throw new BadRequestException('Add a note explaining the adjustment.');
    const units = Number(body.units);
    if (!Number.isFinite(units) || units === 0) throw new BadRequestException('Enter the number of days to add (+) or remove (−).');
    if (Math.abs(units) > 365) throw new BadRequestException('That adjustment is too large.');
    const eff = iso(body.effectiveDate) || today();
    return withTenant(tenantId, async (tx) => {
      const emp = await this.freshCtx(tx, tenantId, employeeId);
      const { type, versions } = await this.typeAndPolicies(tx, tenantId, emp, body.leaveTypeId);
      if (!['ACCRUING', 'ALLOWANCE'].includes(type.kind)) throw new BadRequestException(`${type.name} has no balance to adjust.`);
      const policy = currentPolicy(versions, eff);
      const cycleKey = type.kind === 'ALLOWANCE' ? cycleKeyFor(policy?.cycle ?? 'CALENDAR_YEAR', eff, emp.serviceStart) : cycleKeyFor('EMPLOYMENT_ANNIVERSARY', eff, emp.serviceStart);
      return post(tx, {
        tenantId,
        employeeId,
        leaveTypeId: type.id,
        policyId: policy?.id ?? null,
        entryType: 'ADJUSTMENT',
        units,
        effectiveDate: eff,
        cycleKey,
        sourceType: 'ADJUSTMENT',
        reasonCode: body.reasonCode,
        note: body.note.trim(),
        createdBy: user.userId,
      });
    });
  }

  async reverseEntry(user: AuthenticatedUser, entryId: string, note?: string) {
    const tenantId = user.tenantId;
    return withTenant(tenantId, async (tx) => {
      const [e] = await tx.select().from(leaveLedger).where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveLedger.id, entryId))).limit(1);
      if (!e) throw new NotFoundException('Ledger entry not found.');
      if (e.entryType !== 'ADJUSTMENT') {
        throw new BadRequestException('Only manual adjustments can be reversed here. Cancel the leave request, or reverse the opening-balance batch, instead.');
      }
      const done = await reversedIds(tx, [e.id]);
      if (done.has(e.id)) throw new BadRequestException('This adjustment has already been reversed.');
      return post(tx, {
        tenantId,
        employeeId: e.employeeId,
        leaveTypeId: e.leaveTypeId,
        policyId: e.policyId,
        entryType: 'ADJUSTMENT_REVERSAL',
        units: -Number(e.units),
        effectiveDate: e.effectiveDate,
        cycleKey: e.cycleKey,
        sourceType: 'ADJUSTMENT',
        reasonCode: e.reasonCode ?? 'ERROR_CORRECTION',
        reversesId: e.id,
        note: note?.trim() || 'Adjustment reversed',
        createdBy: user.userId,
      });
    });
  }

  async updateProfile(
    tenantId: string,
    employeeId: string,
    body: { employmentCategory?: string | null; contractTerm?: string | null; contractEndDate?: string | null; continuousServiceFrom?: string | null; workScheduleId?: string | null },
  ) {
    const patch: Partial<typeof employees.$inferInsert> = {};
    if (body.employmentCategory !== undefined) {
      if (body.employmentCategory && !['PERMANENT', 'FIXED_TERM', 'TEMPORARY', 'CASUAL'].includes(body.employmentCategory)) throw new BadRequestException('Unknown employment category.');
      patch.employmentCategory = body.employmentCategory || null;
    }
    if (body.contractTerm !== undefined) {
      if (body.contractTerm && !['SHORT', 'LONG'].includes(body.contractTerm)) throw new BadRequestException('Contract term must be SHORT or LONG.');
      patch.contractTerm = body.contractTerm || null;
    }
    if (body.contractEndDate !== undefined) patch.contractEndDate = body.contractEndDate ? iso(body.contractEndDate) : null;
    if (body.continuousServiceFrom !== undefined) patch.continuousServiceFrom = body.continuousServiceFrom ? iso(body.continuousServiceFrom) : null;
    if (body.workScheduleId !== undefined) patch.workScheduleId = body.workScheduleId || null;
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx.update(employees).set(patch).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).returning({ id: employees.id });
      if (!row) throw new NotFoundException('Employee not found.');
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------ admin: policies

  async adminPolicies(tenantId: string, countryCode: string) {
    return withTenant(tenantId, async (tx) => {
      await ensureTenantLeave(tx, tenantId);
      await ensureCountry(tx, tenantId, countryCode);
      const types = await tx
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode), eq(leaveTypes.isActive, true)))
        .orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.name));
      const policies = await policiesFor(tx, tenantId, types.map((t) => t.id));
      const itemIds = types.map((t) => t.templateItemId).filter((x): x is string => !!x);
      const items = itemIds.length ? await tx.select().from(leaveRuleTemplateItems).where(inArray(leaveRuleTemplateItems.id, itemIds)) : [];
      const itemById = new Map(items.map((i) => [i.id, i]));
      return types.map((t) => {
        const versions = policies.get(t.id) ?? [];
        const item = t.templateItemId ? itemById.get(t.templateItemId) : undefined;
        const latest = versions.at(-1) ?? null;
        return {
          type: t,
          policy: currentPolicy(versions, today()),
          scheduled: latest && latest.effectiveFrom > today() ? latest : null,
          history: versions,
          statutory: item ? { min: item.statutoryMin, section: item.sectionRef, defaults: item.defaults } : null,
        };
      });
    });
  }

  async updatePolicy(user: AuthenticatedUser, leaveTypeId: string, body: Record<string, any>) {
    const tenantId = user.tenantId;
    return withTenant(tenantId, async (tx) => {
      const [type] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, leaveTypeId))).limit(1);
      if (!type) throw new NotFoundException('Leave type not found.');
      const versions = (await policiesFor(tx, tenantId, [type.id])).get(type.id) ?? [];
      const effectiveFrom = iso(body.effectiveFrom) || today();
      // Edit the latest version (which may be a change already scheduled for
      // a future date); never slot a version in before it.
      const cur = versions.at(-1);
      if (!cur) throw new BadRequestException('This leave type has no policy.');
      if (effectiveFrom < cur.effectiveFrom) {
        throw new BadRequestException(
          cur.effectiveFrom > today()
            ? `A change is already scheduled from ${fmtDay(cur.effectiveFrom)} — edit it with that date, or choose a later one.`
            : `Changes can't take effect before the current version (${fmtDay(cur.effectiveFrom)}).`,
        );
      }

      const num = (v: any, fallback: number) => (v === undefined || v === null || v === '' ? fallback : Number(v));
      const next = {
        entitlement: num(body.entitlement, cur.entitlement),
        entitlementByWeek:
          body.entitlementByWeek === undefined
            ? (cur.entitlementByWeek ?? null)
            : Array.isArray(body.entitlementByWeek) && body.entitlementByWeek.length
              ? body.entitlementByWeek
                  .map((r: any) => ({ minDays: Number(r.minDays), entitlement: Number(r.entitlement) }))
                  .filter((r: any) => Number.isFinite(r.minDays) && Number.isFinite(r.entitlement) && r.entitlement >= 0)
              : null,
        usableAfterMonths: num(body.usableAfterMonths, cur.usableAfterMonths),
        minServiceMonths: num(body.minServiceMonths, cur.minServiceMonths),
        carryForwardMax: body.carryForwardMax === '' || body.carryForwardMax === null ? null : body.carryForwardMax === undefined ? cur.carryForwardMax : Number(body.carryForwardMax),
        excessAction: body.excessAction ?? cur.excessAction,
        allowNegative: num(body.allowNegative, cur.allowNegative),
        eligibleCategories: body.eligibleCategories === undefined ? cur.eligibleCategories : body.eligibleCategories?.length ? body.eligibleCategories : null,
        payRules: body.payRules ?? cur.payRules,
        eventRules: body.eventRules ?? cur.eventRules,
        belowStatutoryOk: !!body.belowStatutoryOk,
        exemptionReason: body.exemptionReason?.trim() || null,
      };
      for (const [k, v] of Object.entries(next)) {
        if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) throw new BadRequestException(`${k} must be zero or more.`);
      }
      if (!['CARRY_ALL', 'PAYOUT', 'FORFEIT'].includes(next.excessAction)) throw new BadRequestException('Unknown excess action.');

      // Statutory floor check.
      const [item] = type.templateItemId ? await tx.select().from(leaveRuleTemplateItems).where(eq(leaveRuleTemplateItems.id, type.templateItemId)).limit(1) : [];
      const floorProblems: string[] = [];
      if (item?.statutoryMin != null && next.entitlement < Number(item.statutoryMin)) floorProblems.push(`the entitlement is below the legal minimum of ${item.statutoryMin} (${item.sectionRef})`);
      const d = (item?.defaults ?? {}) as Record<string, any>;
      if (item && d.minServiceMonths != null && next.minServiceMonths > Number(d.minServiceMonths)) floorProblems.push(`the service requirement is stricter than the law's ${d.minServiceMonths} months`);
      const minWeeks = Number(d.payRules?.entitlementWeeks ?? 0);
      if (minWeeks > 0 && Number(next.payRules?.entitlementWeeks ?? 0) < minWeeks) {
        floorProblems.push(`the entitlement is below the legal minimum of ${minWeeks} weeks a year (${item?.sectionRef})`);
      }
      for (const floor of (d.entitlementByWeek ?? []) as Array<{ minDays: number; entitlement: number }>) {
        const mine = (next.entitlementByWeek ?? []).find((r: { minDays: number }) => Number(r.minDays) === Number(floor.minDays));
        if (!mine || Number(mine.entitlement) < Number(floor.entitlement)) {
          floorProblems.push(`the entitlement for a ${floor.minDays}-day week is below the legal minimum of ${floor.entitlement} (${item?.sectionRef})`);
        }
      }
      if (item && next.excessAction === 'FORFEIT') floorProblems.push(`forfeiting unused leave conflicts with the rule that accumulated leave is paid on termination${item.sectionRef ? ` (${item.sectionRef})` : ''}`);
      if (floorProblems.length && !(next.belowStatutoryOk && next.exemptionReason)) {
        throw new BadRequestException(`Not saved: ${floorProblems.join('; ')}. If an exemption applies (${type.countryCode === 'ZM' ? 'e.g. SI 48 of 2020 or a collective agreement' : 'e.g. a collective agreement'}), tick "An exemption applies" and give the reference.`);
      }

      const typePatch: Partial<typeof leaveTypes.$inferInsert> = {};
      if (Array.isArray(body.approvalFlow)) {
        const flow = body.approvalFlow.filter((s: string) => ['SUPERVISOR', 'HR'].includes(s));
        if (type.code === 'MOTHERS_DAY' && flow.length) throw new BadRequestException("Mother's Day can't require approval — the Act says no reason or certificate is needed (s.47).");
        typePatch.approvalFlow = flow;
      }
      if (body.name?.trim()) typePatch.name = body.name.trim().slice(0, 120);
      if (body.attachmentRequired !== undefined) typePatch.attachmentRequired = !!body.attachmentRequired;
      if (body.reasonRequired !== undefined && type.reasonAllowed) typePatch.reasonRequired = !!body.reasonRequired;
      if (Object.keys(typePatch).length) await tx.update(leaveTypes).set(typePatch).where(eq(leaveTypes.id, type.id));

      const changed = (Object.keys(next) as Array<keyof typeof next>).some((k) => JSON.stringify(next[k]) !== JSON.stringify((cur as any)[k]));
      if (!changed) return { ok: true, versioned: false };
      if (effectiveFrom === cur.effectiveFrom) {
        await tx.update(leavePolicies).set({ ...next, createdBy: user.userId }).where(eq(leavePolicies.id, cur.id));
      } else {
        await tx.update(leavePolicies).set({ effectiveTo: addDays(effectiveFrom, -1) }).where(eq(leavePolicies.id, cur.id));
        const { id: _id, createdAt: _c, effectiveTo: _t, ...rest } = cur;
        await tx.insert(leavePolicies).values({ ...rest, ...next, effectiveFrom, effectiveTo: null, createdBy: user.userId });
      }
      return { ok: true, versioned: effectiveFrom !== cur.effectiveFrom };
    });
  }

  async addCustomType(user: AuthenticatedUser, body: { countryCode: string; name: string; kind: string; entitlement: number; cycle?: string; paid?: boolean }) {
    const tenantId = user.tenantId;
    if (!body.name?.trim()) throw new BadRequestException('Name the leave type.');
    if (!['ACCRUING', 'ALLOWANCE', 'UNTRACKED'].includes(body.kind)) throw new BadRequestException('Custom types can be accruing, a yearly allowance, or untracked.');
    return withTenant(tenantId, async (tx) => {
      const code = `CUSTOM_${body.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`.slice(0, 32);
      const [dupe] = await tx.select({ id: leaveTypes.id }).from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, body.countryCode), eq(leaveTypes.code, code))).limit(1);
      if (dupe) throw new BadRequestException('A leave type with that name already exists.');
      const [type] = await tx
        .insert(leaveTypes)
        .values({
          tenantId,
          countryCode: body.countryCode,
          name: body.name.trim().slice(0, 120),
          code,
          kind: body.kind,
          unitBasis: 'WORKING_DAYS',
          isPaid: body.paid !== false,
          approvalFlow: ['SUPERVISOR'],
          sortOrder: 80,
        })
        .returning();
      await tx.insert(leavePolicies).values({
        tenantId,
        leaveTypeId: type.id,
        effectiveFrom: today(),
        entitlement: Number(body.entitlement) || 0,
        cycle: body.kind === 'ACCRUING' ? 'EMPLOYMENT_ANNIVERSARY' : body.kind === 'ALLOWANCE' ? body.cycle ?? 'CALENDAR_YEAR' : 'NONE',
        accrualFrequency: body.kind === 'ACCRUING' ? 'MONTHLY' : body.kind === 'ALLOWANCE' ? 'UPFRONT' : 'NONE',
        proratePartial: body.kind === 'ACCRUING',
        createdBy: user.userId,
      });
      return type;
    });
  }

  async retireType(tenantId: string, leaveTypeId: string) {
    return withTenant(tenantId, async (tx) => {
      const [type] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, leaveTypeId))).limit(1);
      if (!type) throw new NotFoundException('Leave type not found.');
      if (type.templateItemId) throw new BadRequestException('Statutory leave types can’t be removed.');
      await tx.update(leaveTypes).set({ isActive: false }).where(eq(leaveTypes.id, type.id));
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------ admin: calendar, schedules, settings

  async holidays(tenantId: string, countryCode: string, year: number) {
    return withTenant(tenantId, (tx) => holidaysBetween(tx, tenantId, countryCode, `${year}-01-01`, `${year}-12-31`));
  }

  async addHoliday(tenantId: string, body: { holidayDate: string; name: string; countryCode?: string | null; isPaid?: boolean }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso(body.holidayDate))) throw new BadRequestException('Choose a date.');
    if (!body.name?.trim()) throw new BadRequestException('Name the holiday.');
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(tenantHolidays)
        .values({ tenantId, holidayDate: iso(body.holidayDate), name: body.name.trim().slice(0, 120), countryCode: body.countryCode || null, isPaid: body.isPaid !== false })
        .returning();
      return row;
    });
  }

  async removeHoliday(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      await tx.delete(tenantHolidays).where(and(eq(tenantHolidays.tenantId, tenantId), eq(tenantHolidays.id, id)));
      return { ok: true };
    });
  }

  async schedules(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      await ensureTenantLeave(tx, tenantId);
      return tx.select().from(workSchedules).where(eq(workSchedules.tenantId, tenantId)).orderBy(desc(workSchedules.isDefault), asc(workSchedules.name));
    });
  }

  async saveSchedule(tenantId: string, body: { id?: string; name: string; dayWeights: number[]; hoursPerDay?: number; isDefault?: boolean }) {
    if (!body.name?.trim()) throw new BadRequestException('Name the schedule.');
    const weights = (body.dayWeights ?? []).map(Number);
    if (weights.length !== 7 || weights.some((w) => ![0, 0.5, 1].includes(w))) throw new BadRequestException('Each day must be 0, ½ or 1.');
    if (weights.every((w) => w === 0)) throw new BadRequestException('A schedule needs at least one working day.');
    return withTenant(tenantId, async (tx) => {
      if (body.isDefault) await tx.update(workSchedules).set({ isDefault: false }).where(eq(workSchedules.tenantId, tenantId));
      const values = { name: body.name.trim().slice(0, 80), dayWeights: weights, hoursPerDay: Number(body.hoursPerDay ?? 8), isDefault: !!body.isDefault };
      if (body.id) {
        const [row] = await tx.update(workSchedules).set(values).where(and(eq(workSchedules.tenantId, tenantId), eq(workSchedules.id, body.id))).returning();
        return row;
      }
      const [row] = await tx.insert(workSchedules).values({ tenantId, ...values }).returning();
      return row;
    });
  }

  async settings(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      await ensureTenantLeave(tx, tenantId);
      const [row] = await tx.select().from(leaveSettings).where(eq(leaveSettings.tenantId, tenantId)).limit(1);
      return { ...row, engineVersion: ENGINE_VERSION };
    });
  }

  async saveSettings(tenantId: string, body: { dailyRateDivisor?: number; sickEpisodeLinkDays?: number }) {
    const patch: Partial<typeof leaveSettings.$inferInsert> = { updatedAt: new Date() };
    if (body.dailyRateDivisor !== undefined) {
      const v = Number(body.dailyRateDivisor);
      if (!(v >= 1 && v <= 31)) throw new BadRequestException('The daily-rate divisor must be between 1 and 31.');
      patch.dailyRateDivisor = v;
    }
    if (body.sickEpisodeLinkDays !== undefined) {
      const v = Number(body.sickEpisodeLinkDays);
      if (!(v >= 0 && v <= 90)) throw new BadRequestException('Linking days must be between 0 and 90.');
      patch.sickEpisodeLinkDays = v;
    }
    return withTenant(tenantId, async (tx) => {
      await tx.update(leaveSettings).set(patch).where(eq(leaveSettings.tenantId, tenantId));
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------ admin: opening balances

  async openingTemplate(tenantId: string, countryCode: string) {
    return withTenant(tenantId, async (tx) => {
      await ensureCountry(tx, tenantId, countryCode);
      return openingTemplate(tx, tenantId, countryCode);
    });
  }

  async openingUpload(user: AuthenticatedUser, countryCode: string, cutoverDate: string, file: Attachment) {
    if (!file) throw new BadRequestException('Choose the CSV file to upload.');
    return withTenant(user.tenantId, async (tx) => {
      try {
        return await createBatch(tx, user.tenantId, countryCode, iso(cutoverDate), file.originalname, file.buffer, user.userId);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    });
  }

  async openingBatches(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.select().from(leaveOpeningBatches).where(eq(leaveOpeningBatches.tenantId, tenantId)).orderBy(desc(leaveOpeningBatches.createdAt)));
  }

  async openingBatch(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const [batch] = await tx.select().from(leaveOpeningBatches).where(and(eq(leaveOpeningBatches.tenantId, tenantId), eq(leaveOpeningBatches.id, id))).limit(1);
      if (!batch) throw new NotFoundException('Batch not found.');
      const lines = await tx
        .select({
          id: leaveOpeningLines.id,
          rowNumber: leaveOpeningLines.rowNumber,
          employeeCode: leaveOpeningLines.employeeCode,
          employeeId: leaveOpeningLines.employeeId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          leaveCode: leaveOpeningLines.leaveCode,
          balance: leaveOpeningLines.balance,
          usedThisCycle: leaveOpeningLines.usedThisCycle,
          sickFullUsed: leaveOpeningLines.sickFullUsed,
          sickHalfUsed: leaveOpeningLines.sickHalfUsed,
          serviceFrom: leaveOpeningLines.serviceFrom,
          note: leaveOpeningLines.note,
          errors: leaveOpeningLines.errors,
        })
        .from(leaveOpeningLines)
        .leftJoin(employees, eq(employees.id, leaveOpeningLines.employeeId))
        .where(eq(leaveOpeningLines.batchId, id))
        .orderBy(asc(leaveOpeningLines.rowNumber));
      return { batch, lines };
    });
  }

  async openingPost(user: AuthenticatedUser, id: string) {
    return withTenant(user.tenantId, async (tx) => {
      try {
        await postBatch(tx, user.tenantId, id, user.userId);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      return { ok: true };
    });
  }

  async openingReverse(user: AuthenticatedUser, id: string) {
    return withTenant(user.tenantId, async (tx) => {
      try {
        await reverseBatch(tx, user.tenantId, id, user.userId);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      return { ok: true };
    });
  }

  async openingDelete(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const [batch] = await tx.select().from(leaveOpeningBatches).where(and(eq(leaveOpeningBatches.tenantId, tenantId), eq(leaveOpeningBatches.id, id))).limit(1);
      if (!batch) throw new NotFoundException('Batch not found.');
      if (batch.status !== 'DRAFT') throw new BadRequestException('Only draft batches can be deleted — reverse a posted one instead.');
      await tx.delete(leaveOpeningBatches).where(eq(leaveOpeningBatches.id, id));
      return { ok: true };
    });
  }

  // ------------------------------------------------------------------ reports

  /** Accrued, untaken leave valued at each person's daily rate. */
  async liability(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const settings = await loadSettings(tx, tenantId);
      const emps = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), ne(employees.status, 'ALUMNI')));
      const rows = [];
      for (const e of emps) {
        const ctx = await loadEmployeeCtx(tx, tenantId, e.id, today());
        if (!ctx || ctx.leftOn) continue;
        await processEmployee(tx, ctx, today(), settings);
        const types = (await typesForRegime(tx, tenantId, ctx.regime)).filter((t) => t.kind === 'ACCRUING' && t.isPaid);
        const pols = await policiesFor(tx, tenantId, types.map((t) => t.id));
        let days = 0;
        for (const t of types) {
          // Only leave that would be paid out on leaving is a liability (not
          // NZ sick leave or AU personal leave, for example).
          const pol = currentPolicy(pols.get(t.id), today());
          if (pol?.payRules?.payoutOnTermination === false) continue;
          days += await balance(tx, tenantId, e.id, t.id);
        }
        const rate = await dailyPayRate(tx, tenantId, ctx, today(), settings.dailyRateDivisor);
        rows.push({
          employeeId: e.id,
          name: ctx.name,
          department: e.department,
          countryCode: e.countryCode,
          days: round2(days),
          dailyRate: round2(rate),
          value: round2(days * rate),
        });
      }
      rows.sort((a, b) => b.value - a.value);
      return { asOf: today(), divisor: settings.dailyRateDivisor, totalDays: round2(rows.reduce((s, r) => s + r.days, 0)), totalValue: round2(rows.reduce((s, r) => s + r.value, 0)), rows };
    });
  }

  /** v028.C — annual leave not taken within the period the law allows
   *  (Malawi s.44: within 6 months of falling due, unless deferred by
   *  agreement). Flag only — nothing is forfeited or paid out. */
  async overdueReport(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const settings = await loadSettings(tx, tenantId);
      const emps = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), ne(employees.status, 'ALUMNI')));
      const now = today();
      const rows = [];
      for (const e of emps) {
        const ctx = await loadEmployeeCtx(tx, tenantId, e.id, now);
        if (!ctx || ctx.leftOn) continue;
        await processEmployee(tx, ctx, now, settings);
        const types = (await typesForRegime(tx, tenantId, ctx.regime)).filter((t) => t.kind === 'ACCRUING');
        const policies = await policiesFor(tx, tenantId, types.map((t) => t.id));
        for (const t of types) {
          const policy = currentPolicy(policies.get(t.id), now);
          if (!policy) continue;
          const od = await overdueLeave(tx, ctx, t, policy, now);
          if (!od) continue;
          rows.push({
            employeeId: e.id,
            name: ctx.name,
            department: e.department,
            countryCode: e.countryCode,
            leaveType: t.name,
            overdueDays: od.days,
            dueFrom: od.dueFrom,
            takeBy: od.takeBy,
            balance: await balance(tx, tenantId, e.id, t.id),
          });
        }
      }
      rows.sort((a, b) => b.overdueDays - a.overdueDays);
      return { asOf: now, rows };
    });
  }

  /** Total accrued-leave balance per employee (used by Reports). */
  async balancesByEmployee(tenantId: string): Promise<Map<string, number>> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ employeeId: leaveLedger.employeeId, total: sql<string>`sum(${leaveLedger.units})` })
        .from(leaveLedger)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveLedger.leaveTypeId))
        .where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveTypes.kind, 'ACCRUING')))
        .groupBy(leaveLedger.employeeId);
      return new Map(rows.map((r) => [r.employeeId, round2(Number(r.total))]));
    });
  }

  employeeLeaveProfileOptions(tenantId: string) {
    return this.schedules(tenantId);
  }
}


