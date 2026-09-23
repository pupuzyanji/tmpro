import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { withTenant } from '../../db/client';
import * as schema from '../../db/schema';
import { employees, timesheets } from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import type { CreateTimesheetDto, CreateWeeklyTimesheetDto, UpdateTimesheetDto } from './dto/timesheet.dto';

type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'CANDIDATE' | 'HR';

interface BreakEntry {
  start: string;
  end: string;
}

/** "HH:mm" -> minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** (end - start) minus every break, in hours to 2dp. Same-day shifts only —
 *  an end time at or before the start time (after subtracting breaks) is
 *  rejected rather than silently producing a negative or zero total; there's
 *  no overnight-shift support in this build yet. */
function computeTotalHours(startTime: string, endTime: string, breaks: BreakEntry[]): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (end <= start) {
    throw new BadRequestException('End time must be after start time (overnight shifts aren\'t supported yet).');
  }
  let breakMinutes = 0;
  for (const b of breaks) {
    const bStart = toMinutes(b.start);
    const bEnd = toMinutes(b.end);
    if (bEnd <= bStart) throw new BadRequestException('A break\'s end time must be after its start time.');
    if (bStart < start || bEnd > end) throw new BadRequestException('A break must fall within the shift\'s start and end time.');
    breakMinutes += bEnd - bStart;
  }
  const minutes = end - start - breakMinutes;
  if (minutes <= 0) throw new BadRequestException('Breaks add up to more than the shift itself.');
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Timesheets (v022.A) — structurally a sibling of Leave: an employee (who
 * must be allocated the feature — see employees.timesheetsEnabled) submits
 * daily entries, their supervisor/Admin/HR approves or declines them. "Add
 * Weekly Timesheet" on the frontend is just createMany with 7 entries, not
 * a separate concept server-side.
 */
@Injectable()
export class TimesheetsService {
  constructor(private mail: MailService) {}

