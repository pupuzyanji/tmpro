import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { departments, employees, leaveRequests, requisitions } from '../../db/schema';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** How many days from `today` until this person's next birthday (month/day,
 *  year-agnostic — rolls over to next year once this year's has passed).
 *  Returns null if that's further out than `windowDays`. */
function daysToNextBirthday(dob: Date, today: Date, windowDays: number): number | null {
  const todayMid = startOfDay(today);
  let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < todayMid) next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
  const diff = Math.round((next.getTime() - todayMid.getTime()) / 86_400_000);
  return diff <= windowDays ? diff : null;
}

type LeaveWithJoins = {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  createdAt: Date;
  employee: { firstName: string; lastName: string };
  leaveType: { name: string };
};

function onLeaveEntries(requests: LeaveWithJoins[], today: Date, weekOut: Date) {
  const todayMid = startOfDay(today);
  return requests
    .filter((r) => r.status === 'APPROVED' && r.endDate >= todayMid && r.startDate <= weekOut)
    .map((r) => ({
      employeeId: r.employeeId,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      leaveType: r.leaveType.name,
      startDate: r.startDate,
      endDate: r.endDate,
      state: r.startDate <= todayMid ? ('ON_LEAVE' as const) : ('UPCOMING' as const),
    }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

function pendingLeaveEntries(requests: LeaveWithJoins[]) {
  return requests
    .filter((r) => r.status === 'PENDING')
    .map((r) => ({
      id: r.id,
      type: 'LEAVE' as const,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      summary: `${r.leaveType.name} · ${r.days} day${r.days === 1 ? '' : 's'}`,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function birthdayEntries(
  people: Array<{ id: string; firstName: string; lastName: string; dateOfBirth: Date | null }>,
  today: Date,
  windowDays: number,
) {
  return people
    .map((e) => ({ e, daysOut: e.dateOfBirth ? daysToNextBirthday(new Date(e.dateOfBirth), today, windowDays) : null }))
    .filter((x): x is { e: (typeof people)[number]; daysOut: number } => x.daysOut !== null)
    .sort((a, b) => a.daysOut - b.daysOut)
    .map((x) => ({ employeeId: x.e.id, name: `${x.e.firstName} ${x.e.lastName}`, date: x.e.dateOfBirth, daysOut: x.daysOut }));
}

@Injectable()
export class DashboardService {
  /** Org-wide summary for the Admin dashboard. Birthday window is kept wider
   *  (30 days) than the Supervisor view's explicit "next week" ask, since an
   *  org-wide list scoped to a week would be sparse for most tenants — this
   *  is a reasonable default, not a spec requirement. */
  async adminSummary(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const today = new Date();
      const weekOut = addDays(today, 7);

      // Sequential, not Promise.all — these share one transaction's client
      // connection, which node-postgres can't run overlapping queries on.
      const allEmployees = await tx.select().from(employees).where(eq(employees.tenantId, tenantId));
      const depts = await tx.select().from(departments).where(eq(departments.tenantId, tenantId));
      const allLeave = (await tx.query.leaveRequests.findMany({
        where: eq(leaveRequests.tenantId, tenantId),
        with: { employee: true, leaveType: true },
      })) as LeaveWithJoins[];
      const pendingReqs = await tx
        .select()
        .from(requisitions)
        .where(and(eq(requisitions.tenantId, tenantId), eq(requisitions.status, 'PENDING_APPROVAL')));

      const pendingRequests = [
        ...pendingLeaveEntries(allLeave),
        ...pendingReqs.map((r) => ({
          id: r.id,
          type: 'REQUISITION' as const,
          employeeName: r.title,
          summary: `Requisition · ${r.headcount} role${r.headcount === 1 ? '' : 's'}`,
          createdAt: r.createdAt,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        headcount: allEmployees.length,
        departmentCount: depts.length,
        pendingRequestsCount: pendingRequests.length,
        onLeave: onLeaveEntries(allLeave, today, weekOut),
        pendingRequests,
        birthdays: birthdayEntries(allEmployees, today, 30),
      };
    });
  }

  /** Same shape, scoped to one supervisor's direct reports only. */
  async supervisorSummary(tenantId: string, managerId: string) {
    return withTenant(tenantId, async (tx) => {
      const today = new Date();
      const weekOut = addDays(today, 7);

      const reports = await tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, managerId)));
      const reportIds = new Set(reports.map((r) => r.id));

      if (reportIds.size === 0) {
        return {
          directReportsCount: 0,
          pendingRequestsCount: 0,
          onLeave: [] as ReturnType<typeof onLeaveEntries>,
          pendingRequests: [] as ReturnType<typeof pendingLeaveEntries>,
          birthdays: [] as ReturnType<typeof birthdayEntries>,
        };
      }

      const allLeave = (await tx.query.leaveRequests.findMany({
        where: eq(leaveRequests.tenantId, tenantId),
        with: { employee: true, leaveType: true },
      })) as LeaveWithJoins[];
      const teamLeave = allLeave.filter((r) => reportIds.has(r.employeeId));
      const pendingRequests = pendingLeaveEntries(teamLeave);

      return {
        directReportsCount: reports.length,
        pendingRequestsCount: pendingRequests.length,
        onLeave: onLeaveEntries(teamLeave, today, weekOut),
        pendingRequests,
        birthdays: birthdayEntries(reports, today, 7),
      };
    });
  }
}
