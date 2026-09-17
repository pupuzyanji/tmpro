import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeStatusHistory, employees, leaveBalances, leaveRequests, leaveTypes } from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import type { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class LeaveService {
  constructor(private mail: MailService) {}
  listTypes(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.select().from(leaveTypes).where(eq(leaveTypes.tenantId, tenantId)));
  }

  /** The accrual cycle's anchor date for one leave type against one
   *  employee. Both branches are pinned to the employee's "Start Date"
   *  as sourced from the Job tab's Employee Status history — their
   *  earliest Employment Status entry's Effective Date (falling back to
   *  their People profile Start Date if no status history exists yet,
   *  e.g. a legacy record predating that log). Payroll's own start-date
   *  concept is separate and unaffected by this: it stays driven by the
   *  Compensation tab's Effective Date (see payroll.service.ts).
   *  Carry-over ON: that Employment Status start date, so the cycle (and
   *  any accumulated balance) is theirs alone and never resets.
   *  Carry-over OFF: 1 January of the current year, so the balance
   *  restarts from zero every New Year — except for someone whose
   *  Employment Status start date falls after that 1 January, whose cycle
   *  can't start before they actually joined. */
  private cycleAnchor(carryOverEnabled: boolean, employmentStartDate: Date, now: Date): Date {
    if (carryOverEnabled) return employmentStartDate;
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return employmentStartDate > jan1 ? employmentStartDate : jan1;
  }

  /** Whole accrual periods elapsed between `anchor` and `now` — the number
   *  of times `defaultAnnualDays` has been earned so far this cycle.
   *  DAILY/MONTHLY genuinely build up incrementally (this is how Annual
   *  Leave, on a MONTHLY period, accrues a bit at a time). ANNUALLY is
   *  different by design: every leave type other than Annual Leave is
   *  configured ANNUALLY, and per policy those are available *in full* as
   *  soon as the employee's current annual cycle has begun, not built up
   *  gradually across it — so the in-progress cycle itself already counts
   *  as one full period, on top of however many complete prior cycles
   *  have elapsed. */
  private periodsElapsed(anchor: Date, now: Date, period: 'DAILY' | 'MONTHLY' | 'ANNUALLY'): number {
    if (now <= anchor) return 0;
    if (period === 'DAILY') return Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY);
    if (period === 'ANNUALLY') {
      let years = now.getUTCFullYear() - anchor.getUTCFullYear();
      const anniversaryThisYear = new Date(Date.UTC(now.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
      if (now < anniversaryThisYear) years -= 1;
      return Math.max(0, years) + 1;
    }
    // MONTHLY
    let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
    if (now.getUTCDate() < anchor.getUTCDate()) months -= 1;
    return Math.max(0, months);
  }

  /** Recomputes and upserts every applicable leave-type balance for one
   *  employee — "applicable" meaning that regime's catalog for the
   *  employee's own countryCode, falling back to the country-less 'OTHER'
   *  regime when nothing has been configured for their specific country
   *  yet. Safe to call on every read: it's a pure recompute from the
   *  accrual formula (days accrued per period since the cycle anchor) minus
   *  APPROVED requests taken within that same cycle, not an increment — so
   *  calling it twice in a row is a no-op. This is what "attributed to an
   *  employee based on start dates" means in practice: balances stay
   *  correct without a background job, because they're derived fresh
   *  whenever an employee's leave is actually looked at. */
  private async syncLeaveBalances(tenantId: string, employeeId: string) {
    await withTenant(tenantId, async (tx) => {
      const [employee] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      if (!employee) return;

      let types = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, employee.countryCode)));
      if (types.length === 0) {
        types = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, 'OTHER')));
      }
      if (types.length === 0) return;

      const statusRows = await tx
        .select({ effectiveDate: employeeStatusHistory.effectiveDate })
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
        .orderBy(employeeStatusHistory.effectiveDate)
        .limit(1);
      // Falls back to the People profile Start Date only when there's no
      // Employment Status history at all yet — once even one entry exists,
      // its (earliest) Effective Date is authoritative.
      const employmentStartDate = statusRows[0]?.effectiveDate ?? employee.startDate;
      const now = new Date();

      for (const type of types) {
        const anchor = this.cycleAnchor(type.carryOverEnabled, employmentStartDate, now);
        const periods = this.periodsElapsed(anchor, now, type.accrualPeriod);
        const accrued = type.defaultAnnualDays * periods;

        // Only APPROVED requests that fall inside the current cycle count
        // against it — a non-carry-over type's prior-year usage doesn't
        // touch this year's freshly-reset balance.
        const takenRows = await tx
          .select({ days: leaveRequests.days, startDate: leaveRequests.startDate })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.tenantId, tenantId),
              eq(leaveRequests.employeeId, employeeId),
              eq(leaveRequests.leaveTypeId, type.id),
              eq(leaveRequests.status, 'APPROVED'),
            ),
          );
        const taken = takenRows.filter((r) => r.startDate >= anchor).reduce((sum, r) => sum + r.days, 0);

        const balanceDays = accrued - taken;
        const [existing] = await tx
          .select()
          .from(leaveBalances)
          .where(and(eq(leaveBalances.tenantId, tenantId), eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.leaveTypeId, type.id)))
          .limit(1);
        if (existing) {
          await tx.update(leaveBalances).set({ balanceDays, updatedAt: now }).where(eq(leaveBalances.id, existing.id));
        } else {
          await tx.insert(leaveBalances).values({ tenantId, employeeId, leaveTypeId: type.id, balanceDays, updatedAt: now });
        }
      }
    });
  }

  async myBalances(tenantId: string, employeeId: string) {
    await this.syncLeaveBalances(tenantId, employeeId);
    return withTenant(tenantId, (tx) =>
      tx.query.leaveBalances.findMany({
        where: and(eq(leaveBalances.tenantId, tenantId), eq(leaveBalances.employeeId, employeeId)),
        with: { leaveType: true },
      }),
    );
  }

  myRequests(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx.query.leaveRequests.findMany({
        where: and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.employeeId, employeeId)),
        with: { leaveType: true },
        orderBy: (r, { desc }) => desc(r.createdAt),
      }),
    );
  }

  /** Pending + recent requests from this supervisor's direct reports. */
  teamRequests(tenantId: string, managerId: string) {
    return withTenant(tenantId, async (tx) => {
      const reports = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, managerId)));
      const reportIds = reports.map((r) => r.id);
      if (reportIds.length === 0) return [];
      return tx.query.leaveRequests.findMany({
        where: and(eq(leaveRequests.tenantId, tenantId)),
        with: { leaveType: true, employee: true },
        orderBy: (r, { desc }) => desc(r.createdAt),
      }).then((rows) => rows.filter((r) => reportIds.includes(r.employeeId)));
    });
  }

  async create(tenantId: string, employeeId: string, dto: CreateLeaveRequestDto) {
    const { row, employee, manager, leaveType } = await withTenant(tenantId, async (tx) => {
      const [employeeBefore] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      const [leaveTypeBefore] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, dto.leaveTypeId))).limit(1);

      // Paternity/Maternity Leave are gender-restricted, per General Info
      // > Basic Information's Gender field — enforced server-side too, not
      // just hidden from the request form, since the form's option list is
      // just a filter on the same catalog.
      if (leaveTypeBefore?.name === 'Paternity Leave' && employeeBefore?.gender !== 'MALE') {
        throw new BadRequestException('Paternity Leave is only available to male employees.');
      }
      if (leaveTypeBefore?.name === 'Maternity Leave' && employeeBefore?.gender !== 'FEMALE') {
        throw new BadRequestException('Maternity Leave is only available to female employees.');
      }

      const [row] = await tx
        .insert(leaveRequests)
        .values({
          tenantId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          days: dto.days,
          reason: dto.reason,
        })
        .returning();

      const [employee] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      const [manager] = employee?.managerId
        ? await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employee.managerId))).limit(1)
        : [];
      const [leaveType] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, dto.leaveTypeId))).limit(1);

      return { row, employee, manager, leaveType };
    });

    if (manager?.email && employee) {
      await this.mail.send({
        to: manager.email,
        subject: `Leave request from ${employee.firstName} ${employee.lastName}`,
        text: `${employee.firstName} ${employee.lastName} has requested ${row.days} day(s) of ${leaveType?.name ?? 'leave'} from ${row.startDate.toDateString()} to ${row.endDate.toDateString()}.\n\nReason: ${row.reason ?? '(none given)'}\n\nSign in to tmPro to approve or decline this request.`,
      });
    }

    return row;
  }

  async decide(
    tenantId: string,
    requestId: string,
    approverEmployeeId: string | null,
    approverRole: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'CANDIDATE' | 'HR',
    decision: 'APPROVED' | 'DECLINED',
  ) {
    const { updated, employee, leaveType } = await withTenant(tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(leaveRequests)
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, requestId)))
        .limit(1);
      if (!request) throw new NotFoundException('Leave request not found.');
      if (request.status !== 'PENDING') throw new BadRequestException('This request has already been decided.');

      // Fetched unconditionally now (used to be Admin-only-skipped) so the
      // approved/declined notification below can go out regardless of who
      // made the decision.
      const [employee] = await tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, request.employeeId)))
        .limit(1);

      // HR (like Admin) can decide anyone's leave, not just their own direct
      // reports — they're tenant-wide HR administration, not a line manager.
      if (approverRole !== 'ADMIN' && approverRole !== 'HR') {
        if (!employee || employee.managerId !== approverEmployeeId) {
          throw new ForbiddenException('You can only decide leave requests for your direct reports.');
        }
      }

      const [updated] = await tx
        .update(leaveRequests)
        .set({ status: decision, approverId: approverEmployeeId, decidedAt: new Date() })
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, requestId)))
        .returning();

      if (decision === 'APPROVED') {
        const [balance] = await tx
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.tenantId, tenantId),
              eq(leaveBalances.employeeId, request.employeeId),
              eq(leaveBalances.leaveTypeId, request.leaveTypeId),
            ),
          )
          .limit(1);
        if (balance) {
          await tx
            .update(leaveBalances)
            .set({ balanceDays: balance.balanceDays - request.days, updatedAt: new Date() })
            .where(eq(leaveBalances.id, balance.id));
        }
      }

      const [leaveType] = await tx
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, request.leaveTypeId)))
        .limit(1);

      return { updated, employee, leaveType };
    });

    if (employee?.email) {
      const verb = decision === 'APPROVED' ? 'approved' : 'declined';
      await this.mail.send({
        to: employee.email,
        subject: `Your leave request has been ${verb}`,
        text: `Your request for ${updated.days} day(s) of ${leaveType?.name ?? 'leave'} from ${updated.startDate.toDateString()} to ${updated.endDate.toDateString()} has been ${verb}.\n\nSign in to tmPro for details.`,
      });
    }

    return updated;
  }
}