  private async assertAllocated(tx: NodePgDatabase<typeof schema>, tenantId: string, employeeId: string) {
    const [employee] = await tx
      .select({ timesheetsEnabled: employees.timesheetsEnabled, firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
      .limit(1);
    if (!employee) throw new NotFoundException('Employee not found.');
    if (!employee.timesheetsEnabled) {
      throw new ForbiddenException('Timesheets have not been allocated to your account — ask an Admin or HR to turn this on for you.');
    }
    return employee;
  }

  myTimesheets(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.employeeId, employeeId)))
        .orderBy(desc(timesheets.date)),
    );
  }

  /** This supervisor's direct reports' entries — same scoping as Leave's teamRequests. */
  teamTimesheets(tenantId: string, managerId: string) {
    return withTenant(tenantId, async (tx) => {
      const reports = await tx
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, managerId)));
      const reportIds = new Set(reports.map((r) => r.id));
      if (reportIds.size === 0) return [];
      const rows = await tx.select().from(timesheets).where(eq(timesheets.tenantId, tenantId)).orderBy(desc(timesheets.date));
      const byId = new Map(reports.map((r) => [r.id, r]));
      return rows.filter((r) => reportIds.has(r.employeeId)).map((r) => ({ ...r, employee: byId.get(r.employeeId) }));
    });
  }

  /** Admin/HR — every timesheet on the tenant, newest first. */
  allTimesheets(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(timesheets).where(eq(timesheets.tenantId, tenantId)).orderBy(desc(timesheets.date));
      const allEmployees = await tx
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.tenantId, tenantId));
      const byId = new Map(allEmployees.map((e) => [e.id, e]));
      return rows.map((r) => ({ ...r, employee: byId.get(r.employeeId) }));
    });
  }

  async create(tenantId: string, employeeId: string, dto: CreateTimesheetDto) {
    const [row] = await withTenant(tenantId, async (tx) => {
      await this.assertAllocated(tx, tenantId, employeeId);
      const totalHours = computeTotalHours(dto.startTime, dto.endTime, dto.breaks ?? []);
      return tx
        .insert(timesheets)
        .values({
          tenantId,
          employeeId,
          date: new Date(dto.date),
          startTime: dto.startTime,
          endTime: dto.endTime,
          breaks: dto.breaks ?? [],
          totalHours,
          workSite: dto.workSite,
          position: dto.position,
          workType: dto.workType,
          notes: dto.notes,
        })
        .returning();
    });
    return row;
  }

  /** "Add Weekly Timesheet" — every entry validated and inserted in one
   *  transaction, so a bad row in the middle of the week doesn't leave a
   *  partial week behind. */
  async createMany(tenantId: string, employeeId: string, dto: CreateWeeklyTimesheetDto) {
    return withTenant(tenantId, async (tx) => {
      await this.assertAllocated(tx, tenantId, employeeId);
      const rows = [];
      for (const entry of dto.entries) {
        const totalHours = computeTotalHours(entry.startTime, entry.endTime, entry.breaks ?? []);
        rows.push({
          tenantId,
          employeeId,
          date: new Date(entry.date),
          startTime: entry.startTime,
          endTime: entry.endTime,
          breaks: entry.breaks ?? [],
          totalHours,
          workSite: entry.workSite,
          position: entry.position,
          workType: entry.workType,
          notes: entry.notes,
        });
      }
      if (rows.length === 0) return [];
      return tx.insert(timesheets).values(rows).returning();
    });
  }

  async update(tenantId: string, employeeId: string, id: string, dto: UpdateTimesheetDto) {
    const [row] = await withTenant(tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id)))
        .limit(1);
      if (!existing) throw new NotFoundException('Timesheet entry not found.');
      if (existing.employeeId !== employeeId) throw new ForbiddenException('You can only edit your own timesheet entries.');
      if (existing.status !== 'PENDING') throw new BadRequestException('This entry has already been decided and can no longer be edited.');

      const startTime = dto.startTime ?? existing.startTime;
      const endTime = dto.endTime ?? existing.endTime;
      const breaks = dto.breaks ?? (existing.breaks as BreakEntry[]);
      const totalHours = computeTotalHours(startTime, endTime, breaks);

      return tx
        .update(timesheets)
        .set({
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          startTime,
          endTime,
          breaks,
          totalHours,
          ...(dto.workSite !== undefined ? { workSite: dto.workSite } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(dto.workType !== undefined ? { workType: dto.workType } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        })
        .where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id)))
        .returning();
    });
    return row;
  }

  async delete(tenantId: string, employeeId: string, id: string) {
    await withTenant(tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id)))
        .limit(1);
      if (!existing) throw new NotFoundException('Timesheet entry not found.');
      if (existing.employeeId !== employeeId) throw new ForbiddenException('You can only delete your own timesheet entries.');
      if (existing.status !== 'PENDING') throw new BadRequestException('This entry has already been decided and can no longer be deleted.');
      await tx.delete(timesheets).where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id)));
    });
    return { id };
  }

  async decide(
    tenantId: string,
    id: string,
    deciderEmployeeId: string | null,
    deciderRole: Role,
    decision: 'APPROVED' | 'DECLINED',
  ) {
    const { updated, employee } = await withTenant(tenantId, async (tx) => {
      const [entry] = await tx.select().from(timesheets).where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id))).limit(1);
      if (!entry) throw new NotFoundException('Timesheet entry not found.');
      if (entry.status !== 'PENDING') throw new BadRequestException('This entry has already been decided.');

      const [employee] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, entry.employeeId))).limit(1);

      // HR (like Admin) can decide anyone's timesheet — tenant-wide HR
      // administration, not a line manager; a Supervisor is limited to
      // their own direct reports, same split as Leave.
      if (deciderRole !== 'ADMIN' && deciderRole !== 'HR') {
        if (!employee || employee.managerId !== deciderEmployeeId) {
          throw new ForbiddenException('You can only decide timesheet entries for your direct reports.');
        }
      }

      const [updated] = await tx
        .update(timesheets)
        .set({ status: decision, decidedById: deciderEmployeeId ?? undefined, decidedAt: new Date() })
        .where(and(eq(timesheets.tenantId, tenantId), eq(timesheets.id, id)))
        .returning();

      return { updated, employee };
    });

    if (employee?.email) {
      const verb = decision === 'APPROVED' ? 'approved' : 'declined';
      await this.mail.send({
        to: employee.email,
        subject: `Your timesheet has been ${verb}`,
        text: `Your entry for ${updated.date.toDateString()} (${updated.totalHours}h) has been ${verb}.\n\nSign in to tmPro for details.`,
      });
    }

    return updated;
  }
}
